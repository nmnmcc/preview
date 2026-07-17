import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as Protocol from "./protocol";
import * as PreviewSchema from "./schema";

export const PreviewRpcBindingName = "__nmnmcc_preview_rpc__";

export const PreviewRpcProtocolVersion = 1;

const RpcMessageId = Schema.Union([Schema.String, Schema.Int]);

export const RpcClientId = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const RpcHeaders = Schema.Array(Schema.Tuple([Schema.String, Schema.String]));

const RpcExitCause = Schema.TaggedUnion({
  Fail: { error: Schema.Unknown },
  Die: { defect: Schema.Unknown },
  Interrupt: { fiberId: Schema.UndefinedOr(Schema.Int) },
});

const RpcExit = Schema.TaggedUnion({
  Success: { value: Schema.Unknown },
  Failure: { cause: Schema.Array(RpcExitCause) },
});

export const RpcFromClient = Schema.TaggedUnion({
  Request: {
    id: RpcMessageId,
    tag: Schema.String,
    payload: Schema.Unknown,
    headers: RpcHeaders,
    traceId: Schema.optionalKey(Schema.String),
    spanId: Schema.optionalKey(Schema.String),
    sampled: Schema.optionalKey(Schema.Boolean),
  },
  Ack: { requestId: RpcMessageId },
  Interrupt: { requestId: RpcMessageId },
  Ping: {},
  Eof: {},
});
export type RpcFromClient = typeof RpcFromClient.Type;

export const RpcFromServer = Schema.TaggedUnion({
  Chunk: {
    requestId: RpcMessageId,
    values: Schema.NonEmptyArray(Schema.Unknown),
  },
  Exit: {
    requestId: RpcMessageId,
    exit: RpcExit,
  },
  Defect: { defect: Schema.Unknown },
  Pong: {},
});
export type RpcFromServer = typeof RpcFromServer.Type;

const PreviewRpcRequestFields = {
  version: Schema.Literal(PreviewRpcProtocolVersion),
  documentId: Schema.NonEmptyString,
};

export const PreviewRpcBindingRequest = Schema.TaggedUnion({
  Connect: PreviewRpcRequestFields,
  Send: {
    ...PreviewRpcRequestFields,
    clientId: RpcClientId,
    message: RpcFromClient,
  },
  Receive: {
    ...PreviewRpcRequestFields,
    clientId: RpcClientId,
  },
});
export type PreviewRpcBindingRequest = typeof PreviewRpcBindingRequest.Type;

export const PreviewRpcRejectionReason = Schema.Literals([
  "invalid-message",
  "wrong-source",
  "stale-document",
  "closed",
]);
export type PreviewRpcRejectionReason = typeof PreviewRpcRejectionReason.Type;

export const PreviewRpcClosedReason = Schema.Literals([
  "navigation",
  "page-closed",
  "scope-closed",
  "server-ended",
  "protocol-error",
]);
export type PreviewRpcClosedReason = typeof PreviewRpcClosedReason.Type;

const PreviewRpcResponseFields = {
  version: Schema.Literal(PreviewRpcProtocolVersion),
};

export const PreviewRpcBindingResponse = Schema.TaggedUnion({
  Accepted: PreviewRpcResponseFields,
  Messages: {
    ...PreviewRpcResponseFields,
    messages: Schema.NonEmptyArray(RpcFromServer),
  },
  Rejected: {
    ...PreviewRpcResponseFields,
    reason: PreviewRpcRejectionReason,
  },
  Closed: {
    ...PreviewRpcResponseFields,
    reason: PreviewRpcClosedReason,
  },
});
export type PreviewRpcBindingResponse = typeof PreviewRpcBindingResponse.Type;

export const SandboxPreviewRequest = Schema.TaggedUnion({
  Probe: {
    moduleUrl: Schema.NonEmptyString,
  },
  Render: {
    moduleUrl: Schema.NonEmptyString,
    variant: Schema.optionalKey(PreviewSchema.PreviewVariantName),
  },
});
export type SandboxPreviewRequest = typeof SandboxPreviewRequest.Type;

export class SandboxPreviewError extends Schema.TaggedErrorClass<SandboxPreviewError>(
  "@nmnmcc/preview/SandboxPreviewError",
)("SandboxPreviewError", {
  detail: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.detail;
  }
}

export const SandboxPreviewExit = Schema.Exit(
  Protocol.BrowserPreviewResult,
  SandboxPreviewError,
  Schema.Defect(),
);
export type SandboxPreviewExit = typeof SandboxPreviewExit.Type;

export class SandboxRequest extends Rpc.make("SandboxRequest", {
  success: SandboxPreviewRequest,
}) {}

export class SandboxComplete extends Rpc.make("SandboxComplete", {
  payload: { exit: SandboxPreviewExit },
}) {}

export class SandboxAwaitDispose extends Rpc.make("SandboxAwaitDispose") {}

export class SandboxDisposed extends Rpc.make("SandboxDisposed") {}

export class SandboxRpcs extends RpcGroup.make(
  SandboxRequest,
  SandboxComplete,
  SandboxAwaitDispose,
  SandboxDisposed,
) {}

export const ApplicationReadyCodeSignature = "@nmnmcc/preview/PreviewRpcClient";

export class ApplicationReady extends Rpc.make("ApplicationReady") {}

export class ApplicationRpcs extends RpcGroup.make(ApplicationReady) {}

/** All RPCs that a Preview browser document can send. */
export class PreviewRpcs extends RpcGroup.make(
  SandboxRequest,
  SandboxComplete,
  SandboxAwaitDispose,
  SandboxDisposed,
  ApplicationReady,
) {}
