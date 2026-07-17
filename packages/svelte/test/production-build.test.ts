import { strictEqual } from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preview from "@nmnmcc/preview";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import * as Schema from "effect/Schema";
import { build } from "vite";
import { describe, it } from "vitest";

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);

const BuildOutput = Schema.Struct({
  output: Schema.Array(Schema.Unknown),
});

const BuildChunk = Schema.Struct({
  type: Schema.Literal("chunk"),
  code: Schema.String,
});

const isBuildOutput = Schema.is(BuildOutput);
const isBuildChunk = Schema.is(BuildChunk);

const outputCode = (result: unknown): string => {
  if (!isBuildOutput(result)) return "";
  return result.output
    .filter(isBuildChunk)
    .map((file) => file.code)
    .join("\n");
};

describe("Svelte production builds", () => {
  it("removes Preview-labeled blocks after the Svelte compiler", async () => {
    const root = await mkdtemp(join(workspaceRoot, ".preview-svelte-build-"));
    try {
      const files = {
        "package.json": JSON.stringify({ private: true, type: "module" }),
        "src/main.ts": `import App from "./App.svelte"; console.log(App);`,
        "src/App.svelte": `<script lang="ts">
  import type { PreviewReady } from "@nmnmcc/preview";
  import { onMount } from "svelte";

  let { ready }: { readonly ready?: PreviewReady } = $props();

  preview: {
    onMount(() => {
      console.log("svelte-preview-only");
      ready?.();
    });
  }
  const message = "svelte-kept";
</script>
<p>{message}</p>`,
      };
      await Promise.all(
        Object.entries(files).map(async ([file, content]) => {
          const path = join(root, file);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content);
        }),
      );

      const code = outputCode(
        await build({
          build: {
            minify: false,
            rolldownOptions: {
              external: (id) => id === "svelte" || id.startsWith("svelte/"),
              input: join(root, "src/main.ts"),
            },
            write: false,
          },
          configFile: false,
          logLevel: "silent",
          plugins: [
            svelte(),
            preview({
              capture: {
                viewports: { test: { height: 100, width: 100 } },
              },
            }),
          ],
          root,
        }),
      );
      strictEqual(code.includes("svelte-kept"), true);
      strictEqual(code.includes("svelte-preview-only"), false);
      strictEqual(code.includes("preview:"), false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
