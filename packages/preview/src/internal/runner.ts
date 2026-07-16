import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  type PreviewCollection,
  PreviewDefinition,
  type PreviewDone,
  type PreviewExport,
  PreviewExportSchema,
} from "./preview";
import * as Protocol from "./protocol";
import * as PreviewSchema from "./schema";

const PreviewModule = Schema.Struct({
  default: PreviewExportSchema,
});

const PreviewRequest = Schema.Struct({
  action: Protocol.PreviewAction,
  moduleUrl: Schema.NonEmptyString,
  variant: Schema.optionalKey(PreviewSchema.PreviewVariantName),
});
interface PreviewRequest
  extends Schema.Schema.Type<typeof PreviewRequest> {}

class PreviewRunnerError extends Schema.TaggedErrorClass<PreviewRunnerError>(
  "@nmnmcc/preview/PreviewRunnerError",
)("PreviewRunnerError", {
  detail: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.detail;
  }
}

const runnerError = (detail: string, cause?: unknown): PreviewRunnerError =>
  new PreviewRunnerError({
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

const writeState = (
  state: Protocol.BrowserPreviewState,
): Effect.Effect<void> =>
  Effect.sync(() => {
    Reflect.set(globalThis, Protocol.previewStateKey, state);
  });

const readRequest = Effect.fn("PreviewRunner.readRequest")(function* () {
  const parameters = yield* Effect.try({
    try: () => new URLSearchParams(globalThis.location.search),
    catch: (cause) =>
      runnerError("Could not read the preview request.", cause),
  });
  if (!parameters.has(Protocol.previewModuleParameter)) {
    return yield* runnerError("The preview module URL is missing.");
  }
  const request = yield* Schema.decodeUnknownEffect(PreviewRequest)({
    action: parameters.get(Protocol.previewActionParameter),
    moduleUrl: parameters.get(Protocol.previewModuleParameter),
    ...(parameters.has(Protocol.previewVariantParameter)
      ? { variant: parameters.get(Protocol.previewVariantParameter) }
      : {}),
  }).pipe(
    Effect.mapError((cause) =>
      runnerError("The preview request is invalid.", cause),
    ),
  );
  if (request.action === "probe" && request.variant !== undefined) {
    return yield* runnerError("A preview probe cannot select a variant.");
  }
  return request;
});

const loadPreviewExport = Effect.fn("PreviewRunner.loadPreviewExport")(
  function* (moduleUrl: string) {
    const input = yield* Effect.tryPromise({
      try: async (): Promise<unknown> =>
        import(/* @vite-ignore */ moduleUrl),
      catch: (cause) =>
        runnerError("Could not load the preview module.", cause),
    });
    const previewModule = yield* Schema.decodeUnknownEffect(PreviewModule)(
      input,
    ).pipe(
      Effect.mapError((cause) =>
        runnerError(
          "The default export must be a preview definition or a non-empty preview collection.",
          cause,
        ),
      ),
    );
    return previewModule.default;
  },
);

const isPreviewDefinition = Schema.is(PreviewDefinition);

const probeExport = (
  previewExport: PreviewExport,
): Protocol.BrowserPreviewResult =>
  Protocol.BrowserPreviewProbeResult.make({
    targets: isPreviewDefinition(previewExport)
      ? [{ metadata: previewExport.metadata }]
      : Object.entries(previewExport).map(([variant, definition]) => ({
          variant,
          metadata: definition.metadata,
        })),
  });

const selectDefinition = Effect.fn("PreviewRunner.selectDefinition")(
  function* (previewExport: PreviewExport, variant?: string) {
    if (isPreviewDefinition(previewExport)) {
      if (variant !== undefined) {
        return yield* runnerError(
          `Preview variant ${JSON.stringify(variant)} does not exist.`,
        );
      }
      return previewExport;
    }
    if (variant === undefined) {
      return yield* runnerError(
        "A preview variant must be selected before rendering a preview collection.",
      );
    }
    const definition: PreviewCollection[string] | undefined =
      previewExport[variant];
    if (definition === undefined) {
      return yield* runnerError(
        `Preview variant ${JSON.stringify(variant)} does not exist.`,
      );
    }
    return definition;
  },
);

const findRoot = Effect.fn("PreviewRunner.findRoot")(function* () {
  const root = yield* Effect.try({
    try: () => globalThis.document.getElementById("preview-root"),
    catch: (cause) =>
      runnerError("Could not read the preview root element.", cause),
  });
  if (root === null) {
    return yield* runnerError("The preview root element is missing.");
  }
  return root;
});

const renderDefinition = Effect.fn("PreviewRunner.renderDefinition")(
  function* (
    definition: PreviewDefinition,
    root: HTMLElement,
  ): Effect.fn.Return<void, PreviewRunnerError> {
    const completed = yield* Deferred.make<void>();
    const done: PreviewDone = () => {
      Deferred.doneUnsafe(completed, Effect.void);
    };
    const render = Effect.tryPromise({
      try: () => Promise.resolve(definition.render(root, done)),
      catch: (cause) => runnerError("Preview render failed.", cause),
    });
    yield* Effect.all([render, Deferred.await(completed)], {
      concurrency: "unbounded",
      discard: true,
    });
  },
);

const renderPreview = Effect.fn("PreviewRunner.render")(function* () {
  const request = yield* readRequest();
  const previewExport = yield* loadPreviewExport(request.moduleUrl);
  if (request.action === "probe") {
    return probeExport(previewExport);
  }
  const definition = yield* selectDefinition(
    previewExport,
    request.variant,
  );
  const root = yield* findRoot();
  yield* renderDefinition(definition, root);
  return Protocol.BrowserPreviewRenderResult.make({});
});

const finish = renderPreview().pipe(
  Effect.matchCauseEffect({
    onFailure: (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : writeState(
            Protocol.BrowserPreviewError.make({
              error: Cause.pretty(cause),
            }),
          ),
    onSuccess: (result) =>
      writeState(Protocol.BrowserPreviewReady.make({ result })),
  }),
);

export const runPreviewEffect = writeState(
  Protocol.BrowserPreviewLoading.make({}),
).pipe(Effect.andThen(finish));

export const runPreview = (): void => {
  BrowserRuntime.runMain(runPreviewEffect);
};
