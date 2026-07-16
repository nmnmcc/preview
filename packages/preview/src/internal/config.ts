import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Preview from "./preview";
import * as PreviewSchema from "./schema";

const defaultInclude = ["**/*.preview.{js,jsx,ts,tsx}"];

const Include = Schema.Union([
  Schema.NonEmptyString,
  Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
]);

export const PreviewPluginOptions = Schema.Struct({
  viewports: Schema.Record(
    PreviewSchema.ViewportName,
    Preview.PreviewViewport,
  ).check(Schema.isMinProperties(1)),
  capture: Schema.optionalKey(Preview.CaptureMode),
  include: Schema.optionalKey(Include),
  timeoutMs: Schema.optionalKey(PreviewSchema.PositiveInteger),
});
export interface PreviewPluginOptions
  extends Schema.Schema.Type<typeof PreviewPluginOptions> {}

export const ResolvedPreviewViewport = Schema.Struct({
  name: PreviewSchema.ViewportName,
  width: Preview.PreviewViewport.fields.width,
  height: Preview.PreviewViewport.fields.height,
  deviceScaleFactor: PreviewSchema.PositiveNumber,
});
export interface ResolvedPreviewViewport
  extends Schema.Schema.Type<typeof ResolvedPreviewViewport> {}

export const ResolvedPreviewMetadata = Schema.Struct({
  viewports: Schema.Array(ResolvedPreviewViewport).check(Schema.isMinLength(1)),
  capture: Preview.CaptureMode,
});
export interface ResolvedPreviewMetadata
  extends Schema.Schema.Type<typeof ResolvedPreviewMetadata> {}

export const ResolvedPreviewOptions = Schema.Struct({
  viewports: Schema.Record(
    PreviewSchema.ViewportName,
    ResolvedPreviewViewport,
  ).check(Schema.isMinProperties(1)),
  capture: Preview.CaptureMode,
  include: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  timeoutMs: PreviewSchema.PositiveInteger,
});
export interface ResolvedPreviewOptions
  extends Schema.Schema.Type<typeof ResolvedPreviewOptions> {}

export class PreviewConfigError extends Schema.TaggedErrorClass<PreviewConfigError>(
  "@nmnmcc/preview/PreviewConfigError",
)("PreviewConfigError", {
  detail: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.detail;
  }
}

const configError = (scope: string) =>
  Effect.mapError(
    (cause) =>
      new PreviewConfigError({
        detail: `Invalid ${scope}: ${String(cause)}`,
        cause,
      }),
  );

export const resolvePreviewOptions = Effect.fn("PreviewConfig.resolveOptions")(
  function* (input: unknown) {
    const options = yield* Schema.decodeUnknownEffect(PreviewPluginOptions)(
      input,
    ).pipe(configError("preview options"));

    const viewports: Record<string, ResolvedPreviewViewport> = {};
    for (const [name, viewport] of Object.entries(options.viewports)) {
      viewports[name] = ResolvedPreviewViewport.make({
        name,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      });
    }

    const include = options.include ?? defaultInclude;
    return ResolvedPreviewOptions.make({
      viewports,
      capture: options.capture ?? "viewport",
      include: typeof include === "string" ? [include] : include,
      timeoutMs: options.timeoutMs ?? 30_000,
    });
  },
);

export const resolvePreviewMetadata = Effect.fn(
  "PreviewConfig.resolveMetadata",
)(function* (input: unknown, project: ResolvedPreviewOptions) {
  const metadata = yield* Schema.decodeUnknownEffect(Preview.PreviewMetadata)(
    input === undefined ? {} : input,
  ).pipe(configError("preview metadata"));

  const viewports: Array<ResolvedPreviewViewport> = [];
  if (metadata.viewports === undefined) {
    viewports.push(...Object.values(project.viewports));
  } else {
    for (const [name, override] of Object.entries(metadata.viewports)) {
      const base = project.viewports[name];
      if (override === true) {
        if (base === undefined) {
          return yield* new PreviewConfigError({
            detail: `Preview references unknown viewport "${name}".`,
          });
        }
        viewports.push(base);
        continue;
      }

      const resolved = yield* Schema.decodeUnknownEffect(
        ResolvedPreviewViewport,
      )({
        name,
        width: override.width ?? base?.width,
        height: override.height ?? base?.height,
        deviceScaleFactor:
          override.deviceScaleFactor ?? base?.deviceScaleFactor ?? 1,
      }).pipe(configError(`preview viewport "${name}"`));
      viewports.push(resolved);
    }
  }

  return ResolvedPreviewMetadata.make({
    viewports,
    capture: metadata.capture ?? project.capture,
  });
});
