import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FiberHandle from "effect/FiberHandle";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import type * as Generation from "../../generation";
import * as Logging from "../../logging";
import type { GenerateRequest } from "../../plugin-control";
import * as Artifacts from "../Artifacts";
import * as Config from "../Config";
import * as Renderer from "../Renderer";

export interface Project {
  readonly root: string;
  readonly mode: string;
  readonly info: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface Server {
  readonly baseUrl: () => string | undefined;
  readonly unwatch: (path: string) => void;
}

type Lifecycle = Data.TaggedEnum<{
  Created: {};
  Configured: { readonly project: Project };
  Attached: { readonly project: Project; readonly server: Server };
  Closed: {};
}>;

const Lifecycle = Data.taggedEnum<Lifecycle>();

type Pending = Data.TaggedEnum<{
  None: {};
  All: {};
  Paths: { readonly paths: ReadonlySet<string> };
}>;

const Pending = Data.taggedEnum<Pending>();

interface AttachResult {
  readonly attached: boolean;
  readonly newServer: boolean;
}

const GenerateRequest = Schema.Struct({
  output: Schema.optionalKey(Schema.String),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
}) satisfies Schema.Codec<GenerateRequest>;

export type GenerateError = Config.PreviewConfigError | Renderer.RenderError;

export interface Interface {
  readonly configure: (
    project: Project,
  ) => Effect.Effect<void, Config.PreviewConfigError>;
  readonly attach: (
    server: Server,
  ) => Effect.Effect<void, Config.PreviewConfigError>;
  readonly generate: (
    request?: unknown,
  ) => Effect.Effect<Generation.GenerationSummary, GenerateError>;
  readonly schedule: (paths?: ReadonlyArray<string>) => Effect.Effect<void>;
  readonly prepareCli: Effect.Effect<void, Config.PreviewConfigError>;
  readonly isOutputPath: (file: string) => Effect.Effect<boolean>;
  readonly shutdown: Effect.Effect<void>;
}

export class PluginController extends Context.Service<
  PluginController,
  Interface
>()("@nmnmcc/preview/PluginController") {}

const configError = (
  detail: string,
  cause?: unknown,
): Config.PreviewConfigError =>
  new Config.PreviewConfigError({
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

const mergePending = (
  current: Pending,
  paths?: ReadonlyArray<string>,
): Pending => {
  if (paths === undefined) return Pending.All();
  if (current._tag === "All") return current;
  const merged = new Set(current._tag === "Paths" ? current.paths : undefined);
  for (const path of paths) merged.add(path);
  return Pending.Paths({ paths: merged });
};

export const layer = Layer.effect(
  PluginController,
  Effect.gen(function* () {
    const artifacts = yield* Artifacts.Artifacts;
    const config = yield* Config.Config;
    const path = yield* Path.Path;
    const renderer = yield* Renderer.Renderer;
    const lifecycle = yield* Ref.make<Lifecycle>(Lifecycle.Created());
    const pending = yield* Ref.make<Pending>(Pending.None());
    const ignoredDirectories = yield* Ref.make<ReadonlySet<string>>(new Set());
    const automaticGeneration = yield* Ref.make(true);
    const generationSemaphore = yield* Semaphore.make(1);
    const debounce = yield* FiberHandle.make<void, never>();
    const background = yield* FiberSet.make<void, GenerateError>();

    const readAttached = Effect.fn("PreviewPlugin.readAttached")(function* () {
      const state = yield* Ref.get(lifecycle);
      if (state._tag === "Closed") {
        return yield* configError("The preview plugin is closed.");
      }
      if (state._tag !== "Attached") {
        return yield* configError(
          "The preview plugin is not attached to a running Vite server.",
        );
      }
      const baseUrl = state.server.baseUrl();
      if (baseUrl === undefined) {
        return yield* configError(
          "The Vite server has no reachable local URL.",
        );
      }
      return { ...state, baseUrl };
    });

    const ignoreDirectories = Effect.fn("PreviewPlugin.ignoreDirectories")(
      function* (
        server: Server,
        directories: ReadonlyArray<string>,
        replayAll = false,
      ) {
        const toUnwatch = yield* Ref.modify(ignoredDirectories, (current) => {
          const next = new Set(current);
          const added: Array<string> = [];
          for (const directory of directories) {
            if (next.has(directory)) continue;
            next.add(directory);
            added.push(directory);
          }
          return [replayAll ? [...next] : added, next] as const;
        });
        yield* Effect.sync(() => {
          for (const directory of toUnwatch) server.unwatch(directory);
        });
      },
    );

    const discoverOutputDirectories = Effect.fn(
      "PreviewPlugin.discoverOutputDirectories",
    )(function* (
      project: Project,
      server: Server,
      outputs: ReadonlyArray<string>,
      replayAll = false,
    ) {
      const directories = yield* artifacts
        .outputDirectories(project.root, outputs)
        .pipe(
          Effect.mapError((cause) =>
            configError(
              `Could not inspect preview output below ${project.root}.`,
              cause,
            ),
          ),
        );
      yield* ignoreDirectories(server, [...directories], replayAll);
    });

    const ignoreSummaryDirectories = Effect.fn(
      "PreviewPlugin.ignoreSummaryDirectories",
    )(function* (
      server: Server,
      output: string,
      summary: Generation.GenerationSummary,
    ) {
      yield* ignoreDirectories(
        server,
        summary.artifacts.map((artifact) =>
          artifacts.outputDirectory(artifact.source, output),
        ),
      );
    });

    const runGeneration = Effect.fn("PreviewPlugin.generate")(function* (
      request: GenerateRequest,
    ) {
      const attached = yield* readAttached();
      const generationConfig = yield* config.resolveGeneration(request.output);
      yield* discoverOutputDirectories(
        attached.project,
        attached.server,
        generationConfig.cleanOutputs,
      );
      const summary = yield* renderer.renderProject({
        root: attached.project.root,
        baseUrl: attached.baseUrl,
        ...(request.output === undefined ? {} : { output: request.output }),
        ...(request.paths === undefined ? {} : { filters: [...request.paths] }),
      });
      yield* ignoreSummaryDirectories(
        attached.server,
        generationConfig.output,
        summary,
      );
      return summary;
    });

    const reportSummary = Effect.fn("PreviewPlugin.reportSummary")(function* (
      project: Project,
      summary: Generation.GenerationSummary,
    ) {
      for (const artifact of summary.artifacts) {
        const timestampMillis = yield* Clock.currentTimeMillis;
        yield* Effect.sync(() => {
          project.info(
            Logging.formatGeneratedArtifact(path, artifact, timestampMillis),
          );
        });
      }
      for (const failure of summary.failures) {
        const timestampMillis = yield* Clock.currentTimeMillis;
        yield* Effect.sync(() => {
          project.error(
            Logging.formatGenerationFailure(path, failure, timestampMillis),
          );
        });
      }
    });

    const supervise = <A, E, R>(
      project: Project,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A | void, E, R> =>
      Effect.catchCauseIf(
        effect,
        (cause) => !Cause.hasInterrupts(cause),
        (cause) =>
          Effect.gen(function* () {
            const timestampMillis = yield* Clock.currentTimeMillis;
            yield* Effect.sync(() => {
              project.error(
                Logging.formatMessage(
                  "error",
                  Cause.pretty(cause),
                  timestampMillis,
                ),
              );
            });
          }),
      );

    const flush = Effect.fn("PreviewPlugin.flushScheduled")(function* () {
      const state = yield* Ref.get(lifecycle);
      const request = yield* Ref.getAndSet(pending, Pending.None());
      if (state._tag !== "Attached" || request._tag === "None") return;

      const generateRequest: GenerateRequest =
        request._tag === "All" ? {} : { paths: [...request.paths] };
      const program = supervise(
        state.project,
        generationSemaphore.withPermit(runGeneration(generateRequest)).pipe(
          Effect.tap((summary) => reportSummary(state.project, summary)),
          Effect.asVoid,
        ),
      ).pipe(Effect.asVoid);
      yield* program.pipe(FiberSet.run(background));
    });

    const configure = Effect.fn("PreviewPlugin.configure")(function* (
      project: Project,
    ) {
      const configured = yield* Ref.modify(lifecycle, (state) => {
        switch (state._tag) {
          case "Created":
          case "Configured":
            return [true, Lifecycle.Configured({ project })];
          case "Attached":
            return [
              true,
              Lifecycle.Attached({ project, server: state.server }),
            ];
          case "Closed":
            return [false, state];
        }
      });
      if (!configured) {
        return yield* configError("The preview plugin is closed.");
      }
    });

    const attach = Effect.fn("PreviewPlugin.attach")(function* (
      server: Server,
    ) {
      const result = yield* Ref.modify(
        lifecycle,
        (state): readonly [AttachResult, Lifecycle] => {
          switch (state._tag) {
            case "Configured":
              return [
                { attached: true, newServer: true },
                Lifecycle.Attached({ project: state.project, server }),
              ];
            case "Attached":
              return [
                {
                  attached: true,
                  newServer: state.server !== server,
                },
                Lifecycle.Attached({ project: state.project, server }),
              ];
            case "Created":
            case "Closed":
              return [{ attached: false, newServer: false }, state];
          }
        },
      );
      if (!result.attached) {
        const state = yield* Ref.get(lifecycle);
        return yield* configError(
          state._tag === "Closed"
            ? "The preview plugin is closed."
            : "The preview plugin has no resolved Vite configuration.",
        );
      }
      if (result.newServer) {
        const state = yield* Ref.get(lifecycle);
        if (state._tag === "Attached") {
          yield* discoverOutputDirectories(
            state.project,
            server,
            [config.options.output],
            true,
          );
        }
      } else {
        const state = yield* Ref.get(lifecycle);
        if (state._tag === "Attached") {
          yield* discoverOutputDirectories(state.project, server, [
            config.options.output,
          ]);
        }
      }
    });

    const generate = Effect.fn("PreviewPlugin.generateRequest")(function* (
      input: unknown = {},
    ) {
      const request = yield* Schema.decodeUnknownEffect(GenerateRequest)(
        input,
      ).pipe(
        Effect.mapError((cause) =>
          configError("The preview generation request is invalid.", cause),
        ),
      );
      return yield* generationSemaphore.withPermit(runGeneration(request));
    });

    const schedule = Effect.fn("PreviewPlugin.schedule")(function* (
      paths?: ReadonlyArray<string>,
    ) {
      const state = yield* Ref.get(lifecycle);
      if (state._tag !== "Attached" || !(yield* Ref.get(automaticGeneration))) {
        return;
      }
      yield* Ref.update(pending, (current) => mergePending(current, paths));
      yield* flush().pipe(
        Effect.delay("100 millis"),
        FiberHandle.run(debounce),
      );
    });

    const prepareCli = Effect.gen(function* () {
      const state = yield* Ref.get(lifecycle);
      if (state._tag === "Closed") {
        return yield* configError("The preview plugin is closed.");
      }
      if (state._tag !== "Attached") {
        return yield* configError(
          "The preview plugin is not attached to a running Vite server.",
        );
      }
      yield* Ref.set(automaticGeneration, false);
      yield* Ref.set(pending, Pending.None());
      yield* FiberHandle.clear(debounce);
    }).pipe(Effect.withSpan("PreviewPlugin.prepareCli"));

    const isOutputPath = Effect.fn("PreviewPlugin.isOutputPath")(function* (
      file: string,
    ) {
      const directories = yield* Ref.get(ignoredDirectories);
      return [...directories].some((directory) =>
        artifacts.isPathInDirectory(file, directory),
      );
    });

    const shutdown = Effect.gen(function* () {
      const close = yield* Ref.modify(lifecycle, (state) =>
        state._tag === "Closed" ? [false, state] : [true, Lifecycle.Closed()],
      );
      if (!close) return;

      yield* Ref.set(pending, Pending.None());
      yield* FiberHandle.clear(debounce);
      yield* FiberSet.awaitEmpty(background);
      yield* generationSemaphore.withPermit(Effect.void);
    }).pipe(Effect.withSpan("PreviewPlugin.shutdown"));

    return PluginController.of({
      configure,
      attach,
      generate,
      schedule,
      prepareCli,
      isOutputPath,
      shutdown,
    });
  }),
);
