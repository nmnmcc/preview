import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { createServer } from "vite";
import preview from "../src/index";
import * as Generation from "../src/internal/generation";
import * as PluginControl from "../src/internal/plugin-control";

const pngSize = async (
  path: string,
): Promise<readonly [width: number, height: number]> => {
  const png = await readFile(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe("preview capture", () => {
  it("uses Playwright options for both targets and keeps Preview capture rules", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-capture-"));
    const plugin = preview({
      capture: {
        concurrency: 2,
        playwright: {
          launch: { args: ["--user-agent=PreviewPlaywrightLaunch"] },
          context: { colorScheme: "dark", locale: "fr-FR" },
          screenshot: { animations: "disabled", scale: "css" },
        },
        viewports: {
          custom: { width: 160, height: "full-1000" },
          fixed: { width: 160, height: 90, deviceScaleFactor: 2 },
          full: { width: 160, height: "full" },
        },
        timeoutMs: 5_000,
      },
    });

    await Promise.all([
      writeFile(
        join(root, "index.html"),
        `<!doctype html><html><body><main id="app"></main><script type="module" src="/app.ts"></script></body></html>`,
      ),
      writeFile(
        join(root, "app.ts"),
        `import { ready } from "@nmnmcc/preview/application";
const app = document.querySelector("#app");
if (app === null) throw new Error("App root is missing");
if (navigator.userAgent !== "PreviewPlaywrightLaunch") throw new Error("Application launch options are missing");
if (navigator.language !== "fr-FR") throw new Error("Application locale is missing");
if (!matchMedia("(prefers-color-scheme: dark)").matches) throw new Error("Application color scheme is missing");
const registration = await navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
if (registration !== undefined) throw new Error("Application Service Worker was not blocked");
app.textContent = "Application ready";
document.body.style.margin = "0";
app.style.height = "700px";
app.style.minHeight = "100vh";
ready();`,
      ),
      writeFile(
        join(root, "Application.preview.ts"),
        `import { application } from "@nmnmcc/preview/application";
export default application({ location: "/" });`,
      ),
      writeFile(
        join(root, "Sandbox.preview.ts"),
        `import { preview } from "@nmnmcc/preview";
export default preview({
  mount: async ({ root, ready }) => {
    if (navigator.userAgent !== "PreviewPlaywrightLaunch") throw new Error("Sandbox launch options are missing");
    if (navigator.language !== "fr-FR") throw new Error("Sandbox locale is missing");
    if (!matchMedia("(prefers-color-scheme: dark)").matches) throw new Error("Sandbox color scheme is missing");
    const registration = await navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    if (registration !== undefined) throw new Error("Sandbox Service Worker was not blocked");
    root.textContent = "Sandbox ready";
    document.body.style.margin = "0";
    root.style.height = "700px";
    root.style.minHeight = "100vh";
    ready();
    return window.innerHeight === 90
      ? () => new Promise(() => undefined)
      : () => undefined;
  }
});`,
      ),
      writeFile(
        join(root, "service-worker.js"),
        `self.addEventListener("fetch", () => {});`,
      ),
      writeFile(
        join(root, "External.preview.ts"),
        `import { application } from "@nmnmcc/preview/application";
export default application({
  location: "https://example.com/",
  viewports: { fixed: true }
});`,
      ),
    ]);

    const server = await createServer({
      cacheDir: join(root, ".vite"),
      configFile: false,
      logLevel: "silent",
      mode: "preview-cli",
      plugins: [plugin],
      resolve: {
        alias: [
          {
            find: "@nmnmcc/preview/application",
            replacement: fileURLToPath(
              new URL("../src/Application.ts", import.meta.url),
            ),
          },
          {
            find: /^@nmnmcc\/preview$/,
            replacement: fileURLToPath(
              new URL("../src/browser.ts", import.meta.url),
            ),
          },
        ],
      },
      root,
      server: { host: "127.0.0.1", port: 0 },
    });

    try {
      const decodedControl = PluginControl.decode(plugin);
      if (Result.isFailure(decodedControl)) {
        throw new Error("The preview plugin control is missing.");
      }
      await Reflect.apply(
        decodedControl.success.prepareCli,
        decodedControl.success,
        [],
      );
      await server.listen();
      const value: unknown = await Reflect.apply(
        decodedControl.success.generate,
        decodedControl.success,
        [{ output: "artifacts/previews" }],
      );
      const summary = await Schema.decodeUnknownPromise(
        Generation.GenerationSummary,
      )(value);

      strictEqual(
        summary.failures.length,
        1,
        summary.failures
          .map(
            ({ source, variant, viewport, message }) =>
              `${source}${variant === undefined ? "" : ` variant ${variant}`}${viewport === undefined ? "" : ` at ${viewport}`}: ${message}`,
          )
          .join("\n"),
      );
      const failure = summary.failures[0];
      if (failure === undefined) throw new Error("The failure is missing.");
      assertInclude(failure.source, "External.preview.ts");
      assertInclude(failure.message, "Vite server origin");
      strictEqual(summary.artifacts.length, 6);
      const paths = summary.artifacts
        .map((artifact) => artifact.pngPath)
        .toSorted();
      deepStrictEqual(
        paths.map((path) => path.slice(root.length + 1)),
        [
          "artifacts/previews/Application.preview.ts/custom.png",
          "artifacts/previews/Application.preview.ts/fixed.png",
          "artifacts/previews/Application.preview.ts/full.png",
          "artifacts/previews/Sandbox.preview.ts/custom.png",
          "artifacts/previews/Sandbox.preview.ts/fixed.png",
          "artifacts/previews/Sandbox.preview.ts/full.png",
        ],
      );
      deepStrictEqual(await Promise.all(paths.map(pngSize)), [
        [160, 1000],
        [160, 90],
        [160, 720],
        [160, 1000],
        [160, 90],
        [160, 720],
      ]);
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);

  it("blocks external browser requests for both targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-external-"));
    const plugin = preview({
      capture: {
        timeoutMs: 2_000,
        viewports: { test: { width: 100, height: 100 } },
      },
    });

    await Promise.all([
      writeFile(
        join(root, "index.html"),
        `<!doctype html><html><body><script type="module" src="/app.ts"></script></body></html>`,
      ),
      writeFile(
        join(root, "app.ts"),
        `import { ready } from "@nmnmcc/preview/application";
await fetch("https://example.com/application").catch(() => undefined);
ready();`,
      ),
      writeFile(
        join(root, "Application.preview.ts"),
        `import { application } from "@nmnmcc/preview/application";
export default application({ location: "/" });`,
      ),
      writeFile(
        join(root, "Sandbox.preview.ts"),
        `import { preview } from "@nmnmcc/preview";
export default preview({
  mount: async ({ root, ready }) => {
    await fetch("https://example.com/sandbox").catch(() => undefined);
    root.textContent = "blocked";
    ready();
    return () => undefined;
  }
});`,
      ),
    ]);

    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      mode: "preview-cli",
      plugins: [plugin],
      resolve: {
        alias: [
          {
            find: "@nmnmcc/preview/application",
            replacement: fileURLToPath(
              new URL("../src/Application.ts", import.meta.url),
            ),
          },
          {
            find: /^@nmnmcc\/preview$/,
            replacement: fileURLToPath(
              new URL("../src/browser.ts", import.meta.url),
            ),
          },
        ],
      },
      root,
      server: { host: "127.0.0.1", port: 0 },
    });

    try {
      const decodedControl = PluginControl.decode(plugin);
      if (Result.isFailure(decodedControl)) {
        throw new Error("The preview plugin control is missing.");
      }
      await Reflect.apply(
        decodedControl.success.prepareCli,
        decodedControl.success,
        [],
      );
      await server.listen();
      const value: unknown = await Reflect.apply(
        decodedControl.success.generate,
        decodedControl.success,
        [],
      );
      const summary = await Schema.decodeUnknownPromise(
        Generation.GenerationSummary,
      )(value);

      deepStrictEqual(summary.artifacts, []);
      strictEqual(summary.failures.length, 2);
      deepStrictEqual(
        summary.failures.map(({ source }) => source.slice(root.length + 1)),
        ["Application.preview.ts", "Sandbox.preview.ts"],
      );
      const messages = summary.failures
        .map(({ message }) => message)
        .join("\n");
      assertInclude(messages, "External requests are not allowed");
      assertInclude(messages, "https://example.com/application");
      assertInclude(messages, "https://example.com/sandbox");
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);
});
