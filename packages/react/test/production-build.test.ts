import { strictEqual } from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preview from "@nmnmcc/preview";
import react from "@vitejs/plugin-react";
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

describe("React production builds", () => {
  it("removes Preview-labeled blocks after the React compiler", async () => {
    const root = await mkdtemp(join(workspaceRoot, ".preview-react-build-"));
    try {
      const files = {
        "package.json": JSON.stringify({ private: true, type: "module" }),
        "src/main.tsx": `import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";

function App({ done, emit }: { readonly done?: PreviewDone; readonly emit?: PreviewEmit }) {
  preview: {
    useEffect(() => {
      console.log("react-preview-only");
      if (done !== undefined && emit !== undefined) void emit("default").then(done);
    }, [done, emit]);
  }
  return createElement("p", null, "react-kept");
}

const root = document.createElement("main");
createRoot(root).render(createElement(App));`,
      };
      await Promise.all(
        Object.entries(files).map(async ([file, content]) => {
          const path = join(root, file);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content);
        }),
      );

      const result = await build({
        build: {
          minify: false,
          rolldownOptions: {
            external: (id) =>
              id === "react" ||
              id.startsWith("react/") ||
              id === "react-dom" ||
              id.startsWith("react-dom/"),
            input: join(root, "src/main.tsx"),
          },
          write: false,
        },
        configFile: false,
        logLevel: "silent",
        plugins: [
          react(),
          preview({
            capture: {
              viewports: { test: { height: 100, width: 100 } },
            },
          }),
        ],
        root,
      });
      const code = outputCode(result);
      strictEqual(code.includes("react-kept"), true);
      strictEqual(code.includes("react-preview-only"), false);
      strictEqual(code.includes("preview:"), false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
