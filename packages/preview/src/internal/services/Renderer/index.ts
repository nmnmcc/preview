import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import type * as Generation from "../../generation";
import * as Artifacts from "../Artifacts";
import * as Browser from "../Browser";
import * as Config from "../Config";
import * as Discovery from "../Discovery";

type PreviewError =
  | Artifacts.PreviewWriteError
  | Browser.PreviewBrowserError
  | Config.PreviewConfigError;

export type RenderError =
  | Artifacts.PreviewCleanError
  | Browser.PreviewBrowserError
  | Config.PreviewConfigError
  | Discovery.PreviewDiscoveryError;

export interface RenderProjectInput {
  readonly root: string;
  readonly baseUrl: string;
  readonly filters?: ReadonlyArray<string>;
  readonly output?: string;
}

interface ResolvedRenderProjectInput {
  readonly root: string;
  readonly baseUrl: string;
  readonly config: Config.ResolvedGenerationOptions;
}

const failureFromError = (
  source: string,
  error: PreviewError,
  variant?: string,
  viewport?: string,
): Generation.GenerationFailure => ({
  source,
  ...(variant === undefined ? {} : { variant }),
  ...(viewport === undefined ? {} : { viewport }),
  message: Cause.pretty(Cause.fail(error)),
});

const probeTargets = Effect.fnUntraced(function* (
  browser: Browser.Session,
  source: string,
  input: ResolvedRenderProjectInput,
) {
  const viewport = Object.values(input.config.viewports)[0];
  if (viewport === undefined) {
    return yield* new Browser.PreviewBrowserError({
      source,
      detail: "No configured viewport is available for metadata probing.",
      cause: undefined,
    });
  }
  return yield* browser.probe({
    source,
    baseUrl: input.baseUrl,
    viewport,
    timeoutMs: input.config.timeoutMs,
  });
});

const renderViewport = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  source: string,
  input: ResolvedRenderProjectInput,
  target: Browser.Target,
  viewport: Config.ResolvedPreviewViewport,
) {
  const png = yield* browser.capture({
    source,
    baseUrl: input.baseUrl,
    viewport,
    timeoutMs: input.config.timeoutMs,
    target: target.target,
    ...(target.variant === undefined ? {} : { variant: target.variant }),
  });
  const pngPath = yield* artifactStore.write({
    source,
    output: input.config.output,
    viewport: viewport.name,
    png,
    ...(target.variant === undefined ? {} : { variant: target.variant }),
    ...(input.config.version === undefined
      ? {}
      : { version: input.config.version }),
  });
  return {
    source,
    ...(target.variant === undefined ? {} : { variant: target.variant }),
    viewport: viewport.name,
    pngPath,
  } satisfies Generation.GeneratedArtifact;
});

const renderTarget = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  source: string,
  input: ResolvedRenderProjectInput,
  target: Browser.Target,
) {
  const metadataResult = yield* Effect.result(
    Config.resolvePreviewMetadata(target.metadata, input.config),
  );
  if (Result.isFailure(metadataResult)) {
    return {
      summary: {
        artifacts: [],
        failures: [
          failureFromError(source, metadataResult.failure, target.variant),
        ],
      },
      targets: undefined,
    };
  }

  const artifacts: Array<Generation.GeneratedArtifact> = [];
  const failures: Array<Generation.GenerationFailure> = [];
  const targets: Array<Artifacts.Target> = [];
  for (const viewport of metadataResult.success.viewports) {
    targets.push({
      viewport: viewport.name,
      ...(target.variant === undefined ? {} : { variant: target.variant }),
    });
    const renderResult = yield* Effect.result(
      renderViewport(
        artifactStore,
        browser,
        source,
        input,
        target,
        viewport,
      ),
    );
    if (Result.isSuccess(renderResult)) {
      artifacts.push(renderResult.success);
    } else {
      failures.push(
        failureFromError(
          source,
          renderResult.failure,
          target.variant,
          viewport.name,
        ),
      );
    }
  }
  return { summary: { artifacts, failures }, targets };
});

const renderSource = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  source: string,
  input: ResolvedRenderProjectInput,
) {
  const targetsResult = yield* Effect.result(
    probeTargets(browser, source, input),
  );
  if (Result.isFailure(targetsResult)) {
    return {
      source,
      summary: {
        artifacts: [],
        failures: [failureFromError(source, targetsResult.failure)],
      },
      cleanTargets: undefined,
    };
  }

  const summaries = yield* Effect.forEach(
    targetsResult.success,
    (target) => renderTarget(artifactStore, browser, source, input, target),
    { concurrency: 1 },
  );
  const complete = summaries.every(
    (summary) => summary.targets !== undefined,
  );
  return {
    source,
    summary: {
      artifacts: summaries.flatMap(
        (result) => result.summary.artifacts,
      ),
      failures: summaries.flatMap(
        (result) => result.summary.failures,
      ),
    },
    cleanTargets: complete
      ? summaries.flatMap((result) => result.targets ?? [])
      : undefined,
  };
});

export interface Interface {
  readonly renderProject: (
    input: RenderProjectInput,
  ) => Effect.Effect<Generation.GenerationSummary, RenderError>;
}

export class Renderer extends Context.Service<Renderer, Interface>()(
  "@nmnmcc/preview/PreviewRenderer",
) {}

export const layer = Layer.effect(
  Renderer,
  Effect.gen(function* () {
    const artifactStore = yield* Artifacts.Artifacts;
    const previewBrowser = yield* Browser.Browser;
    const previewConfig = yield* Config.Config;
    const discovery = yield* Discovery.Discovery;

    const renderProject = Effect.fn("PreviewRenderer.renderProject")(function* (
      input: RenderProjectInput,
    ) {
      const filters = input.filters ?? [];
      const config = yield* previewConfig.resolveGeneration(input.output);
      const resolvedInput: ResolvedRenderProjectInput = {
        root: input.root,
        baseUrl: input.baseUrl,
        config,
      };
      const files = yield* discovery.discover(
        input.root,
        config,
        filters,
      );
      const firstFile = files[0];
      let sourceResults: ReadonlyArray<{
        readonly source: string;
        readonly summary: Generation.GenerationSummary;
        readonly cleanTargets: ReadonlyArray<Artifacts.Target> | undefined;
      }> = [];

      if (firstFile !== undefined) {
        sourceResults = yield* Effect.scoped(
          Effect.gen(function* () {
            const browser = yield* previewBrowser.launch(firstFile);
            return yield* Effect.forEach(
              files,
              (source) =>
                renderSource(artifactStore, browser, source, resolvedInput),
              { concurrency: 1 },
            );
          }),
        );
      }

      if (config.clean) {
        yield* Effect.forEach(
          sourceResults,
          (result) =>
            result.cleanTargets === undefined
              ? Effect.void
              : artifactStore.cleanSource({
                  source: result.source,
                  output: config.output,
                  targets: result.cleanTargets,
                  ...(config.version === undefined
                    ? {}
                    : { version: config.version }),
                }),
          { concurrency: 1, discard: true },
        );

        if (filters.length === 0) {
          yield* artifactStore.cleanProject({
            root: input.root,
            outputs: config.cleanOutputs,
            activeSources: files.map((source) => ({
              source,
              output: config.output,
            })),
          });
        }
      }

      return {
        artifacts: sourceResults.flatMap(
          (result) => result.summary.artifacts,
        ),
        failures: sourceResults.flatMap(
          (result) => result.summary.failures,
        ),
      };
    });

    return Renderer.of({ renderProject });
  }),
);
