import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import {
  RpcClientDefect,
  RpcClientError,
} from "effect/unstable/rpc/RpcClientError";
import type * as RpcMessage from "effect/unstable/rpc/RpcMessage";
import {
  ApplicationReadyCodeSignature,
  PreviewRpcBindingName,
  PreviewRpcBindingRequest,
  PreviewRpcBindingResponse,
  PreviewRpcProtocolVersion,
  PreviewRpcs,
} from "../../../rpcs";

type BindingFunction = (...args: ReadonlyArray<unknown>) => unknown;

const PreviewRpcBindingFunction = Schema.declare<BindingFunction>(
  (input): input is BindingFunction => typeof input === "function",
);

interface ActiveBinding {
  readonly binding: BindingFunction;
}

const DocumentId = globalThis.crypto.randomUUID();
let connected: Promise<unknown> | undefined;

const rpcClientError = (message: string, cause: unknown): RpcClientError =>
  new RpcClientError({
    reason: new RpcClientDefect({ message, cause }),
  });

const decodeBindingResponse = (
  input: unknown,
): Effect.Effect<PreviewRpcBindingResponse, RpcClientError> =>
  Schema.decodeUnknownEffect(PreviewRpcBindingResponse)(input).pipe(
    Effect.mapError((cause) =>
      rpcClientError("The Preview RPC response is invalid.", cause),
    ),
  );

const responseError = (response: PreviewRpcBindingResponse): RpcClientError =>
  rpcClientError(
    response._tag === "Rejected"
      ? `The Preview RPC request was rejected: ${response.reason}.`
      : response._tag === "Closed"
        ? `The Preview RPC transport closed: ${response.reason}.`
        : `The Preview RPC transport returned ${response._tag} at the wrong time.`,
    response,
  );

const activeBinding = Effect.fnUntraced(function* (): Effect.fn.Return<
  ActiveBinding,
  RpcClientError
> {
  const binding = yield* Schema.decodeUnknownEffect(PreviewRpcBindingFunction)(
    Reflect.get(globalThis, PreviewRpcBindingName),
  ).pipe(
    Effect.mapError((cause) =>
      rpcClientError("The Preview RPC binding is missing.", cause),
    ),
  );
  const connection = yield* Effect.tryPromise({
    try: () =>
      (connected ??= Promise.resolve(
        binding({
          _tag: "Connect",
          version: PreviewRpcProtocolVersion,
          documentId: DocumentId,
        }),
      )),
    catch: (cause) =>
      rpcClientError("The Preview RPC connection failed.", cause),
  });
  const connectedResponse = yield* decodeBindingResponse(connection);
  if (connectedResponse._tag !== "Accepted") {
    return yield* responseError(connectedResponse);
  }
  return { binding };
});

const invoke = Effect.fnUntraced(function* (
  binding: BindingFunction,
  request: PreviewRpcBindingRequest,
): Effect.fn.Return<PreviewRpcBindingResponse, RpcClientError> {
  const input = yield* Effect.tryPromise({
    try: () => Promise.resolve(binding(request)),
    catch: (cause) =>
      rpcClientError("The Preview RPC binding call failed.", cause),
  });
  return yield* decodeBindingResponse(input);
});

const bindingRequest = <A extends PreviewRpcBindingRequest>(
  request: A,
): Effect.Effect<PreviewRpcBindingRequest, RpcClientError> =>
  Schema.decodeUnknownEffect(PreviewRpcBindingRequest)(request).pipe(
    Effect.mapError((cause) =>
      rpcClientError("The Preview RPC request is invalid.", cause),
    ),
  );

const send = Effect.fnUntraced(function* (
  clientId: number,
  message: RpcMessage.FromClientEncoded,
): Effect.fn.Return<void, RpcClientError> {
  const { binding } = yield* activeBinding();
  const request = yield* bindingRequest({
    _tag: "Send",
    version: PreviewRpcProtocolVersion,
    documentId: DocumentId,
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
    const { binding } = yield* activeBinding();
    const request = yield* bindingRequest({
      _tag: "Receive",
      version: PreviewRpcProtocolVersion,
      documentId: DocumentId,
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

const PreviewRpcProtocol = RpcClient.Protocol.of({
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

/** The typed RPC client available inside a Preview browser document. */
export class PreviewRpcClient extends Context.Service<
  PreviewRpcClient,
  RpcClient.FromGroup<typeof PreviewRpcs, RpcClientError>
>()(ApplicationReadyCodeSignature) {}

/** Provides the browser transport used by Effect RPC clients. */
export const protocol = Layer.succeed(RpcClient.Protocol, PreviewRpcProtocol);

/** Provides the browser side of Preview RPC. */
export const layer = Layer.effect(
  PreviewRpcClient,
  RpcClient.make(PreviewRpcs),
).pipe(Layer.provide(protocol));
