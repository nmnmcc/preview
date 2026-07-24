import process from "node:process";
import { stripVTControlCharacters } from "node:util";
import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import * as NodeStdio from "@effect/platform-node-shared/NodeStdio";
import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as TestConsole from "effect/testing/TestConsole";
import { Command } from "effect/unstable/cli";
import * as Cli from "../src/internal/cli/cli";
import previewCommand from "../src/internal/cli/commands/preview";
import * as ProjectRunner from "../src/internal/cli/services/ProjectRunner";
import type * as Generation from "../src/internal/generation";

const root = "/project";
const options: ProjectRunner.GenerateOptions = { root, paths: [] };
const ViteTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});
const testTime = ViteTimeFormatter.format(new Date(0));

const plainLines = (lines: ReadonlyArray<unknown>): ReadonlyArray<string> =>
  lines.map((line) => stripVTControlCharacters(String(line)));

const runnerLayer = (generate: ProjectRunner.Interface["generate"]) =>
  Layer.succeed(
    ProjectRunner.ProjectRunner,
    ProjectRunner.ProjectRunner.of({ generate }),
  );

const cliLayer = (runner: Layer.Layer<ProjectRunner.ProjectRunner>) =>
  Layer.merge(NodePath.layer, runner);

const commandBaseLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  NodeStdio.layer,
  NodeTerminal.layer,
);

const commandLayer = (runner: Layer.Layer<ProjectRunner.ProjectRunner>) =>
  Layer.mergeAll(
    commandBaseLayer,
    NodeChildProcessSpawner.layer.pipe(Layer.provide(commandBaseLayer)),
    runner,
  );

describe("preview CLI", () => {
  it.effect("parses the default command output override", () => {
    const received: Array<ProjectRunner.GenerateOptions> = [];

    return Effect.gen(function* () {
      yield* Command.runWith(previewCommand, { version: "test" })([
        "--output",
        "artifacts/previews",
      ]);

      deepStrictEqual(received, [
        {
          root: process.cwd(),
          paths: [],
          output: "artifacts/previews",
        },
      ]);
    }).pipe(
      Effect.provide(
        commandLayer(
          runnerLayer(
            Effect.fnUntraced(function* (options) {
              received.push(options);
              return { artifacts: [], failures: [] };
            }),
          ),
        ),
      ),
    );
  });

  it.effect("parses generate root, output, and source paths", () => {
    const received: Array<ProjectRunner.GenerateOptions> = [];

    return Effect.gen(function* () {
      yield* Command.runWith(previewCommand, { version: "test" })([
        "generate",
        "--root",
        process.cwd(),
        "--output",
        "images",
        "src/Card.preview.tsx",
        "src/**/*.preview.tsx",
      ]);

      deepStrictEqual(received, [
        {
          root: process.cwd(),
          paths: ["src/Card.preview.tsx", "src/**/*.preview.tsx"],
          output: "images",
        },
      ]);
    }).pipe(
      Effect.provide(
        commandLayer(
          runnerLayer(
            Effect.fnUntraced(function* (options) {
              received.push(options);
              return { artifacts: [], failures: [] };
            }),
          ),
        ),
      ),
    );
  });

  it.effect("forwards a source-relative output override", () =>
    Cli.generate({
      ...options,
      output: "artifacts/previews",
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(
            Effect.fnUntraced(function* (received) {
              deepStrictEqual(received, {
                root,
                paths: [],
                output: "artifacts/previews",
              });
              return { artifacts: [], failures: [] };
            }),
          ),
        ),
      ),
    ),
  );

  it.effect("reports artifact paths relative to the preview file", () => {
    const summary: Generation.GenerationSummary = {
      artifacts: [
        {
          source: "/project/src/Card.preview.tsx",
          variant: "state=ready",
          state: "ready",
          viewport: "desktop",
          pngPath:
            "/project/src/.preview/Card.preview.tsx/ready/state=ready,viewport=desktop.png",
        },
      ],
      failures: [],
    };

    return Effect.gen(function* () {
      yield* Cli.generate(options);

      deepStrictEqual(plainLines(yield* TestConsole.logLines), [
        `${testTime} [preview] Card -> .preview/Card.preview.tsx/ready/state=ready,viewport=desktop.png`,
      ]);
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(
            Effect.fnUntraced(function* () {
              return summary;
            }),
          ),
        ),
      ),
    );
  });

  it.effect("reports the inspection README and overview", () => {
    const summary: Generation.GenerationSummary = {
      artifacts: [
        {
          source: "/project/src/Card.preview.tsx",
          state: "default",
          viewport: "desktop",
          pngPath:
            "/project/src/.preview/Card.preview.tsx/default/viewport=desktop.png",
          inspection: {
            directoryPath:
              "/project/src/.preview/Card.preview.tsx/default/viewport=desktop.inspect",
            readmePath:
              "/project/src/.preview/Card.preview.tsx/default/viewport=desktop.inspect/README.md",
            manifestPath:
              "/project/src/.preview/Card.preview.tsx/default/viewport=desktop.inspect/manifest.json",
            overviewPath:
              "/project/src/.preview/Card.preview.tsx/default/viewport=desktop.inspect/overview.png",
            findings: { errors: 0, warnings: 2 },
            checks: { passed: 3, failed: 0, unresolved: 0 },
          },
        },
      ],
      failures: [],
    };

    return Effect.gen(function* () {
      yield* Cli.generate(options);

      deepStrictEqual(plainLines(yield* TestConsole.logLines), [
        `${testTime} [preview] Card -> .preview/Card.preview.tsx/default/viewport=desktop.png; inspect .preview/Card.preview.tsx/default/viewport=desktop.inspect/README.md, .preview/Card.preview.tsx/default/viewport=desktop.inspect/overview.png (0 errors, 2 warnings; checks 3 passed, 0 failed, 0 unresolved)`,
      ]);
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(
            Effect.fnUntraced(function* () {
              return summary;
            }),
          ),
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
      deepStrictEqual(plainLines(yield* TestConsole.errorLines), [
        `${testTime} [preview] Card -> Render failed.`,
      ]);
    }).pipe(
      Effect.provide(
        cliLayer(
          runnerLayer(
            Effect.fnUntraced(function* () {
              return summary;
            }),
          ),
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
          runnerLayer(
            Effect.fnUntraced(function* () {
              return yield* runnerError;
            }),
          ),
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
