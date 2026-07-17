import * as Schema from "effect/Schema";
import * as PreviewSchema from "./schema";

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
export type BrowserPreviewTargetType = typeof BrowserPreviewTargetType.Type;

export const BrowserPreviewTarget = Schema.Struct({
  variant: Schema.optionalKey(PreviewSchema.PreviewVariantName),
  metadata: Schema.Unknown,
  target: BrowserPreviewTargetType,
});
export interface BrowserPreviewTarget extends Schema.Schema.Type<
  typeof BrowserPreviewTarget
> {}

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
