import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import type * as Rpc from "effect/unstable/rpc/Rpc";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import type * as RpcMessage from "effect/unstable/rpc/RpcMessage";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import type { Page } from "playwright";
import {
  ApplicationRpcBindingRequest,
  ApplicationRpcBindingResponse,
  type ApplicationRpcClosedReason,
  ApplicationRpcProtocolVersion,
  ApplicationRpcStateKey,
  type RpcFromServer,
  RpcFromServer as RpcFromServerSchema,
} from "../../protocol";

export class ApplicationRpcTransportError extends Schema.TaggedErrorClass<ApplicationRpcTransportError>(
  "@nmnmcc/preview/ApplicationRpcTransportError",
)("ApplicationRpcTransportError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not ${this.operation}.`;
  }
}

export interface ApplicationRpcServerOptions {
  readonly disableTracing?: boolean;
  readonly spanPrefix?: string;
  readonly spanAttributes?: Readonly<Record<string, unknown>>;
  readonly concurrency?: number | "unbounded";
  readonly disableFatalDefects?: boolean;
}

export interface Interface {
  /** Starts handlers for a typed Effect RPC group on this page. */
  readonly serve: <Rpcs extends Rpc.Any>(
    group: RpcGroup.RpcGroup<Rpcs>,
    options?: ApplicationRpcServerOptions,
  ) => Effect.Effect<
    void,
    never,
    | Rpc.ToHandler<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Rpc.ServicesServer<Rpcs>
    | Scope.Scope
  >;
}

/** The typed RPC server attached to one Playwright page. */
export class ApplicationRpcServer extends Context.Service<
  ApplicationRpcServer,
  Interface
>()("@nmnmcc/preview/ApplicationRpcServer") {}

interface ClientSession {
  readonly clientId: number;
  readonly serverClientId: number;
  readonly responses: Queue.Queue<RpcFromServer, Cause.Done>;
  closedReason: ApplicationRpcClosedReason | undefined;
  receiving: boolean;
}

type WriteRequest = Parameters<
  RpcServer.Protocol["Service"]["run"]
>[0];

const transportFailure = (
  operation: string,
  cause: unknown,
): ApplicationRpcTransportError =>
  new ApplicationRpcTransportError({ operation, cause });

const releaseDisposable = (disposable: {
  readonly dispose: () => Promise<void>;
}): Effect.Effect<void> =>
  Effect.promise(() => disposable.dispose().catch(() => undefined));

const makeApplicationRpcServer = Effect.fnUntraced(
  function* (
    page: Page,
  ): Effect.fn.Return<
    ApplicationRpcServer["Service"],
    ApplicationRpcTransportError,
    Scope.Scope
  > {
    const bindingName = `__nmnmcc_preview_rpc_${globalThis.crypto
      .randomUUID()
      .replaceAll("-", "")}`;
    const channelId = globalThis.crypto.randomUUID();
    const stateLock = yield* Semaphore.make(1);
    const disconnects = yield* Queue.unbounded<number>();
    const sessionsByClientId = new Map<number, ClientSession>();
    const sessionsByServerClientId = new Map<number, ClientSession>();
    let activeDocumentId: string | undefined;
    let closedReason: ApplicationRpcClosedReason | undefined;
    let nextServerClientId = 0;
    let writeRequest: WriteRequest = () =>
      Effect.die("The application RPC server is not running.");

    const toFromClientEncoded = (
      message: typeof ApplicationRpcBindingRequest.cases.Send.Type["message"],
    ): RpcMessage.FromClientEncoded => {
      if (message._tag !== "Request") return message;
      return {
        ...message,
        headers: message.headers.map(
          ([name, value]): [string, string] => [name, value],
        ),
      };
    };

    const closeSession = (
      session: ClientSession,
      reason: ApplicationRpcClosedReason,
      notifyServer: boolean,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (session.closedReason !== undefined) return;
        session.closedReason = reason;
        sessionsByClientId.delete(session.clientId);
        sessionsByServerClientId.delete(session.serverClientId);
        yield* Queue.end(session.responses);
        if (notifyServer) {
          yield* Queue.offer(disconnects, session.serverClientId);
        }
      });

    const closeSessions = (
      reason: ApplicationRpcClosedReason,
      notifyServer: boolean,
    ): Effect.Effect<void> =>
      Effect.forEach(
        [...sessionsByClientId.values()],
        (session) => closeSession(session, reason, notifyServer),
        { discard: true },
      );

    const closeTransport = (
      reason: ApplicationRpcClosedReason,
    ): Effect.Effect<void> =>
      stateLock.withPermits(1)(
        Effect.gen(function* () {
          if (closedReason !== undefined) return;
          closedReason = reason;
          activeDocumentId = undefined;
          yield* closeSessions(reason, true);
        }),
      );

    yield* Effect.addFinalizer(() => closeTransport("scope-closed"));

    const accepted = (): ApplicationRpcBindingResponse =>
      ApplicationRpcBindingResponse.cases.Accepted.make({
        version: ApplicationRpcProtocolVersion,
      });

    const rejected = (
      reason:
        | "invalid-message"
        | "wrong-channel"
        | "wrong-source"
        | "stale-document"
        | "closed",
    ): ApplicationRpcBindingResponse =>
      ApplicationRpcBindingResponse.cases.Rejected.make({
        version: ApplicationRpcProtocolVersion,
        reason,
      });

    const closed = (
      reason: ApplicationRpcClosedReason,
    ): ApplicationRpcBindingResponse =>
      ApplicationRpcBindingResponse.cases.Closed.make({
        version: ApplicationRpcProtocolVersion,
        reason,
      });

    const unavailable = (): ApplicationRpcBindingResponse =>
      closedReason === undefined
        ? rejected("stale-document")
        : closed(closedReason);

    const connect = (
      documentId: string,
    ): Effect.Effect<ApplicationRpcBindingResponse> =>
      stateLock.withPermits(1)(
        Effect.gen(function* () {
          if (closedReason !== undefined) return closed(closedReason);
          if (
            activeDocumentId !== undefined &&
            activeDocumentId !== documentId
          ) {
            yield* closeSessions("navigation", true);
          }
          activeDocumentId = documentId;
          return accepted();
        }),
      );

    const getSession = (
      documentId: string,
      clientId: number,
    ): Effect.Effect<Option.Option<ClientSession>> =>
      stateLock.withPermits(1)(
        Effect.gen(function* () {
          if (
            closedReason !== undefined ||
            activeDocumentId !== documentId
          ) {
            return Option.none<ClientSession>();
          }
          const current = sessionsByClientId.get(clientId);
          if (current !== undefined) return Option.some(current);

          const responses = yield* Queue.bounded<
            RpcFromServer,
            Cause.Done
          >(1);
          const session: ClientSession = {
            clientId,
            serverClientId: nextServerClientId++,
            responses,
            closedReason: undefined,
            receiving: false,
          };
          sessionsByClientId.set(clientId, session);
          sessionsByServerClientId.set(session.serverClientId, session);
          return Option.some(session);
        }),
      );

    const sendRequest = (
      request: typeof ApplicationRpcBindingRequest.cases.Send.Type,
    ): Effect.Effect<ApplicationRpcBindingResponse> =>
      Effect.gen(function* () {
        const session = yield* getSession(
          request.documentId,
          request.clientId,
        );
        if (Option.isNone(session)) return unavailable();
        yield* writeRequest(
          session.value.serverClientId,
          toFromClientEncoded(request.message),
        );
        return accepted();
      });

    const receiveResponse = (
      request: typeof ApplicationRpcBindingRequest.cases.Receive.Type,
    ): Effect.Effect<ApplicationRpcBindingResponse> =>
      Effect.gen(function* () {
        const session = yield* getSession(
          request.documentId,
          request.clientId,
        );
        if (Option.isNone(session)) return unavailable();

        const canReceive = yield* stateLock.withPermits(1)(
          Effect.sync(() => {
            if (session.value.receiving) return false;
            session.value.receiving = true;
            return true;
          }),
        );
        if (!canReceive) return rejected("invalid-message");

        return yield* Queue.takeAll(session.value.responses).pipe(
          Effect.map((messages) =>
            ApplicationRpcBindingResponse.cases.Messages.make({
              version: ApplicationRpcProtocolVersion,
              messages,
            }),
          ),
          Effect.orElseSucceed(() =>
            closed(
              session.value.closedReason ?? "protocol-error",
            ),
          ),
          Effect.ensuring(
            stateLock.withPermits(1)(
              Effect.sync(() => {
                session.value.receiving = false;
              }),
            ),
          ),
        );
      });

    const handleRequest = (
      request: ApplicationRpcBindingRequest,
    ): Effect.Effect<ApplicationRpcBindingResponse> => {
      if (request.channelId !== channelId) {
        return Effect.succeed(rejected("wrong-channel"));
      }
      switch (request._tag) {
        case "Connect":
          return connect(request.documentId);
        case "Send":
          return sendRequest(request);
        case "Receive":
          return receiveResponse(request);
      }
    };

    const protocol = yield* RpcServer.Protocol.make((write) =>
      Effect.sync(() => {
        writeRequest = write;
        return {
          disconnects,
          send: (
            serverClientId: number,
            response: RpcMessage.FromServerEncoded,
          ): Effect.Effect<void> => {
            const session = sessionsByServerClientId.get(serverClientId);
            if (session === undefined) return Effect.void;
            if (response._tag === "ClientProtocolError") {
              return closeSession(
                session,
                "protocol-error",
                false,
              );
            }
            return Schema.decodeUnknownEffect(RpcFromServerSchema)(
              response,
            ).pipe(
              Effect.flatMap((message) =>
                Queue.offer(session.responses, message),
              ),
              Effect.catch(() =>
                closeSession(
                  session,
                  "protocol-error",
                  false,
                ),
              ),
            );
          },
          end: (serverClientId: number): Effect.Effect<void> => {
            const session = sessionsByServerClientId.get(serverClientId);
            return session === undefined
              ? Effect.void
              : closeSession(session, "server-ended", false);
          },
          clientIds: Effect.sync(
            () => new Set(sessionsByServerClientId.keys()),
          ),
          initialMessage: Effect.succeedNone,
          supportsAck: true,
          supportsTransferables: false,
          supportsSpanPropagation: true,
        };
      }),
    );

    const context = yield* Effect.context<never>();
    const runPromise = Effect.runPromiseWith(context);
    const runFork = Effect.runForkWith(context);

    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          page.exposeBinding(
            bindingName,
            (source, input: unknown): Promise<unknown> => {
              if (
                source.page !== page ||
                source.context !== page.context() ||
                source.frame !== page.mainFrame()
              ) {
                return Promise.resolve(rejected("wrong-source"));
              }
              return runPromise(
                Schema.decodeUnknownEffect(
                  ApplicationRpcBindingRequest,
                )(input).pipe(
                  Effect.matchEffect({
                    onFailure: () =>
                      Effect.succeed(rejected("invalid-message")),
                    onSuccess: handleRequest,
                  }),
                ),
              );
            },
          ),
        catch: (cause) =>
          transportFailure("expose the application RPC binding", cause),
      }),
      releaseDisposable,
    );

    yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          page.addInitScript(
            ({
              bindingName,
              channelId,
              stateKey,
              version,
            }) => {
              if (globalThis.top !== globalThis.window) return;
              const documentId = globalThis.crypto.randomUUID();
              const bootstrap = {
                version,
                bindingName,
                channelId,
                documentId,
              };
              const exposed = Reflect.get(globalThis, bindingName);
              const connected =
                typeof exposed === "function"
                  ? Promise.resolve(
                      exposed({
                        _tag: "Connect",
                        version,
                        channelId,
                        documentId,
                      }),
                    )
                  : Promise.reject(
                      new Error("The application RPC binding is missing."),
                    );
              void connected.catch(() => undefined);
              Reflect.set(
                globalThis,
                Symbol.for(stateKey),
                { bootstrap, connected },
              );
            },
            {
              bindingName,
              channelId,
              stateKey: ApplicationRpcStateKey,
              version: ApplicationRpcProtocolVersion,
            },
          ),
        catch: (cause) =>
          transportFailure(
            "install the application RPC bootstrap",
            cause,
          ),
      }),
      releaseDisposable,
    );

    const onPageClose = (): void => {
      runFork(closeTransport("page-closed"));
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => page.on("close", onPageClose)),
      () => Effect.sync(() => page.off("close", onPageClose)),
    );

    const serve: Interface["serve"] = (group, options) =>
      RpcServer.make(group, options).pipe(
        Effect.provideService(RpcServer.Protocol, protocol),
        Effect.forkScoped,
        Effect.asVoid,
      );

    return ApplicationRpcServer.of({ serve });
  },
);

/** Installs the Node and Playwright side of Application RPC for one page. */
export const layer = (
  page: Page,
): Layer.Layer<
  ApplicationRpcServer,
  ApplicationRpcTransportError
> => Layer.effect(ApplicationRpcServer, makeApplicationRpcServer(page));
