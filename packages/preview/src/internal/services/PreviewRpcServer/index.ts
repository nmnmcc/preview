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
import type { Page, Request } from "playwright";
import {
  PreviewRpcBindingName,
  PreviewRpcBindingRequest,
  PreviewRpcBindingResponse,
  PreviewRpcProtocolVersion,
  RpcFromServer as RpcFromServerSchema,
  type PreviewRpcClosedReason,
  type RpcFromServer,
} from "../../rpcs";

export class PreviewRpcTransportError extends Schema.TaggedErrorClass<PreviewRpcTransportError>(
  "@nmnmcc/preview/PreviewRpcTransportError",
)("PreviewRpcTransportError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not ${this.operation}.`;
  }
}

export interface PreviewRpcServerOptions {
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
    options?: PreviewRpcServerOptions,
  ) => Effect.Effect<
    void,
    never,
    | Rpc.ToHandler<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Rpc.ServicesServer<Rpcs>
    | Scope.Scope
  >;
  /** Finds the document that owns an Effect RPC server client. */
  readonly document: (
    serverClientId: number,
  ) => Effect.Effect<Option.Option<DocumentIdentity>>;
  /** Finds the document that currently owns the page. */
  readonly currentDocument: Effect.Effect<Option.Option<DocumentIdentity>>;
  /** Checks that a document still owns the page. */
  readonly isCurrent: (document: DocumentIdentity) => Effect.Effect<boolean>;
  /** Starts a new document epoch and reloads the same Playwright page. */
  readonly reloadCurrentDocument: () => void;
}

/** The typed RPC server attached to one Playwright page. */
export class PreviewRpcServer extends Context.Service<
  PreviewRpcServer,
  Interface
>()("@nmnmcc/preview/PreviewRpcServer") {}

/** The private identity of one main-frame document on a Playwright page. */
export interface DocumentIdentity {
  readonly epoch: number;
  readonly documentId: string;
}

interface ClientSession {
  readonly clientId: number;
  readonly serverClientId: number;
  readonly document: DocumentIdentity;
  readonly responses: Queue.Queue<RpcFromServer, Cause.Done>;
  closedReason: PreviewRpcClosedReason | undefined;
  receiving: boolean;
}

type WriteRequest = Parameters<RpcServer.Protocol["Service"]["run"]>[0];

const transportFailure = (
  operation: string,
  cause: unknown,
): PreviewRpcTransportError =>
  new PreviewRpcTransportError({ operation, cause });

const releaseDisposable = (disposable: {
  readonly dispose: () => Promise<void>;
}): Effect.Effect<void> =>
  Effect.promise(() => disposable.dispose().catch(() => undefined));

export const make = Effect.fnUntraced(function* (
  page: Page,
): Effect.fn.Return<
  PreviewRpcServer["Service"],
  PreviewRpcTransportError,
  Scope.Scope
> {
  const stateLock = yield* Semaphore.make(1);
  const disconnects = yield* Queue.unbounded<number>();
  const sessionsByClientId = new Map<number, ClientSession>();
  const sessionsByServerClientId = new Map<number, ClientSession>();
  let announcedNavigation = 0;
  let appliedNavigation = 0;
  let nextDocumentEpoch = 0;
  let pendingDocumentEpoch: number | undefined;
  let activeDocument: DocumentIdentity | undefined;
  let closedReason: PreviewRpcClosedReason | undefined;
  let nextServerClientId = 0;
  let writeRequest: WriteRequest = () =>
    Effect.die("The Preview RPC server is not running.");

  const toFromClientEncoded = (
    message: (typeof PreviewRpcBindingRequest.cases.Send.Type)["message"],
  ): RpcMessage.FromClientEncoded => {
    if (message._tag !== "Request") return message;
    return {
      ...message,
      headers: message.headers.map(([name, value]): [string, string] => [
        name,
        value,
      ]),
    };
  };

  const closeSession = (
    session: ClientSession,
    reason: PreviewRpcClosedReason,
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
    reason: PreviewRpcClosedReason,
    notifyServer: boolean,
  ): Effect.Effect<void> =>
    Effect.forEach(
      [...sessionsByClientId.values()],
      (session) => closeSession(session, reason, notifyServer),
      { discard: true },
    );

  const sameDocument = (
    left: DocumentIdentity,
    right: DocumentIdentity,
  ): boolean =>
    left.epoch === right.epoch && left.documentId === right.documentId;

  const applyNavigation = (): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (appliedNavigation === announcedNavigation) return;
      appliedNavigation = announcedNavigation;
      pendingDocumentEpoch = nextDocumentEpoch++;
      activeDocument = undefined;
      yield* closeSessions("navigation", true);
    });

  const reconcileNavigation = stateLock.withPermits(1)(applyNavigation());

  const closeTransport = (
    reason: PreviewRpcClosedReason,
  ): Effect.Effect<void> =>
    stateLock.withPermits(1)(
      Effect.gen(function* () {
        if (closedReason !== undefined) return;
        closedReason = reason;
        pendingDocumentEpoch = undefined;
        activeDocument = undefined;
        yield* closeSessions(reason, true);
      }),
    );

  yield* Effect.addFinalizer(() => closeTransport("scope-closed"));

  const accepted = (): PreviewRpcBindingResponse =>
    PreviewRpcBindingResponse.cases.Accepted.make({
      version: PreviewRpcProtocolVersion,
    });

  const rejected = (
    reason: "invalid-message" | "wrong-source" | "stale-document" | "closed",
  ): PreviewRpcBindingResponse =>
    PreviewRpcBindingResponse.cases.Rejected.make({
      version: PreviewRpcProtocolVersion,
      reason,
    });

  const closed = (reason: PreviewRpcClosedReason): PreviewRpcBindingResponse =>
    PreviewRpcBindingResponse.cases.Closed.make({
      version: PreviewRpcProtocolVersion,
      reason,
    });

  const unavailable = (): PreviewRpcBindingResponse =>
    closedReason === undefined
      ? rejected("stale-document")
      : closed(closedReason);

  const connect = (
    documentId: string,
  ): Effect.Effect<PreviewRpcBindingResponse> =>
    stateLock.withPermits(1)(
      Effect.gen(function* () {
        yield* applyNavigation();
        if (closedReason !== undefined) return closed(closedReason);
        if (
          activeDocument !== undefined &&
          activeDocument.documentId === documentId
        ) {
          return accepted();
        }
        if (activeDocument !== undefined) {
          yield* closeSessions("navigation", true);
        }
        activeDocument = {
          epoch: pendingDocumentEpoch ?? nextDocumentEpoch++,
          documentId,
        };
        pendingDocumentEpoch = undefined;
        return accepted();
      }),
    );

  const getSession = (
    documentId: string,
    clientId: number,
  ): Effect.Effect<Option.Option<ClientSession>> =>
    stateLock.withPermits(1)(
      Effect.gen(function* () {
        yield* applyNavigation();
        if (
          closedReason !== undefined ||
          activeDocument === undefined ||
          activeDocument.documentId !== documentId
        ) {
          return Option.none<ClientSession>();
        }
        const current = sessionsByClientId.get(clientId);
        if (
          current !== undefined &&
          sameDocument(current.document, activeDocument)
        ) {
          return Option.some(current);
        }

        const responses = yield* Queue.bounded<RpcFromServer, Cause.Done>(1);
        const session: ClientSession = {
          clientId,
          serverClientId: nextServerClientId++,
          document: activeDocument,
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
    request: typeof PreviewRpcBindingRequest.cases.Send.Type,
  ): Effect.Effect<PreviewRpcBindingResponse> =>
    Effect.gen(function* () {
      const session = yield* getSession(request.documentId, request.clientId);
      if (Option.isNone(session)) return unavailable();
      yield* writeRequest(
        session.value.serverClientId,
        toFromClientEncoded(request.message),
      );
      return accepted();
    });

  const receiveResponse = (
    request: typeof PreviewRpcBindingRequest.cases.Receive.Type,
  ): Effect.Effect<PreviewRpcBindingResponse> =>
    Effect.gen(function* () {
      const session = yield* getSession(request.documentId, request.clientId);
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
          PreviewRpcBindingResponse.cases.Messages.make({
            version: PreviewRpcProtocolVersion,
            messages,
          }),
        ),
        Effect.orElseSucceed(() =>
          closed(session.value.closedReason ?? "protocol-error"),
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
    request: PreviewRpcBindingRequest,
  ): Effect.Effect<PreviewRpcBindingResponse> => {
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
        ): Effect.Effect<void> =>
          Effect.gen(function* () {
            const session = yield* stateLock.withPermits(1)(
              Effect.gen(function* () {
                yield* applyNavigation();
                return sessionsByServerClientId.get(serverClientId);
              }),
            );
            if (session === undefined) return;
            if (response._tag === "ClientProtocolError") {
              return yield* closeSession(session, "protocol-error", false);
            }
            yield* Schema.decodeUnknownEffect(RpcFromServerSchema)(
              response,
            ).pipe(
              Effect.flatMap((message) =>
                Queue.offer(session.responses, message),
              ),
              Effect.catch(() =>
                closeSession(session, "protocol-error", false),
              ),
            );
          }),
        end: (serverClientId: number): Effect.Effect<void> =>
          stateLock.withPermits(1)(
            Effect.gen(function* () {
              yield* applyNavigation();
              const session = sessionsByServerClientId.get(serverClientId);
              if (session !== undefined) {
                yield* closeSession(session, "server-ended", false);
              }
            }),
          ),
        clientIds: stateLock.withPermits(1)(
          Effect.gen(function* () {
            yield* applyNavigation();
            return new Set(sessionsByServerClientId.keys());
          }),
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
          PreviewRpcBindingName,
          (source, input: unknown): Promise<unknown> => {
            if (
              source.page !== page ||
              source.context !== page.context() ||
              source.frame !== page.mainFrame()
            ) {
              return Promise.resolve(rejected("wrong-source"));
            }
            return runPromise(
              Schema.decodeUnknownEffect(PreviewRpcBindingRequest)(input).pipe(
                Effect.matchEffect({
                  onFailure: () => Effect.succeed(rejected("invalid-message")),
                  onSuccess: handleRequest,
                }),
              ),
            );
          },
        ),
      catch: (cause) =>
        transportFailure("expose the Preview RPC binding", cause),
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

  const invalidateCurrentDocument = (): void => {
    if (closedReason !== undefined) return;
    announcedNavigation += 1;
    runFork(reconcileNavigation);
  };

  const reloadCurrentDocument = (): void => {
    invalidateCurrentDocument();
    if (page.url() === "about:blank" || page.isClosed()) return;
    void page.reload({ waitUntil: "commit" }).catch(() => undefined);
  };

  const onRequest = (request: Request): void => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      invalidateCurrentDocument();
    }
  };
  yield* Effect.acquireRelease(
    Effect.sync(() => page.on("request", onRequest)),
    () => Effect.sync(() => page.off("request", onRequest)),
  );

  const serve: Interface["serve"] = (group, options) =>
    RpcServer.make(group, options).pipe(
      Effect.provideService(RpcServer.Protocol, protocol),
      Effect.forkScoped,
      Effect.asVoid,
    );

  const document: Interface["document"] = (serverClientId) =>
    stateLock.withPermits(1)(
      Effect.gen(function* () {
        yield* applyNavigation();
        const session = sessionsByServerClientId.get(serverClientId);
        if (
          session === undefined ||
          activeDocument === undefined ||
          !sameDocument(session.document, activeDocument)
        ) {
          return Option.none<DocumentIdentity>();
        }
        return Option.some(session.document);
      }),
    );

  const currentDocument: Interface["currentDocument"] = stateLock.withPermits(
    1,
  )(
    Effect.gen(function* () {
      yield* applyNavigation();
      return Option.fromUndefinedOr(activeDocument);
    }),
  );

  const isCurrent: Interface["isCurrent"] = (document) =>
    stateLock.withPermits(1)(
      Effect.gen(function* () {
        yield* applyNavigation();
        return (
          activeDocument !== undefined && sameDocument(document, activeDocument)
        );
      }),
    );

  return PreviewRpcServer.of({
    serve,
    document,
    currentDocument,
    isCurrent,
    reloadCurrentDocument,
  });
});

/** Installs the Node and Playwright side of Preview RPC for one page. */
export const layer = (
  page: Page,
): Layer.Layer<PreviewRpcServer, PreviewRpcTransportError> =>
  Layer.effect(PreviewRpcServer, make(page));

/** Installs one typed RPC group for the lifetime of the current scope. */
export const serveLayer = <Rpcs extends Rpc.Any>(
  page: Page,
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: PreviewRpcServerOptions,
): Layer.Layer<
  never,
  PreviewRpcTransportError,
  Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>
> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const server = yield* PreviewRpcServer;
      yield* server.serve(group, options);
    }),
  ).pipe(Layer.provide(layer(page)));
