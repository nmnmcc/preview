import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import type * as Generation from "../../generation";
import * as Config from "../../config";
import * as Artifacts from "../Artifacts";
import * as Browser from "../Browser";
import * as Discovery from "../Discovery";

type PreviewError =
  | Artifacts.PreviewWriteError
  | Browser.PreviewBrowserError
  | Config.PreviewConfigError;

export interface RenderProjectInput {
  readonly root: string;
  readonly baseUrl: string;
  readonly config: Config.ResolvedPreviewOptions;
  readonly filters?: ReadonlyArray<string>;
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
  input: RenderProjectInput,
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
  input: RenderProjectInput,
  target: Browser.Target,
  metadata: Config.ResolvedPreviewMetadata,
  viewport: Config.ResolvedPreviewViewport,
) {
  const png = yield* browser.capture({
    source,
    baseUrl: input.baseUrl,
    viewport,
    timeoutMs: input.config.timeoutMs,
    capture: metadata.capture,
    ...(target.variant === undefined ? {} : { variant: target.variant }),
  });
  const pngPath = yield* artifactStore.write(
    source,
    viewport.name,
    png,
    target.variant,
  );
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
  input: RenderProjectInput,
  target: Browser.Target,
) {
  const metadataResult = yield* Effect.result(
    Config.resolvePreviewMetadata(target.metadata, input.config),
  );
  if (Result.isFailure(metadataResult)) {
    return {
      artifacts: [],
      failures: [
        failureFromError(source, metadataResult.failure, target.variant),
      ],
    } satisfies Generation.GenerationSummary;
  }

  const artifacts: Array<Generation.GeneratedArtifact> = [];
  const failures: Array<Generation.GenerationFailure> = [];
  for (const viewport of metadataResult.success.viewports) {
    const renderResult = yield* Effect.result(
      renderViewport(
        artifactStore,
        browser,
        source,
        input,
        target,
        metadataResult.success,
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
  return { artifacts, failures };
});

const renderSource = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  source: string,
  input: RenderProjectInput,
) {
  const targetsResult = yield* Effect.result(
    probeTargets(browser, source, input),
  );
  if (Result.isFailure(targetsResult)) {
    return {
      artifacts: [],
      failures: [failureFromError(source, targetsResult.failure)],
    } satisfies Generation.GenerationSummary;
  }

  const summaries = yield* Effect.forEach(
    targetsResult.success,
    (target) => renderTarget(artifactStore, browser, source, input, target),
    { concurrency: 1 },
  );
  return {
    artifacts: summaries.flatMap((summary) => summary.artifacts),
    failures: summaries.flatMap((summary) => summary.failures),
  };
});

export interface Interface {
  readonly renderProject: (
    input: RenderProjectInput,
  ) => Effect.Effect<
    Generation.GenerationSummary,
    Browser.PreviewBrowserError | Discovery.PreviewDiscoveryError
  >;
}

export class Renderer extends Context.Service<Renderer, Interface>()(
  "@nmnmcc/preview/PreviewRenderer",
) {}

export const layer = Layer.effect(
  Renderer,
  Effect.gen(function* () {
    const artifactStore = yield* Artifacts.Artifacts;
    const previewBrowser = yield* Browser.Browser;
    const discovery = yield* Discovery.Discovery;

    const renderProject = Effect.fn("PreviewRenderer.renderProject")(function* (
      input: RenderProjectInput,
    ) {
      const files = yield* discovery.discover(
        input.root,
        input.config,
        input.filters ?? [],
      );
      const firstFile = files[0];
      if (firstFile === undefined) {
        return { artifacts: [], failures: [] };
      }

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const browser = yield* previewBrowser.launch(firstFile);
          const summaries = yield* Effect.forEach(
            files,
            (source) => renderSource(artifactStore, browser, source, input),
            { concurrency: 1 },
          );
          return {
            artifacts: summaries.flatMap((summary) => summary.artifacts),
            failures: summaries.flatMap((summary) => summary.failures),
          };
        }),
      );
    });

    return Renderer.of({ renderProject });
  }),
);
