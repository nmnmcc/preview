import { rejects } from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import preview from "../src/index";
import * as ProjectRunner from "../src/internal/cli/services/ProjectRunner";
import * as Artifacts from "../src/internal/services/Artifacts";

const pluginOptions = {
  artifacts: { clean: true, output: "configured" },
  capture: { viewports: { test: { width: 100, height: 100 } } },
} as const;

const runGeneration = (root: string, output?: string) =>
  Effect.gen(function* () {
    const runner = yield* ProjectRunner.ProjectRunner;
    return yield* runner.generate({
      root,
      paths: [],
      ...(output === undefined ? {} : { output }),
    });
  }).pipe(
    Effect.provide(ProjectRunner.layer),
    Effect.runPromise,
  );

describe("preview plugin control", () => {
  it("returns a standard Vite plugin without a public generation API", () => {
    const plugin = preview(pluginOptions);

    strictEqual(plugin.name, "@nmnmcc/preview");
    strictEqual(Reflect.has(plugin, "previewApi"), false);
  });

  it("lets the CLI use the private control for the configured plugin", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-control-"));
    const configuredStalePng = join(
      root,
      "src",
      "configured",
      "Stale.preview.ts",
      "test.png",
    );
    const overrideStalePng = join(
      root,
      "src",
      "override",
      "Stale.preview.ts",
      "test.png",
    );
    try {
      await Promise.all([
        mkdir(join(configuredStalePng, ".."), { recursive: true }),
        mkdir(join(overrideStalePng, ".."), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(configuredStalePng, Uint8Array.from([137, 80, 78, 71])),
        writeFile(overrideStalePng, Uint8Array.from([137, 80, 78, 71])),
        writeFile(
          join(configuredStalePng, "..", Artifacts.OwnershipMarkerName),
          Artifacts.OwnershipMarkerContent,
        ),
        writeFile(
          join(overrideStalePng, "..", Artifacts.OwnershipMarkerName),
          Artifacts.OwnershipMarkerContent,
        ),
        writeFile(
          join(root, "package.json"),
          JSON.stringify({ private: true, type: "module" }),
        ),
        writeFile(
          join(root, "vite.config.ts"),
          `import preview from ${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)};
export default { logLevel: "silent", plugins: [preview(${JSON.stringify(pluginOptions)})] };
`,
        ),
      ]);

      deepStrictEqual(await runGeneration(root, "override"), {
        artifacts: [],
        failures: [],
      });
      await Promise.all([
        rejects(access(configuredStalePng), /ENOENT/u),
        rejects(access(overrideStalePng), /ENOENT/u),
      ]);
      await rejects(runGeneration(root, "../outside"), /generation failed/iu);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reports a Vite config without the preview plugin", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-no-plugin-"));
    try {
      await writeFile(
        join(root, "vite.config.ts"),
        `export default { logLevel: "silent" };\n`,
      );
      await rejects(
        runGeneration(root),
        /does not include @nmnmcc\/preview/u,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
