import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import type { PreviewGeneration } from "@nmnmcc/preview";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestConsole from "effect/testing/TestConsole";
import * as Cli from "../src/internal/cli";
import * as ProjectRunner from "../src/internal/services/ProjectRunner";

const root = "/project";
const options: ProjectRunner.GenerateOptions = { root, paths: [] };

const runnerLayer = (generate: ProjectRunner.Interface["generate"]) =>
  Layer.succeed(
    ProjectRunner.ProjectRunner,
    ProjectRunner.ProjectRunner.of({ generate }),
  );

const cliLayer = (runner: Layer.Layer<ProjectRunner.ProjectRunner>) =>
  Layer.merge(NodePath.layer, runner);

describe("preview CLI", () => {
  it.effect("reports generated artifact paths relative to the project", () => {
    const summary: PreviewGeneration.GenerationSummary = {
      artifacts: [
        {
          source: "/project/src/Card.preview.tsx",
          variant: "state=ready",
          viewport: "desktop",
          pngPath: "/project/src/.preview/Card.state=ready.desktop.png",
        },
      ],
      failures: [],
    };

    return Effect.gen(function* () {
      yield* Cli.generate(options);

      deepStrictEqual(yield* TestConsole.logLines, [
        "generated src/.preview/Card.state=ready.desktop.png",
      ]);
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(Effect.fnUntraced(function* () {
            return summary;
          })),
        ),
      ),
    );
  });

  it.effect("returns a CLI error after reporting generation failures", () => {
    const summary: PreviewGeneration.GenerationSummary = {
      artifacts: [],
      failures: [
        {
          source: "/project/src/Card.preview.tsx",
          variant: "state=error",
          message: "Render failed.",
        },
      ],
    };

    return Effect.gen(function* () {
      const error = yield* Effect.flip(Cli.generate(options));

      strictEqual(error._tag, "PreviewCliError");
      deepStrictEqual(yield* TestConsole.errorLines, ["Render failed."]);
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(Effect.fnUntraced(function* () {
            return summary;
          })),
        ),
      ),
    );
  });

  it.effect("keeps project runner failures typed", () => {
    const runnerError = new ProjectRunner.PreviewProjectRunnerError({
      detail: "Could not start Vite.",
    });

    return Effect.gen(function* () {
      const error = yield* Effect.flip(Cli.generate(options));

      strictEqual(error, runnerError);
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(Effect.fnUntraced(function* () {
            return yield* runnerError;
          })),
        ),
      ),
    );
  });
});
