import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type { PreviewPluginOptions as Options } from "../../../PreviewPlugin";
import * as Preview from "../../preview";
import * as PreviewSchema from "../../schema";

const DefaultInclude = "**/*.preview.{js,jsx,ts,tsx}";
const DefaultOutput = ".preview";
const OutputGlobMagic = /[!*?{}[\]()]|[\u0000-\u001f\u007f]/u;
interface GenerationOptions {
  readonly files?: Options["files"];
  readonly capture: Omit<Options["capture"], "playwright">;
  readonly artifacts?: Options["artifacts"];
}

const Glob = Schema.Union([
  Schema.NonEmptyString,
  Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
]);

const normalizeOutput = (value: string): string =>
  value.replaceAll("\\", "/");

const isOutput = (value: string): boolean => {
  const normalized = normalizeOutput(value);
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    OutputGlobMagic.test(normalized)
  ) {
    return false;
  }
  return normalized
    .split("/")
    .every(
      (segment) =>
        segment.length > 0 && segment !== "." && segment !== "..",
    );
};

export const Output = Schema.NonEmptyString.check(
  Schema.makeFilter(isOutput, {
    expected: "a relative child directory path without Glob syntax",
  }),
);

const PreviewPluginOptions = Schema.Struct({
  files: Schema.optionalKey(
    Schema.Struct({
      include: Schema.optionalKey(Glob),
      exclude: Schema.optionalKey(Glob),
    }),
  ),
  capture: Schema.Struct({
    viewports: Schema.Record(
      PreviewSchema.ViewportName,
      Preview.PreviewViewport,
    ).check(Schema.isMinProperties(1)),
    timeoutMs: Schema.optionalKey(PreviewSchema.PositiveInteger),
  }),
  artifacts: Schema.optionalKey(
    Schema.Struct({
      output: Schema.optionalKey(Output),
      clean: Schema.optionalKey(Schema.Boolean),
      version: Schema.optionalKey(
        Schema.Struct({
          retain: PreviewSchema.PositiveInteger,
        }),
      ),
    }),
  ),
}) satisfies Schema.Codec<GenerationOptions>;

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
});
export interface ResolvedPreviewMetadata
  extends Schema.Schema.Type<typeof ResolvedPreviewMetadata> {}

export const ResolvedPreviewOptions = Schema.Struct({
  viewports: Schema.Record(
    PreviewSchema.ViewportName,
    ResolvedPreviewViewport,
  ).check(Schema.isMinProperties(1)),
  clean: Schema.Boolean,
  include: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  exclude: Schema.Array(Schema.NonEmptyString),
  output: Output,
  timeoutMs: PreviewSchema.PositiveInteger,
  version: Schema.optionalKey(
    Schema.Struct({ retain: PreviewSchema.PositiveInteger }),
  ),
});
export interface ResolvedPreviewOptions
  extends Schema.Schema.Type<typeof ResolvedPreviewOptions> {}

export interface ResolvedGenerationOptions extends ResolvedPreviewOptions {
  readonly cleanOutputs: ReadonlyArray<string>;
}

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
    const options = yield* Schema.decodeUnknownEffect(
      PreviewPluginOptions,
      { onExcessProperty: "error" },
    )(input).pipe(configError("preview options"));

    const viewports: Record<string, ResolvedPreviewViewport> = {};
    for (const [name, viewport] of Object.entries(
      options.capture.viewports,
    )) {
      viewports[name] = ResolvedPreviewViewport.make({
        name,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      });
    }

    const include = options.files?.include ?? DefaultInclude;
    const exclude = options.files?.exclude;
    return ResolvedPreviewOptions.make({
      viewports,
      clean: options.artifacts?.clean ?? false,
      include: typeof include === "string" ? [include] : include,
      exclude:
        exclude === undefined
          ? []
          : typeof exclude === "string"
            ? [exclude]
            : exclude,
      output: normalizeOutput(options.artifacts?.output ?? DefaultOutput),
      timeoutMs: options.capture.timeoutMs ?? 30_000,
      ...(options.artifacts?.version === undefined
        ? {}
        : { version: options.artifacts.version }),
    });
  },
);

export interface Interface {
  readonly options: ResolvedPreviewOptions;
  readonly resolveGeneration: (
    output?: unknown,
  ) => Effect.Effect<ResolvedGenerationOptions, PreviewConfigError>;
}

export class Config extends Context.Service<Config, Interface>()(
  "@nmnmcc/preview/PreviewConfig",
) {}

export const layer = (input: unknown) =>
  Layer.effect(
    Config,
    Effect.gen(function* () {
      const options = yield* resolvePreviewOptions(input);
      const resolveGeneration = Effect.fn(
        "PreviewConfig.resolveGeneration",
      )(function* (output?: unknown) {
        const resolvedOutput =
          output === undefined
            ? options.output
            : normalizeOutput(
                yield* Schema.decodeUnknownEffect(Output)(output).pipe(
                  configError("generation output"),
                ),
              );

        return {
          ...options,
          output: resolvedOutput,
          cleanOutputs: [...new Set([options.output, resolvedOutput])],
        } satisfies ResolvedGenerationOptions;
      });

      return Config.of({ options, resolveGeneration });
    }),
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
  });
});
