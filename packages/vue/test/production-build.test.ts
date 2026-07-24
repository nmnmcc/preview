import { strictEqual } from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preview from "@nmnmcc/preview";
import vue from "@vitejs/plugin-vue";
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

describe("Vue production builds", () => {
  it("removes Preview-labeled blocks after the Vue compiler", async () => {
    const root = await mkdtemp(join(workspaceRoot, ".preview-vue-build-"));
    try {
      const files = {
        "package.json": JSON.stringify({ private: true, type: "module" }),
        "src/main.ts": `import App from "./App.vue"; console.log(App);`,
        "src/App.vue": `<script lang="ts">
import type { PreviewEmit } from "@nmnmcc/preview";
import { defineComponent, onMounted } from "vue";
export default defineComponent({
  setup() {
    const emit: PreviewEmit | undefined = undefined;
    preview: {
      onMounted(() => {
        console.log("vue-normal-preview-only");
        void emit?.("default");
      });
    }
    return { normal: "vue-normal-kept" };
  }
});
</script>
<script setup lang="ts">
import type { PreviewEmit } from "@nmnmcc/preview";
import { onMounted } from "vue";

const { emit } = defineProps<{ readonly emit?: PreviewEmit }>();

preview: {
  onMounted(() => {
    console.log("vue-setup-preview-only");
    void emit?.("default");
  });
}
const setup = "vue-setup-kept";
</script>
<template><p>{{ normal }} {{ setup }}</p></template>`,
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
              external: (id) => id === "vue" || id.startsWith("vue/"),
              input: join(root, "src/main.ts"),
            },
            write: false,
          },
          configFile: false,
          logLevel: "silent",
          plugins: [
            vue(),
            preview({
              capture: {
                viewports: { test: { height: 100, width: 100 } },
              },
            }),
          ],
          root,
        }),
      );
      strictEqual(code.includes("vue-normal-kept"), true);
      strictEqual(code.includes("vue-setup-kept"), true);
      strictEqual(code.includes("vue-normal-preview-only"), false);
      strictEqual(code.includes("vue-setup-preview-only"), false);
      strictEqual(code.includes("preview:"), false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
