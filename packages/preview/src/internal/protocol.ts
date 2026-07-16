import * as Schema from "effect/Schema";
import * as PreviewSchema from "./schema";

export const previewRoute = "/__nmnmcc_preview/";

export const previewStateKey = "__NMM_PREVIEW_STATE__";

export const previewModuleParameter = "module";

export const previewActionParameter = "action";

export const previewVariantParameter = "variant";

export const PreviewAction = Schema.Literals(["probe", "render"]);
export type PreviewAction = typeof PreviewAction.Type;

export const BrowserPreviewTarget = Schema.Struct({
  variant: Schema.optionalKey(PreviewSchema.PreviewVariantName),
  metadata: Schema.Unknown,
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
