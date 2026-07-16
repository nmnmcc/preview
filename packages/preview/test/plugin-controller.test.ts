import { describe, it } from "@effect/vitest";
import {
  assertFalse,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { GenerationSummary } from "../src/internal/generation";
import * as Artifacts from "../src/internal/services/Artifacts";
import * as Config from "../src/internal/services/Config";
import * as PluginController from "../src/internal/services/PluginController";
import * as Renderer from "../src/internal/services/Renderer";

const options: Config.ResolvedPreviewOptions = {
  viewports: {
    test: {
      name: "test",
      width: 100,
      height: 100,
      deviceScaleFactor: 1,
    },
  },
  clean: false,
  include: ["**/*.preview.ts"],
  exclude: [],
  output: ".preview",
  timeoutMs: 30_000,
};

const emptySummary = GenerationSummary.make({
  artifacts: [],
  failures: [],
});

const project: PluginController.Project = {
  root: "/project",
  mode: "development",
  info: () => undefined,
  error: () => undefined,
};

const makeServer = (
  unwatched: Array<string> = [],
): PluginController.Server => ({
  baseUrl: () => "http://preview.test",
  unwatch: (glob) => {
    unwatched.push(glob);
  },
});

const makeControllerLayer = (
  renderProject: Renderer.Interface["renderProject"],
  ownedByOutput: Readonly<Record<string, ReadonlyArray<string>>> = {},
) => {
  const configLayer = Layer.succeed(
    Config.Config,
    Config.Config.of({
      options,
      resolveGeneration: (output?: unknown) => {
        const resolvedOutput =
          typeof output === "string" ? output : options.output;
        return Effect.succeed({
          ...options,
          output: resolvedOutput,
          cleanOutputs: [...new Set([options.output, resolvedOutput])],
        });
      },
    }),
  );
  const rendererLayer = Layer.succeed(
    Renderer.Renderer,
    Renderer.Renderer.of({ renderProject }),
  );
  const artifactsLayer = Layer.succeed(
    Artifacts.Artifacts,
    Artifacts.Artifacts.of({
      cleanProject: Effect.fnUntraced(function* () {
        return yield* Effect.die("Unexpected project clean");
      }),
      cleanSource: Effect.fnUntraced(function* () {
        return yield* Effect.die("Unexpected source clean");
      }),
      isPathInDirectory: (file, directory) =>
        file === directory || file.startsWith(`${directory}/`),
      ownedDirectories: Effect.fnUntraced(function* (_root, outputs) {
        return new Set(
          outputs.flatMap((output) => ownedByOutput[output] ?? []),
        );
      }),
      sourceDirectory: (source, output) => {
        const separator = source.lastIndexOf("/");
        return `${source.slice(0, separator)}/${output}/${source.slice(separator + 1)}`;
      },
      write: Effect.fnUntraced(function* () {
        return yield* Effect.die("Unexpected artifact write");
      }),
    }),
  );

  return PluginController.layer.pipe(
    Layer.provide(
      Layer.mergeAll(artifactsLayer, configLayer, rendererLayer),
    ),
  );
};

describe("preview plugin controller", () => {
  it.effect("serializes direct generation calls", () =>
    Effect.gen(function* () {
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const secondStarted = yield* Deferred.make<void>();
      const calls = yield* Ref.make(0);
      const renderProject = Effect.fnUntraced(function* () {
        const call = yield* Ref.updateAndGet(calls, (value) => value + 1);
        if (call === 1) {
          yield* Deferred.succeed(firstStarted, undefined);
          yield* Deferred.await(releaseFirst);
        } else {
          yield* Deferred.succeed(secondStarted, undefined);
        }
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure(project);
        yield* controller.attach(makeServer());

        const first = yield* Effect.forkChild(controller.generate());
        yield* Deferred.await(firstStarted);
        const second = yield* Effect.forkChild(controller.generate());
        yield* Effect.yieldNow;

        assertFalse(yield* Deferred.isDone(secondStarted));
        yield* Deferred.succeed(releaseFirst, undefined);
        yield* Deferred.await(secondStarted);
        yield* Fiber.join(first);
        yield* Fiber.join(second);
        strictEqual(yield* Ref.get(calls), 2);
      }).pipe(Effect.provide(makeControllerLayer(renderProject)));
    }),
  );

  it.effect("coalesces scheduled paths with the test clock", () =>
    Effect.gen(function* () {
      const rendered = yield* Deferred.make<void>();
      const inputs = yield* Ref.make<Array<Renderer.RenderProjectInput>>([]);
      const unwatched: Array<string> = [];
      const renderProject = Effect.fnUntraced(function* (
        input: Renderer.RenderProjectInput,
      ) {
        yield* Ref.update(inputs, (values) => [...values, input]);
        yield* Deferred.succeed(rendered, undefined);
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure({ ...project, mode: "preview-cli" });
        yield* controller.attach(makeServer(unwatched));
        yield* controller.schedule(["/project/A.preview.ts"]);
        yield* controller.schedule([
          "/project/B.preview.ts",
          "/project/A.preview.ts",
        ]);

        yield* TestClock.adjust("99 millis");
        assertFalse(yield* Deferred.isDone(rendered));
        yield* TestClock.adjust("1 millis");
        yield* Deferred.await(rendered);
        yield* controller.shutdown;

        deepStrictEqual(yield* Ref.get(inputs), [
          {
            root: "/project",
            baseUrl: "http://preview.test",
            filters: [
              "/project/A.preview.ts",
              "/project/B.preview.ts",
            ],
          },
        ]);
        deepStrictEqual(unwatched, []);
      }).pipe(Effect.provide(makeControllerLayer(renderProject)));
    }),
  );

  it.effect("waits for background work before shutdown completes", () =>
    Effect.gen(function* () {
      const renderStarted = yield* Deferred.make<void>();
      const releaseRender = yield* Deferred.make<void>();
      const shutdownComplete = yield* Deferred.make<void>();
      const renderProject = Effect.fnUntraced(function* () {
        yield* Deferred.succeed(renderStarted, undefined);
        yield* Deferred.await(releaseRender);
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure(project);
        yield* controller.attach(makeServer());
        yield* controller.schedule();
        yield* TestClock.adjust("100 millis");
        yield* Deferred.await(renderStarted);

        const shutdown = yield* Effect.forkChild(
          controller.shutdown.pipe(
            Effect.tap(() => Deferred.succeed(shutdownComplete, undefined)),
          ),
        );
        yield* Effect.yieldNow;
        assertFalse(yield* Deferred.isDone(shutdownComplete));

        yield* Deferred.succeed(releaseRender, undefined);
        yield* Fiber.join(shutdown);
        strictEqual(yield* Deferred.isDone(shutdownComplete), true);

        const error = yield* Effect.flip(controller.generate());
        strictEqual(error._tag, "PreviewConfigError");
        strictEqual(error.message, "The preview plugin is closed.");
      }).pipe(Effect.provide(makeControllerLayer(renderProject)));
    }),
  );

  it.effect("checks unknown generation requests before rendering", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const renderProject = Effect.fnUntraced(function* () {
        yield* Ref.update(calls, (value) => value + 1);
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure(project);
        yield* controller.attach(makeServer());

        const error = yield* Effect.flip(
          controller.generate({ paths: [42] }),
        );
        strictEqual(error._tag, "PreviewConfigError");
        strictEqual(
          error.message,
          "The preview generation request is invalid.",
        );
        strictEqual(yield* Ref.get(calls), 0);
      }).pipe(Effect.provide(makeControllerLayer(renderProject)));
    }),
  );

  it.effect("applies every owned directory when the server changes", () =>
    Effect.gen(function* () {
      const firstUnwatched: Array<string> = [];
      const secondUnwatched: Array<string> = [];
      const renderProject = Effect.fnUntraced(function* () {
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure(project);
        yield* controller.attach(makeServer(firstUnwatched));
        yield* controller.generate({ output: "images" });
        yield* controller.attach(makeServer(secondUnwatched));

        deepStrictEqual(firstUnwatched, [
          "/project/src/.preview/A.preview.ts",
          "/project/src/images/B.preview.ts",
        ]);
        deepStrictEqual(secondUnwatched, [
          "/project/src/.preview/A.preview.ts",
          "/project/src/images/B.preview.ts",
        ]);
      }).pipe(
        Effect.provide(
          makeControllerLayer(renderProject, {
            ".preview": ["/project/src/.preview/A.preview.ts"],
            images: ["/project/src/images/B.preview.ts"],
          }),
        ),
      );
    }),
  );

  it.effect("stops automatic work after CLI preparation", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const renderProject = Effect.fnUntraced(function* () {
        yield* Ref.update(calls, (value) => value + 1);
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure(project);
        yield* controller.attach(makeServer());
        yield* controller.prepareCli;
        yield* controller.schedule();
        yield* TestClock.adjust("100 millis");
        strictEqual(yield* Ref.get(calls), 0);

        yield* controller.generate();
        strictEqual(yield* Ref.get(calls), 1);
      }).pipe(Effect.provide(makeControllerLayer(renderProject)));
    }),
  );

  it.effect("ignores only exact owned artifact directories", () =>
    Effect.gen(function* () {
      const artifactDirectory = "/project/src/Card.preview.ts";
      const renderProject = Effect.fnUntraced(function* () {
        return emptySummary;
      });

      yield* Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.configure(project);
        yield* controller.attach(makeServer());
        yield* controller.generate({ output: "src" });

        strictEqual(
          yield* controller.isOutputPath(`${artifactDirectory}/mobile.png`),
          true,
        );
        strictEqual(
          yield* controller.isOutputPath("/project/src/logo.png"),
          false,
        );
      }).pipe(
        Effect.provide(
          makeControllerLayer(renderProject, {
            src: [artifactDirectory],
          }),
        ),
      );
    }),
  );
});
