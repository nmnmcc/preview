import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import type * as Rpc from "effect/unstable/rpc/Rpc";
import type * as RpcMessage from "effect/unstable/rpc/RpcMessage";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import {
  RpcClientDefect,
  RpcClientError,
} from "effect/unstable/rpc/RpcClientError";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import {
  ApplicationRpcBindingRequest,
  ApplicationRpcBindingResponse,
  ApplicationRpcBootstrap,
  ApplicationRpcStateKey,
} from "../../../protocol";

type BindingFunction = (...args: ReadonlyArray<unknown>) => unknown;

const ApplicationRpcBindingFunction = Schema.declare<BindingFunction>(
  (input): input is BindingFunction => typeof input === "function",
);

const ApplicationRpcRuntimeState = Schema.Struct({
  bootstrap: ApplicationRpcBootstrap,
  connected: Schema.Unknown,
});
interface ApplicationRpcRuntimeState
  extends Schema.Schema.Type<typeof ApplicationRpcRuntimeState> {}

interface ActiveBinding {
  readonly bootstrap: ApplicationRpcBootstrap;
  readonly binding: BindingFunction;
}

const rpcClientError = (
  message: string,
  cause: unknown,
): RpcClientError =>
  new RpcClientError({
    reason: new RpcClientDefect({ message, cause }),
  });

const decodeRuntimeState = (): Effect.Effect<
  ApplicationRpcRuntimeState,
  RpcClientError
> =>
  Schema.decodeUnknownEffect(ApplicationRpcRuntimeState)(
    Reflect.get(globalThis, Symbol.for(ApplicationRpcStateKey)),
  ).pipe(
    Effect.mapError((cause) =>
      rpcClientError(
        "The application RPC transport is not active.",
        cause,
      ),
    ),
  );

const decodeBindingResponse = (
  input: unknown,
): Effect.Effect<
  ApplicationRpcBindingResponse,
  RpcClientError
> =>
  Schema.decodeUnknownEffect(ApplicationRpcBindingResponse)(input).pipe(
    Effect.mapError((cause) =>
      rpcClientError("The application RPC response is invalid.", cause),
    ),
  );

const responseError = (
  response: ApplicationRpcBindingResponse,
): RpcClientError =>
  rpcClientError(
    response._tag === "Rejected"
      ? `The application RPC request was rejected: ${response.reason}.`
      : response._tag === "Closed"
        ? `The application RPC transport closed: ${response.reason}.`
        : `The application RPC transport returned ${response._tag} at the wrong time.`,
    response,
  );

const activeBinding = Effect.fnUntraced(function* (): Effect.fn.Return<
  ActiveBinding,
  RpcClientError
> {
  const state = yield* decodeRuntimeState();
  const connected = yield* Effect.tryPromise({
    try: () => Promise.resolve(state.connected),
    catch: (cause) =>
      rpcClientError("The application RPC connection failed.", cause),
  });
  const connectedResponse = yield* decodeBindingResponse(connected);
  if (connectedResponse._tag !== "Accepted") {
    return yield* responseError(connectedResponse);
  }

  const binding = yield* Schema.decodeUnknownEffect(
    ApplicationRpcBindingFunction,
  )(Reflect.get(globalThis, state.bootstrap.bindingName)).pipe(
    Effect.mapError((cause) =>
      rpcClientError("The application RPC binding is missing.", cause),
    ),
  );
  return { bootstrap: state.bootstrap, binding };
});

const invoke = Effect.fnUntraced(function* (
  binding: BindingFunction,
  request: ApplicationRpcBindingRequest,
): Effect.fn.Return<
  ApplicationRpcBindingResponse,
  RpcClientError
> {
  const input = yield* Effect.tryPromise({
    try: () => Promise.resolve(binding(request)),
    catch: (cause) =>
      rpcClientError("The application RPC binding call failed.", cause),
  });
  return yield* decodeBindingResponse(input);
});

const bindingRequest = <A extends ApplicationRpcBindingRequest>(
  request: A,
): Effect.Effect<ApplicationRpcBindingRequest, RpcClientError> =>
  Schema.decodeUnknownEffect(ApplicationRpcBindingRequest)(request).pipe(
    Effect.mapError((cause) =>
      rpcClientError("The application RPC request is invalid.", cause),
    ),
  );

const send = Effect.fnUntraced(function* (
  clientId: number,
  message: RpcMessage.FromClientEncoded,
): Effect.fn.Return<void, RpcClientError> {
  const { binding, bootstrap } = yield* activeBinding();
  const request = yield* bindingRequest({
    _tag: "Send",
    version: bootstrap.version,
    channelId: bootstrap.channelId,
    documentId: bootstrap.documentId,
    clientId,
    message,
  });
  const response = yield* invoke(binding, request);
  if (response._tag !== "Accepted") {
    return yield* responseError(response);
  }
});

const receive = (
  clientId: number,
  writeResponse: (
    response: RpcMessage.FromServerEncoded,
  ) => Effect.Effect<void>,
): Effect.Effect<void, RpcClientError> =>
  Effect.gen(function* () {
    const { binding, bootstrap } = yield* activeBinding();
    const request = yield* bindingRequest({
      _tag: "Receive",
      version: bootstrap.version,
      channelId: bootstrap.channelId,
      documentId: bootstrap.documentId,
      clientId,
    });
    const response = yield* invoke(binding, request);
    if (response._tag !== "Messages") {
      return yield* responseError(response);
    }
    yield* Effect.forEach(response.messages, writeResponse, {
      discard: true,
    });
  });

const ApplicationRpcProtocol = RpcClient.Protocol.of({
  supportsAck: true,
  supportsTransferables: false,
  send,
  run: (clientId, writeResponse) =>
    Effect.forever(receive(clientId, writeResponse)).pipe(
      Effect.catch((error) =>
        writeResponse({
          _tag: "ClientProtocolError",
          error,
        }).pipe(Effect.andThen(Effect.never)),
      ),
    ),
});

export interface ApplicationRpcClientOptions {
  readonly spanPrefix?: string;
  readonly spanAttributes?: Readonly<Record<string, unknown>>;
  readonly generateRequestId?: () => RpcMessage.RequestId;
  readonly disableTracing?: boolean;
}

export interface Interface {
  /** Connects a typed Effect RPC group to the active Application document. */
  readonly connect: <Rpcs extends Rpc.Any>(
    group: RpcGroup.RpcGroup<Rpcs>,
    options?: ApplicationRpcClientOptions,
  ) => Effect.Effect<
    RpcClient.RpcClient<Rpcs, RpcClientError>,
    never,
    Rpc.MiddlewareClient<Rpcs> | Scope.Scope
  >;
}

/** The typed RPC client available inside an Application Preview document. */
export class ApplicationRpcClient extends Context.Service<
  ApplicationRpcClient,
  Interface
>()("@nmnmcc/preview/ApplicationRpcClient") {}

/** Provides the browser-side Application RPC client. */
export const layer: Layer.Layer<ApplicationRpcClient> = Layer.succeed(
  ApplicationRpcClient,
  ApplicationRpcClient.of({
    connect: (group, options) =>
      RpcClient.make(group, options).pipe(
        Effect.provideService(
          RpcClient.Protocol,
          ApplicationRpcProtocol,
        ),
      ),
  }),
);
