import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as TestConsole from "effect/testing/TestConsole";
import * as Cli from "../src/internal/cli/cli";
import type * as Generation from "../src/internal/generation";
import * as ProjectRunner from "../src/internal/cli/services/ProjectRunner";

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
  it.effect("forwards a source-relative output override", () =>
    Cli.generate({
        ...options,
        output: "artifacts/previews",
      }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(Effect.fnUntraced(function* (received) {
            deepStrictEqual(received, {
              root,
              paths: [],
              output: "artifacts/previews",
            });
            return { artifacts: [], failures: [] };
          })),
        ),
      ),
    ),
  );

  it.effect("reports generated artifact paths relative to the project", () => {
    const summary: Generation.GenerationSummary = {
      artifacts: [
        {
          source: "/project/src/Card.preview.tsx",
          variant: "state=ready",
          viewport: "desktop",
          pngPath:
            "/project/src/.preview/Card.preview.tsx/state=ready.desktop.png",
        },
      ],
      failures: [],
    };

    return Effect.gen(function* () {
      yield* Cli.generate(options);

      deepStrictEqual(yield* TestConsole.logLines, [
        "generated src/.preview/Card.preview.tsx/state=ready.desktop.png",
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
    const summary: Generation.GenerationSummary = {
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

  it.effect("uses Vite's development mode for CLI generation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectRoot = yield* fs.makeTempDirectoryScoped();
        const previewEntry = new URL("../src/index.ts", import.meta.url).href;
        yield* fs.writeFileString(
          path.join(projectRoot, "package.json"),
          '{"type":"module"}\n',
        );
        yield* fs.writeFileString(
          path.join(projectRoot, "vite.config.ts"),
          `import Preview from ${JSON.stringify(previewEntry)}

export default ({ mode }) => {
  if (mode !== "development") throw new Error(\`unexpected mode: \${mode}\`)
  return {
    logLevel: "silent",
    plugins: [
      Preview({
        files: { include: "**/*.missing-preview.ts" },
        capture: { viewports: { test: { width: 100, height: 100 } } }
      })
    ]
  }
}
`,
        );

        const runner = yield* ProjectRunner.ProjectRunner;
        const summary = yield* runner.generate({
          root: projectRoot,
          paths: [],
        });

        deepStrictEqual(summary, { artifacts: [], failures: [] });
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeFileSystem.layer,
          NodePath.layer,
          ProjectRunner.layer,
        ),
      ),
    ),
  );
});
