import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type {
  PreviewDone,
  PreviewEmit,
  PreviewUnmount,
} from "../../../definition";
import {
  PreviewDefinition,
  PreviewExport,
  type PreviewCollection,
} from "../../../preview";
import * as Protocol from "../../../protocol";
import * as Rpcs from "../../../rpcs";

const PreviewModule = Schema.Struct({
  default: PreviewExport,
});

const runnerError = (
  detail: string,
  cause?: unknown,
): Rpcs.SandboxPreviewError =>
  new Rpcs.SandboxPreviewError({
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

const loadPreviewExport = Effect.fn("PreviewRunner.loadPreviewExport")(
  function* (moduleUrl: string) {
    const input = yield* Effect.tryPromise({
      try: async (): Promise<unknown> => import(/* @vite-ignore */ moduleUrl),
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

const selectDefinition = Effect.fn("PreviewRunner.selectDefinition")(function* (
  previewExport: PreviewExport,
  variant?: string,
) {
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
});

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

const mountDefinition = Effect.fn("PreviewRunner.mountDefinition")(function* (
  definition: PreviewDefinition,
  root: HTMLElement,
  lifecycle: PreviewLifecycle,
): Effect.fn.Return<
  { readonly dispose: Effect.Effect<void> },
  Rpcs.SandboxPreviewError
> {
  const target = definition.target;
  if (target.type !== "sandbox") {
    return yield* runnerError(
      "An application preview must be captured through its application location.",
    );
  }

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

  const disposeEffect = Effect.promise(() => dispose().catch(() => undefined));

  const mount = Effect.tryPromise({
    try: async () => {
      const unmount = await target.mount({
        root,
        emit: lifecycle.emit,
        done: lifecycle.done,
        signal: controller.signal,
      });
      if (typeof unmount !== "function") {
        throw new TypeError("A sandbox mount must return an unmount function.");
      }
      mountedUnmount = unmount;
      if (!active) await runUnmount();
    },
    catch: (cause) => runnerError("Sandbox mount failed.", cause),
  });

  yield* mount.pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit) ? disposeEffect : Effect.void,
    ),
  );

  return { dispose: disposeEffect };
});

export interface PreviewExecution {
  readonly result: Protocol.BrowserPreviewResult;
  readonly dispose: Effect.Effect<void>;
}

export interface PreviewLifecycle {
  readonly emit: PreviewEmit;
  readonly done: PreviewDone;
}

const execute = Effect.fn("PreviewRunner.execute")(function* (
  request: Rpcs.SandboxPreviewRequest,
  lifecycle: PreviewLifecycle,
): Effect.fn.Return<PreviewExecution, Rpcs.SandboxPreviewError> {
  const previewExport = yield* loadPreviewExport(request.moduleUrl);
  if (request._tag === "Probe") {
    return {
      result: probeExport(previewExport),
      dispose: Effect.void,
    };
  }

  const definition = yield* selectDefinition(previewExport, request.variant);
  if (definition.target.type !== "sandbox") {
    return yield* runnerError(
      "An application preview cannot run inside the Sandbox page.",
    );
  }
  const root = yield* findRoot();
  const mounted = yield* mountDefinition(definition, root, lifecycle);
  return {
    result: Protocol.BrowserPreviewRenderResult.make({}),
    dispose: mounted.dispose,
  };
});

export interface Interface {
  /** Executes one typed Sandbox preview request in this document. */
  readonly execute: (
    request: Rpcs.SandboxPreviewRequest,
    lifecycle: PreviewLifecycle,
  ) => Effect.Effect<PreviewExecution, Rpcs.SandboxPreviewError>;
}

/** Executes Sandbox preview modules in the browser document. */
export class PreviewRunner extends Context.Service<PreviewRunner, Interface>()(
  "@nmnmcc/preview/PreviewRunner",
) {}

/** Provides the browser preview runner. */
export const layer: Layer.Layer<PreviewRunner> = Layer.succeed(
  PreviewRunner,
  PreviewRunner.of({ execute }),
);
