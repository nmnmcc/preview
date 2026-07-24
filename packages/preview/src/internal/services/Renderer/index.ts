import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Semaphore from "effect/Semaphore";
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
  state?: string,
): Generation.GenerationFailure => ({
  source,
  ...(state === undefined ? {} : { state }),
  ...(variant === undefined ? {} : { variant }),
  ...(viewport === undefined ? {} : { viewport }),
  message: Cause.pretty(Cause.fail(error)),
});

const probeTargets = Effect.fnUntraced(function* (
  browser: Browser.Session,
  pageSemaphore: Semaphore.Semaphore,
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
  return yield* pageSemaphore.withPermit(
    browser.probe({
      source,
      baseUrl: input.baseUrl,
      viewport,
      timeoutMs: input.config.timeoutMs,
    }),
  );
});

const writeCapturedState = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  source: string,
  input: ResolvedRenderProjectInput,
  target: Browser.Target,
  viewport: Config.ResolvedPreviewViewport,
  capture: Browser.CapturedState,
) {
  const writeInput = {
    source,
    output: input.config.output,
    state: capture.state,
    viewport: viewport.name,
    png: capture.png,
    ...(target.variant === undefined ? {} : { variant: target.variant }),
    ...(input.config.version === undefined
      ? {}
      : { version: input.config.version }),
  } satisfies Artifacts.WriteInput;

  if (capture.inspection === undefined) {
    const pngPath = yield* artifactStore.write(writeInput);
    return {
      artifact: {
        source,
        state: capture.state,
        ...(target.variant === undefined ? {} : { variant: target.variant }),
        viewport: viewport.name,
        pngPath,
      } satisfies Generation.GeneratedArtifact,
      inspectionFailure: undefined,
    };
  }

  const written = yield* artifactStore.writeBundle({
    ...writeInput,
    inspection: {
      files: capture.inspection.files,
    },
  });
  const generatedInspection = {
    ...written.inspection,
    findings: capture.inspection.findings,
    checks: capture.inspection.checks,
  } satisfies Generation.GeneratedInspectionArtifact;
  const contractFailures =
    capture.inspection.declarationFailures + capture.inspection.checkFailures;
  const artifact = {
    source,
    state: capture.state,
    ...(target.variant === undefined ? {} : { variant: target.variant }),
    viewport: viewport.name,
    pngPath: written.pngPath,
    inspection: generatedInspection,
  } satisfies Generation.GeneratedArtifact;
  return {
    artifact,
    ...(contractFailures === 0
      ? {}
      : {
          inspectionFailure: {
            source,
            state: capture.state,
            ...(target.variant === undefined
              ? {}
              : { variant: target.variant }),
            viewport: viewport.name,
            message: `Inspection found ${contractFailures} declaration or check failure${contractFailures === 1 ? "" : "s"}. Open ${generatedInspection.readmePath}.`,
          } satisfies Generation.GenerationFailure,
        }),
  };
});

const renderViewport = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  pageSemaphore: Semaphore.Semaphore,
  source: string,
  input: ResolvedRenderProjectInput,
  target: Browser.Target,
  viewport: Config.ResolvedPreviewViewport,
  inspection: Config.ResolvedPreviewMetadata["inspection"],
  reportSource: string,
) {
  const captures = yield* pageSemaphore.withPermit(
    browser.capture({
      source,
      baseUrl: input.baseUrl,
      viewport,
      timeoutMs: input.config.timeoutMs,
      target: target.target,
      ...(inspection === undefined ? {} : { inspection }),
      ...(inspection === undefined ? {} : { reportSource }),
      ...(target.variant === undefined ? {} : { variant: target.variant }),
    }),
  );
  return yield* Effect.forEach(
    captures,
    (capture) =>
      writeCapturedState(
        artifactStore,
        source,
        input,
        target,
        viewport,
        capture,
      ),
    { concurrency: 1 },
  );
});

const renderTarget = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  pageSemaphore: Semaphore.Semaphore,
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

  const results = yield* Effect.forEach(
    metadataResult.success.viewports,
    (viewport) =>
      Effect.result(
        renderViewport(
          artifactStore,
          browser,
          pageSemaphore,
          source,
          input,
          target,
          viewport,
          metadataResult.success.inspection,
          source.replaceAll("\\", "/").split("/").at(-1) ?? source,
        ),
      ).pipe(Effect.map((result) => ({ result, viewport }))),
    { concurrency: input.config.concurrency },
  );
  const artifacts: Array<Generation.GeneratedArtifact> = [];
  const failures: Array<Generation.GenerationFailure> = [];
  const targets: Array<Artifacts.Target> = [];
  for (const { result, viewport } of results) {
    const renderResult = result;
    if (Result.isSuccess(renderResult)) {
      for (const stateResult of renderResult.success) {
        artifacts.push(stateResult.artifact);
        targets.push({
          state: stateResult.artifact.state,
          viewport: viewport.name,
          ...(target.variant === undefined ? {} : { variant: target.variant }),
          ...(metadataResult.success.inspection === undefined
            ? {}
            : { inspect: true }),
        });
        if (stateResult.inspectionFailure !== undefined) {
          failures.push(stateResult.inspectionFailure);
        }
      }
    } else {
      failures.push(
        failureFromError(
          source,
          renderResult.failure,
          target.variant,
          viewport.name,
          renderResult.failure._tag === "PreviewBrowserError"
            ? renderResult.failure.state
            : undefined,
        ),
      );
    }
  }
  return {
    summary: { artifacts, failures },
    targets: results.every(({ result }) => Result.isSuccess(result))
      ? targets
      : undefined,
  };
});

const renderSource = Effect.fnUntraced(function* (
  artifactStore: Artifacts.Interface,
  browser: Browser.Session,
  pageSemaphore: Semaphore.Semaphore,
  source: string,
  input: ResolvedRenderProjectInput,
) {
  const targetsResult = yield* Effect.result(
    probeTargets(browser, pageSemaphore, source, input),
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
    (target) =>
      renderTarget(
        artifactStore,
        browser,
        pageSemaphore,
        source,
        input,
        target,
      ),
    { concurrency: input.config.concurrency },
  );
  const complete = summaries.every((summary) => summary.targets !== undefined);
  return {
    source,
    summary: {
      artifacts: summaries.flatMap((result) => result.summary.artifacts),
      failures: summaries.flatMap((result) => result.summary.failures),
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
    const pageSemaphore = yield* Semaphore.make(
      previewConfig.options.concurrency,
    );

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
      const files = yield* discovery.discover(input.root, config, filters);
      const firstFile = files[0];
      let sourceResults: ReadonlyArray<{
        readonly source: string;
        readonly summary: Generation.GenerationSummary;
        readonly cleanTargets: ReadonlyArray<Artifacts.Target> | undefined;
      }> = [];

      if (firstFile !== undefined) {
        sourceResults = yield* Effect.scoped(
          Effect.gen(function* () {
            const browser = yield* previewBrowser.session(firstFile);
            return yield* Effect.forEach(
              files,
              (source) =>
                renderSource(
                  artifactStore,
                  browser,
                  pageSemaphore,
                  source,
                  resolvedInput,
                ),
              { concurrency: config.concurrency },
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
        artifacts: sourceResults.flatMap((result) => result.summary.artifacts),
        failures: sourceResults.flatMap((result) => result.summary.failures),
      };
    });

    return Renderer.of({ renderProject });
  }),
);
