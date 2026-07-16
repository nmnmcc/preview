import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type { PreviewUnmount } from "../../../definition";
import {
  type PreviewCollection,
  PreviewDefinition,
  PreviewExport,
} from "../../../preview";
import * as Protocol from "../../../protocol";
import * as PreviewSchema from "../../../schema";

const PreviewModule = Schema.Struct({
  default: PreviewExport,
});

const PreviewRequest = Schema.Struct({
  action: Protocol.PreviewAction,
  moduleUrl: Schema.NonEmptyString,
  variant: Schema.optionalKey(PreviewSchema.PreviewVariantName),
});
interface PreviewRequest
  extends Schema.Schema.Type<typeof PreviewRequest> {}

export class PreviewRunnerError extends Schema.TaggedErrorClass<PreviewRunnerError>(
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
    Reflect.set(globalThis, Protocol.PreviewStateKey, state);
  });

const readRequest = Effect.fn("PreviewRunner.readRequest")(function* () {
  const parameters = yield* Effect.try({
    try: () => new URLSearchParams(globalThis.location.search),
    catch: (cause) =>
      runnerError("Could not read the preview request.", cause),
  });
  if (!parameters.has(Protocol.PreviewModuleParameter)) {
    return yield* runnerError("The preview module URL is missing.");
  }
  const request = yield* Schema.decodeUnknownEffect(PreviewRequest)({
    action: parameters.get(Protocol.PreviewActionParameter),
    moduleUrl: parameters.get(Protocol.PreviewModuleParameter),
    ...(parameters.has(Protocol.PreviewVariantParameter)
      ? { variant: parameters.get(Protocol.PreviewVariantParameter) }
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
      ? [
          {
            metadata: previewExport.metadata,
            target:
              previewExport.target.type === "sandbox"
                ? { type: "sandbox" }
                : {
                    type: "application",
                    location: previewExport.target.location,
                  },
          },
        ]
      : Object.entries(previewExport).map(([variant, definition]) => ({
          variant,
          metadata: definition.metadata,
          target:
            definition.target.type === "sandbox"
              ? { type: "sandbox" }
              : {
                  type: "application",
                  location: definition.target.location,
                },
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

const mountDefinition = Effect.fn("PreviewRunner.mountDefinition")(
  function* (
    definition: PreviewDefinition,
    root: HTMLElement,
  ): Effect.fn.Return<void, PreviewRunnerError> {
    const target = definition.target;
    if (target.type !== "sandbox") {
      return yield* runnerError(
        "An application preview must be captured through its application location.",
      );
    }

    const completed = yield* Deferred.make<void>();
    const controller = new AbortController();
    let active = true;
    let mountedUnmount: PreviewUnmount | undefined;
    let unmountPromise: Promise<void> | undefined;

    const runUnmount = (): Promise<void> => {
      if (unmountPromise !== undefined) return unmountPromise;
      if (mountedUnmount === undefined) return Promise.resolve();
      unmountPromise = Promise.resolve().then(mountedUnmount);
      return unmountPromise;
    };

    const dispose = (): Promise<void> => {
      if (active) {
        active = false;
        controller.abort();
      }
      return runUnmount();
    };

    const ready = (): void => {
      if (!active) return;
      Deferred.doneUnsafe(completed, Effect.void);
    };

    yield* Effect.sync(() => {
      Reflect.set(globalThis, Protocol.PreviewDisposeKey, dispose);
    });

    const mount = Effect.tryPromise({
      try: async () => {
        const unmount = await target.mount({
          root,
          ready,
          signal: controller.signal,
        });
        if (typeof unmount !== "function") {
          throw new TypeError(
            "A sandbox mount must return an unmount function.",
          );
        }
        mountedUnmount = unmount;
        if (!active) await runUnmount();
      },
      catch: (cause) => runnerError("Sandbox mount failed.", cause),
    });

    yield* Effect.all([mount, Deferred.await(completed)], {
      concurrency: "unbounded",
      discard: true,
    }).pipe(
      Effect.onExit((exit) =>
        Exit.isFailure(exit)
          ? Effect.promise(() => dispose().catch(() => undefined))
          : Effect.void,
      ),
    );
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
  if (definition.target.type !== "sandbox") {
    return yield* runnerError(
      "An application preview cannot run inside the Sandbox page.",
    );
  }
  const root = yield* findRoot();
  yield* mountDefinition(definition, root);
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

const run = writeState(
  Protocol.BrowserPreviewLoading.make({}),
).pipe(Effect.andThen(finish));

export interface Interface {
  /** Runs one Sandbox preview request in the current browser document. */
  readonly run: Effect.Effect<void, PreviewRunnerError>;
}

/** Runs Sandbox preview modules in the browser document. */
export class PreviewRunner extends Context.Service<PreviewRunner, Interface>()(
  "@nmnmcc/preview/PreviewRunner",
) {}

/** Provides the browser preview runner. */
export const layer: Layer.Layer<PreviewRunner> = Layer.succeed(
  PreviewRunner,
  PreviewRunner.of({ run }),
);
