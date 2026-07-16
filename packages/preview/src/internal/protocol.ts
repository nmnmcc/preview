import * as Schema from "effect/Schema";
import * as PreviewSchema from "./schema";

export const ApplicationReadyStateKey =
  "@nmnmcc/preview/application-ready";

export const ApplicationReadyStateVersion = 1;

export const ApplicationRpcStateKey =
  "@nmnmcc/preview/application-rpc";

export const ApplicationRpcProtocolVersion = 1;

const RpcMessageId = Schema.Union([Schema.String, Schema.Int]);

export const RpcClientId = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
);

const RpcHeaders = Schema.Array(
  Schema.Tuple([Schema.String, Schema.String]),
);

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

export const ApplicationRpcBootstrap = Schema.Struct({
  version: Schema.Literal(ApplicationRpcProtocolVersion),
  bindingName: Schema.NonEmptyString,
  channelId: Schema.NonEmptyString,
  documentId: Schema.NonEmptyString,
});
export interface ApplicationRpcBootstrap
  extends Schema.Schema.Type<typeof ApplicationRpcBootstrap> {}

const ApplicationRpcRequestFields = {
  version: Schema.Literal(ApplicationRpcProtocolVersion),
  channelId: Schema.NonEmptyString,
  documentId: Schema.NonEmptyString,
};

export const ApplicationRpcBindingRequest = Schema.TaggedUnion({
  Connect: ApplicationRpcRequestFields,
  Send: {
    ...ApplicationRpcRequestFields,
    clientId: RpcClientId,
    message: RpcFromClient,
  },
  Receive: {
    ...ApplicationRpcRequestFields,
    clientId: RpcClientId,
  },
});
export type ApplicationRpcBindingRequest =
  typeof ApplicationRpcBindingRequest.Type;

export const ApplicationRpcRejectionReason = Schema.Literals([
  "invalid-message",
  "wrong-channel",
  "wrong-source",
  "stale-document",
  "closed",
]);
export type ApplicationRpcRejectionReason =
  typeof ApplicationRpcRejectionReason.Type;

export const ApplicationRpcClosedReason = Schema.Literals([
  "navigation",
  "page-closed",
  "scope-closed",
  "server-ended",
  "protocol-error",
]);
export type ApplicationRpcClosedReason =
  typeof ApplicationRpcClosedReason.Type;

const ApplicationRpcResponseFields = {
  version: Schema.Literal(ApplicationRpcProtocolVersion),
};

export const ApplicationRpcBindingResponse = Schema.TaggedUnion({
  Accepted: ApplicationRpcResponseFields,
  Messages: {
    ...ApplicationRpcResponseFields,
    messages: Schema.NonEmptyArray(RpcFromServer),
  },
  Rejected: {
    ...ApplicationRpcResponseFields,
    reason: ApplicationRpcRejectionReason,
  },
  Closed: {
    ...ApplicationRpcResponseFields,
    reason: ApplicationRpcClosedReason,
  },
});
export type ApplicationRpcBindingResponse =
  typeof ApplicationRpcBindingResponse.Type;

export const PreviewRoute = "/__nmnmcc_preview/";

export const PreviewStateKey = "__NMM_PREVIEW_STATE__";

export const PreviewDisposeKey = "__NMM_PREVIEW_DISPOSE__";

export const PreviewModuleParameter = "module";

export const PreviewActionParameter = "action";

export const PreviewVariantParameter = "variant";

export const PreviewAction = Schema.Literals(["probe", "render"]);
export type PreviewAction = typeof PreviewAction.Type;

export const BrowserSandboxTarget = Schema.Struct({
  type: Schema.tag("sandbox"),
});

export const BrowserApplicationTarget = Schema.Struct({
  type: Schema.tag("application"),
  location: Schema.NonEmptyString,
});

export const BrowserPreviewTargetType = Schema.Union([
  BrowserSandboxTarget,
  BrowserApplicationTarget,
]).pipe(Schema.toTaggedUnion("type"));
export type BrowserPreviewTargetType =
  typeof BrowserPreviewTargetType.Type;

export const BrowserPreviewTarget = Schema.Struct({
  variant: Schema.optionalKey(PreviewSchema.PreviewVariantName),
  metadata: Schema.Unknown,
  target: BrowserPreviewTargetType,
});
export interface BrowserPreviewTarget
  extends Schema.Schema.Type<typeof BrowserPreviewTarget> {}

export const BrowserPreviewProbeResult = Schema.Struct({
  type: Schema.tag("probe"),
  targets: Schema.Array(BrowserPreviewTarget).check(Schema.isMinLength(1)),
});

export const BrowserPreviewRenderResult = Schema.Struct({
  type: Schema.tag("render"),
});

export const BrowserPreviewResult = Schema.Union([
  BrowserPreviewProbeResult,
  BrowserPreviewRenderResult,
]).pipe(Schema.toTaggedUnion("type"));
export type BrowserPreviewResult = typeof BrowserPreviewResult.Type;

export const BrowserPreviewLoading = Schema.Struct({
  status: Schema.tag("loading"),
});

export const BrowserPreviewReady = Schema.Struct({
  status: Schema.tag("ready"),
  result: BrowserPreviewResult,
});

export const BrowserPreviewError = Schema.Struct({
  status: Schema.tag("error"),
  error: Schema.String,
});

export const BrowserPreviewTerminalState = Schema.Union([
  BrowserPreviewReady,
  BrowserPreviewError,
]).pipe(Schema.toTaggedUnion("status"));

export const BrowserPreviewState = Schema.Union([
  BrowserPreviewLoading,
  BrowserPreviewReady,
  BrowserPreviewError,
]).pipe(Schema.toTaggedUnion("status"));

export type BrowserPreviewState = typeof BrowserPreviewState.Type;

export type BrowserPreviewReady = typeof BrowserPreviewReady.Type;

export const BrowserApplicationReady = Schema.Struct({
  version: Schema.Literal(ApplicationReadyStateVersion),
  status: Schema.tag("ready"),
});
export type BrowserApplicationReady =
  typeof BrowserApplicationReady.Type;
