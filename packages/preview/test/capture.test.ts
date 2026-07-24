import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { Inspection, default as preview } from "../src/index";
import * as Generation from "../src/internal/generation";
import * as PluginControl from "../src/internal/plugin-control";

const pngSize = async (
  path: string,
): Promise<readonly [width: number, height: number]> => {
  const png = await readFile(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe("preview capture", () => {
  it("continues both capture targets in the same page after a document reload", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-document-reload-"));
    const plugin = preview({
      capture: {
        concurrency: 1,
        timeoutMs: 5_000,
        viewports: { test: { width: 160, height: 90 } },
      },
    });

    await Promise.all([
      writeFile(
        join(root, "index.html"),
        '<!doctype html><html><body><main id="app"></main><script type="module" src="/app.ts"></script></body></html>',
      ),
      writeFile(
        join(root, "app.ts"),
        `import { done, emit } from "@nmnmcc/preview/application";
const key = "preview-application-document";
const documentNumber = Number(sessionStorage.getItem(key) ?? "0") + 1;
sessionStorage.setItem(key, String(documentNumber));
const app = document.querySelector("#app");
if (app === null) throw new Error("App root is missing");
if (documentNumber === 1) {
  app.textContent = "old application document";
  await emit("old");
  location.reload();
  await new Promise(() => undefined);
}
app.textContent = \`application document \${documentNumber}\`;
await emit("default");
done();`,
      ),
      writeFile(
        join(root, "Application.preview.ts"),
        `import { application } from "@nmnmcc/preview/application";
export default application({ location: "/" });`,
      ),
      writeFile(
        join(root, "Sandbox.preview.ts"),
        `import { preview } from "@nmnmcc/preview";
const key = "preview-sandbox-document";
const documentNumber = Number(sessionStorage.getItem(key) ?? "0") + 1;
sessionStorage.setItem(key, String(documentNumber));
export default preview({
  mount: async ({ root, emit, done }) => {
    if (documentNumber === 1) {
      root.textContent = "old sandbox document";
      await emit("old");
      location.reload();
      await new Promise(() => undefined);
    }
    root.textContent = \`sandbox document \${documentNumber}\`;
    await emit("default");
    done();
    return () => undefined;
  }
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
        [],
      );
      const summary = await Schema.decodeUnknownPromise(
        Generation.GenerationSummary,
      )(value);

      deepStrictEqual(summary.failures, []);
      deepStrictEqual(
        summary.artifacts
          .map(({ source, state }) => ({
            source: source.slice(root.length + 1),
            state,
          }))
          .toSorted((left, right) => left.source.localeCompare(right.source)),
        [
          { source: "Application.preview.ts", state: "default" },
          { source: "Sandbox.preview.ts", state: "default" },
        ],
      );
      strictEqual(summary.artifacts.length, 2);
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);

  it("reloads an active capture when Vite broadcasts a full reload", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-vite-full-reload-"));
    const plugin = preview({
      capture: {
        concurrency: 1,
        timeoutMs: 5_000,
        viewports: { test: { width: 160, height: 90 } },
      },
    });
    let reportCaptureStarted = (): void => undefined;
    const captureStarted = new Promise<void>((resolve) => {
      reportCaptureStarted = resolve;
    });

    await writeFile(
      join(root, "Reload.preview.ts"),
      `import { preview } from "@nmnmcc/preview";
export default preview({
  mount: async ({ root, emit, done }) => {
    const key = "preview-vite-full-reload";
    const documentNumber = Number(sessionStorage.getItem(key) ?? "0") + 1;
    sessionStorage.setItem(key, String(documentNumber));
    if (documentNumber === 1) {
      await fetch("/capture-started");
      await new Promise(() => undefined);
    }
    root.textContent = \`document \${documentNumber}\`;
    await emit("default");
    done();
    return () => undefined;
  }
});`,
    );

    const server = await createServer({
      cacheDir: join(root, ".vite"),
      configFile: false,
      logLevel: "silent",
      mode: "preview-cli",
      plugins: [
        {
          name: "capture-started",
          configureServer(viteServer) {
            viteServer.middlewares.use(
              "/capture-started",
              (_request, response) => {
                reportCaptureStarted();
                response.statusCode = 204;
                response.end();
              },
            );
          },
        },
        plugin,
      ],
      resolve: {
        alias: [
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
      const generated: Promise<unknown> = Reflect.apply(
        decodedControl.success.generate,
        decodedControl.success,
        [],
      );
      await captureStarted;
      server.environments.client.hot.send({
        type: "full-reload",
        path: "*",
      });
      const summary = await Schema.decodeUnknownPromise(
        Generation.GenerationSummary,
      )(await generated);

      deepStrictEqual(summary.failures, []);
      strictEqual(summary.artifacts.length, 1);
      strictEqual(summary.artifacts[0]?.state, "default");
      assertInclude(summary.artifacts[0]?.source ?? "", "Reload.preview.ts");
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);

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
        `import { done, emit } from "@nmnmcc/preview/application";
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
await emit("default");
done();`,
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
  mount: async ({ root, emit, done }) => {
    if (navigator.userAgent !== "PreviewPlaywrightLaunch") throw new Error("Sandbox launch options are missing");
    if (navigator.language !== "fr-FR") throw new Error("Sandbox locale is missing");
    if (!matchMedia("(prefers-color-scheme: dark)").matches) throw new Error("Sandbox color scheme is missing");
    const registration = await navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    if (registration !== undefined) throw new Error("Sandbox Service Worker was not blocked");
    root.textContent = "Sandbox initial";
    document.body.style.margin = "0";
    root.style.height = "700px";
    root.style.minHeight = "100vh";
    await emit("initial");
    root.textContent = "Sandbox ready";
    await emit("default");
    done();
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
      strictEqual(summary.artifacts.length, 9);
      const paths = summary.artifacts
        .map((artifact) => artifact.pngPath)
        .toSorted();
      deepStrictEqual(
        paths.map((path) => path.slice(root.length + 1)),
        [
          "artifacts/previews/Application.preview.ts/default/viewport=custom.png",
          "artifacts/previews/Application.preview.ts/default/viewport=fixed.png",
          "artifacts/previews/Application.preview.ts/default/viewport=full.png",
          "artifacts/previews/Sandbox.preview.ts/default/viewport=custom.png",
          "artifacts/previews/Sandbox.preview.ts/default/viewport=fixed.png",
          "artifacts/previews/Sandbox.preview.ts/default/viewport=full.png",
          "artifacts/previews/Sandbox.preview.ts/initial/viewport=custom.png",
          "artifacts/previews/Sandbox.preview.ts/initial/viewport=fixed.png",
          "artifacts/previews/Sandbox.preview.ts/initial/viewport=full.png",
        ],
      );
      deepStrictEqual(await Promise.all(paths.map(pngSize)), [
        [160, 1000],
        [160, 90],
        [160, 720],
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
        `import { done, emit } from "@nmnmcc/preview/application";
await fetch("https://example.com/application").catch(() => undefined);
void emit("default").then(done);`,
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
  mount: async ({ root, emit, done }) => {
    await fetch("https://example.com/sandbox").catch(() => undefined);
    root.textContent = "blocked";
    void emit("default").then(done);
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

  it("writes a filesystem inspection with overview and finding evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-inspection-"));
    const plugin = preview({
      artifacts: { clean: true },
      capture: {
        concurrency: 1,
        inspection: true,
        timeoutMs: 10_000,
        viewports: { desktop: { width: 320, height: 240 } },
      },
    });

    await writeFile(
      join(root, "Layout.preview.ts"),
      `import { Inspection, preview } from "@nmnmcc/preview";

const inspection = Inspection.define({
  scope: "#canvas",
  ignore: ["["],
	  elements: {
	    action: "#card-action",
	    card: "#card",
	    badge: "#badge",
	    blocked: "#blocked",
	    duplicate: ".duplicate",
	    hidden: "#hidden",
	    missing: "#missing",
	    outside: "#outside",
	    overlapBack: "#overlap-back",
	    overlapFront: "#overlap-front"
	  },
  checks: ({ badge, card }) => ({
    "card-clear": Inspection.unobscured(card, { minimumRatio: 0.5 }),
    "card-fits": Inspection.contentFits(card),
    "card-in-view": Inspection.inside(card, Inspection.viewport),
    "card-visible": Inspection.visible(card),
    "card-size": Inspection.minSize(card, { width: 100, height: 60 }),
    "card-unclipped": Inspection.notClipped(card),
    separate: Inspection.noOverlap(card, badge)
  })
});

export default preview({
  inspection,
  mount: async ({ root, emit, done }) => {
    document.body.style.margin = "0";
	    root.innerHTML = '<main id="canvas"><section id="card">Card<button id="card-action">Action</button></section><span id="badge">Badge</span><div id="clip"><span>Clipped content is wider than its box</span></div><button id="blocked">Blocked</button><div id="cover"></div><button id="outside">Outside</button><button id="overlap-back">Back</button><button id="overlap-front">Front</button><div id="hidden">Hidden</div><i class="duplicate"></i><i class="duplicate"></i></main>';
	    const canvas = root.querySelector("#canvas");
	    const card = root.querySelector("#card");
	    const action = root.querySelector("#card-action");
	    const badge = root.querySelector("#badge");
	    const clip = root.querySelector("#clip");
	    const blocked = root.querySelector("#blocked");
	    const cover = root.querySelector("#cover");
	    const outside = root.querySelector("#outside");
	    const overlapBack = root.querySelector("#overlap-back");
	    const overlapFront = root.querySelector("#overlap-front");
	    const hidden = root.querySelector("#hidden");
	    if (!(canvas instanceof HTMLElement) || !(card instanceof HTMLElement) || !(action instanceof HTMLElement) || !(badge instanceof HTMLElement) || !(clip instanceof HTMLElement) || !(blocked instanceof HTMLElement) || !(cover instanceof HTMLElement) || !(outside instanceof HTMLElement) || !(overlapBack instanceof HTMLElement) || !(overlapFront instanceof HTMLElement) || !(hidden instanceof HTMLElement)) throw new Error("Fixture elements are missing");
	    Object.assign(canvas.style, { position: "relative", width: "500px", height: "240px", background: "#f8fafc" });
	    Object.assign(card.style, { position: "absolute", left: "30px", top: "30px", width: "160px", height: "100px", padding: "12px", border: "4px solid #2563eb", background: "white" });
	    Object.assign(action.style, { display: "block", height: "28px", width: "60px" });
	    Object.assign(badge.style, { position: "absolute", left: "150px", top: "90px", width: "90px", height: "44px", background: "#f59e0b" });
	    Object.assign(clip.style, { position: "absolute", left: "250px", top: "20px", width: "50px", height: "40px", overflow: "hidden", whiteSpace: "nowrap" });
	    Object.assign(blocked.style, { position: "absolute", left: "20px", top: "180px", width: "100px", height: "36px" });
	    Object.assign(cover.style, { position: "absolute", left: "20px", top: "180px", width: "100px", height: "36px", zIndex: "2", background: "#334155" });
	    Object.assign(outside.style, { position: "absolute", left: "400px", top: "20px", width: "80px", height: "40px" });
	    const overlapStyle = { position: "absolute", left: "230px", top: "180px", width: "64px", height: "32px" };
	    Object.assign(overlapBack.style, overlapStyle);
	    Object.assign(overlapFront.style, overlapStyle);
	    hidden.style.display = "none";
    await emit("default");
    done();
    return () => undefined;
  }
});`,
    );

    const server = await createServer({
      cacheDir: join(root, ".vite"),
      configFile: false,
      logLevel: "silent",
      mode: "preview-cli",
      plugins: [plugin],
      resolve: {
        alias: [
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

      strictEqual(summary.artifacts.length, 1);
      strictEqual(summary.failures.length, 1);
      const artifact = summary.artifacts[0];
      if (artifact === undefined || artifact.inspection === undefined) {
        throw new Error("The inspection artifact is missing.");
      }
      assertInclude(summary.failures[0]?.message ?? "", "Inspection found 4");
      strictEqual(artifact.inspection.checks.passed, 6);
      strictEqual(artifact.inspection.checks.failed, 1);
      strictEqual(artifact.inspection.checks.unresolved, 0);
      strictEqual(artifact.inspection.findings.errors, 4);
      strictEqual(artifact.inspection.findings.warnings > 0, true);

      const directory = artifact.inspection.directoryPath;
      deepStrictEqual((await readdir(directory)).toSorted(), [
        "README.md",
        "capture.json",
        "checks.json",
        "findings",
        "manifest.json",
        "nodes.json",
        "overview.png",
      ]);
      const manifest = await Schema.decodeUnknownPromise(Inspection.Manifest)(
        JSON.parse(await readFile(artifact.inspection.manifestPath, "utf8")),
      );
      const capture = await Schema.decodeUnknownPromise(Inspection.Capture)(
        JSON.parse(await readFile(join(directory, "capture.json"), "utf8")),
      );
      const nodes = await Schema.decodeUnknownPromise(Inspection.Nodes)(
        JSON.parse(await readFile(join(directory, "nodes.json"), "utf8")),
      );
      const checks = await Schema.decodeUnknownPromise(Inspection.Checks)(
        JSON.parse(await readFile(join(directory, "checks.json"), "utf8")),
      );
      const findingFiles = await Promise.all(
        manifest.findings.map(async ({ path }) =>
          Schema.decodeUnknownPromise(Inspection.FindingFile)(
            JSON.parse(
              await readFile(join(directory, path, "finding.json"), "utf8"),
            ),
          ),
        ),
      );
      const findings = findingFiles.map(({ finding }) => finding);
      const findingNodeIds = new Set(
        findings.flatMap(({ evidence }) => evidence.nodeIds),
      );
      strictEqual(findingNodeIds.size > 0, true);
      strictEqual(manifest.schemaVersion, 1);
      strictEqual(manifest.target.source, "Layout.preview.ts");
      strictEqual(manifest.target.state, "default");
      deepStrictEqual(manifest.files, {
        capture: "capture.json",
        checks: "checks.json",
        nodes: "nodes.json",
        overview: "overview.png",
      });
      deepStrictEqual(
        checks.map(({ name, status }) => ({ name, status })),
        [
          { name: "card-clear", status: "passed" },
          { name: "card-fits", status: "passed" },
          { name: "card-in-view", status: "passed" },
          { name: "card-size", status: "passed" },
          { name: "card-unclipped", status: "passed" },
          { name: "card-visible", status: "passed" },
          { name: "separate", status: "failed" },
        ],
      );
      deepStrictEqual(
        nodes
          .flatMap(({ name }) => (name === undefined ? [] : [name]))
          .toSorted(),
        [
          "action",
          "badge",
          "blocked",
          "card",
          "outside",
          "overlapBack",
          "overlapFront",
        ],
      );
      const actionNode = nodes.find(({ name }) => name === "action");
      const cardNode = nodes.find(({ name }) => name === "card");
      const overlapBackNode = nodes.find(({ name }) => name === "overlapBack");
      const overlapFrontNode = nodes.find(
        ({ name }) => name === "overlapFront",
      );
      if (
        actionNode === undefined ||
        cardNode === undefined ||
        overlapBackNode === undefined ||
        overlapFrontNode === undefined
      ) {
        throw new Error("The named inspection nodes are missing.");
      }
      strictEqual(
        overlapBackNode.id === overlapFrontNode.id,
        false,
        "Overlapping siblings need distinct DOM node IDs.",
      );
      strictEqual(
        findings.some(
          ({ evidence, rule }) =>
            rule === "possible-overlap" &&
            evidence.nodeIds.includes(overlapBackNode.id) &&
            evidence.nodeIds.includes(overlapFrontNode.id),
        ),
        true,
        "Overlapping siblings need automatic overlap evidence.",
      );
      strictEqual(
        findings.some(
          ({ evidence, rule }) =>
            rule === "possible-overlap" &&
            evidence.nodeIds.includes(cardNode.id) &&
            evidence.nodeIds.includes(actionNode.id),
        ),
        false,
        "A parent and its child must not get an automatic overlap hint.",
      );
      deepStrictEqual(
        findings
          .filter(({ source }) => source === "declaration")
          .map(({ id }) => id),
        [
          "declaration.element.duplicate",
          "declaration.element.missing",
          "declaration.ignore.1",
        ],
      );
      const hintRules = new Set(
        findings
          .filter(({ source }) => source === "hint")
          .map(({ rule }) => rule),
      );
      for (const rule of [
        "horizontal-overflow",
        "clipped-content",
        "invisible-target",
        "outside-capture",
        "occluded-target",
        "possible-overlap",
      ]) {
        strictEqual(hintRules.has(rule), true, `The ${rule} hint is missing.`);
      }
      strictEqual(
        findings.some(({ rule }) => rule === "unstable-after-emit"),
        false,
      );
      const separate = findingFiles.find(
        ({ finding }) => finding.id === "check.separate",
      );
      if (separate?.evidenceImage === undefined) {
        throw new Error("The overlap check evidence image is missing.");
      }
      deepStrictEqual(
        await pngSize(
          join(
            directory,
            manifest.findings.find(({ id }) => id === "check.separate")?.path ??
              "",
            separate.evidenceImage.path,
          ),
        ),
        [separate.evidenceImage.pngWidth, separate.evidenceImage.pngHeight],
      );
      const missing = findingFiles.find(
        ({ finding }) => finding.id === "declaration.element.missing",
      );
      strictEqual(missing?.evidenceImage, undefined);
      const outside = findingFiles.find(
        ({ finding }) => finding.rule === "outside-capture",
      );
      strictEqual(outside?.evidenceImage, undefined);
      const readme = await readFile(artifact.inspection.readmePath, "utf8");
      assertInclude(readme, "## Checks");
      assertInclude(readme, "check.separate");
      strictEqual(await readFile(join(directory, "README.md"), "utf8"), readme);
      deepStrictEqual(
        await pngSize(artifact.inspection.overviewPath),
        [320, 240],
      );
      deepStrictEqual(await pngSize(artifact.pngPath), [320, 240]);
      strictEqual(
        (await readFile(artifact.inspection.overviewPath)).equals(
          await readFile(artifact.pngPath),
        ),
        false,
      );
      strictEqual(
        (await readdir(join(directory, "findings", "errors"))).length,
        artifact.inspection.findings.errors,
      );
      strictEqual(
        (await readdir(join(directory, "findings", "warnings"))).length,
        artifact.inspection.findings.warnings,
      );
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);

  it("uses full-page hit tests, document bounds, and scoped shadow roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-inspection-bounds-"));
    const plugin = preview({
      capture: {
        concurrency: 1,
        inspection: true,
        timeoutMs: 10_000,
        viewports: { full: { width: 240, height: "full" } },
      },
    });

    await Promise.all([
      writeFile(
        join(root, "Painted.preview.ts"),
        `import { Inspection, preview } from "@nmnmcc/preview";

const inspection = Inspection.define({
  elements: {
    below: "#below",
    borderClipped: "#padding-clipped",
    clipped: "#fully-clipped",
    transparent: "#transparent-child"
  },
  checks: ({ below, borderClipped, clipped, transparent }) => ({
    "below-unobscured": Inspection.unobscured(below),
    "below-unclipped": Inspection.notClipped(below),
    "below-visible": Inspection.visible(below),
    "border-clipped": Inspection.notClipped(borderClipped),
    "clipped-visible": Inspection.visible(clipped),
    "transparent-visible": Inspection.visible(transparent)
  })
});

export default preview({
  inspection,
  mount: async ({ root, emit, done }) => {
    document.documentElement.style.height = "100%";
    document.body.style.margin = "0";
    root.innerHTML = '<main id="canvas"><div id="clipper"><div id="fully-clipped"></div><div id="padding-clipped"></div></div><div id="transparent-parent"><div id="transparent-child"></div></div><div id="below"><span id="below-wide"></span></div></main>';
    const canvas = root.querySelector("#canvas");
    const clipper = root.querySelector("#clipper");
    const fullyClipped = root.querySelector("#fully-clipped");
    const paddingClipped = root.querySelector("#padding-clipped");
    const transparentParent = root.querySelector("#transparent-parent");
    const transparentChild = root.querySelector("#transparent-child");
    const below = root.querySelector("#below");
    const belowWide = root.querySelector("#below-wide");
    if (!(canvas instanceof HTMLElement) || !(clipper instanceof HTMLElement) || !(fullyClipped instanceof HTMLElement) || !(paddingClipped instanceof HTMLElement) || !(transparentParent instanceof HTMLElement) || !(transparentChild instanceof HTMLElement) || !(below instanceof HTMLElement) || !(belowWide instanceof HTMLElement)) throw new Error("Fixture elements are missing");
    Object.assign(canvas.style, { height: "1100px", position: "relative" });
    Object.assign(clipper.style, { border: "10px solid #0f172a", height: "100px", left: "20px", overflow: "hidden", padding: "0", position: "absolute", top: "20px", width: "100px" });
    Object.assign(fullyClipped.style, { background: "#ef4444", height: "20px", left: "140px", position: "absolute", top: "20px", width: "20px" });
    Object.assign(paddingClipped.style, { background: "#f59e0b", height: "20px", left: "-8px", position: "absolute", top: "50px", width: "5px" });
    Object.assign(transparentParent.style, { left: "20px", opacity: "0", position: "absolute", top: "180px" });
    Object.assign(transparentChild.style, { background: "#22c55e", height: "30px", width: "30px" });
    Object.assign(below.style, { background: "#2563eb", height: "30px", left: "20px", overflow: "hidden", position: "absolute", top: "900px", width: "30px" });
    Object.assign(belowWide.style, { display: "block", height: "10px", width: "60px" });
    await emit("default");
    done();
    return () => undefined;
  }
});`,
      ),
      writeFile(
        join(root, "Scoped.preview.ts"),
        `import { Inspection, preview } from "@nmnmcc/preview";

const inspection = Inspection.define({
  scope: "#scope-host",
  elements: {
    host: "#scope-host",
    shadow: "#shadow-child"
  },
  checks: ({ host, shadow }) => ({
    "host-visible": Inspection.visible(host),
    "shadow-visible": Inspection.visible(shadow)
  })
});

export default preview({
  inspection,
  mount: async ({ root, emit, done }) => {
    document.body.style.margin = "0";
    const host = document.createElement("section");
    host.id = "scope-host";
    Object.assign(host.style, { display: "block", height: "80px", margin: "20px", width: "120px" });
    const shadow = host.attachShadow({ mode: "open" });
    const child = document.createElement("div");
    child.id = "shadow-child";
    Object.assign(child.style, { background: "#7c3aed", height: "40px", width: "80px" });
    shadow.append(child);
    root.append(host);
    await emit("default");
    done();
    return () => undefined;
  }
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

      strictEqual(summary.artifacts.length, 2);
      strictEqual(summary.failures.length, 1);
      assertInclude(summary.failures[0]?.message ?? "", "Inspection found 3");

      const reportFor = async (sourceName: string) => {
        const artifact = summary.artifacts.find(({ source }) =>
          source.endsWith(sourceName),
        );
        if (artifact?.inspection === undefined) {
          throw new Error(`The ${sourceName} inspection artifact is missing.`);
        }
        const directory = artifact.inspection.directoryPath;
        const manifest = await Schema.decodeUnknownPromise(Inspection.Manifest)(
          JSON.parse(await readFile(artifact.inspection.manifestPath, "utf8")),
        );
        return {
          capture: await Schema.decodeUnknownPromise(Inspection.Capture)(
            JSON.parse(
              await readFile(join(directory, manifest.files.capture), "utf8"),
            ),
          ),
          nodes: await Schema.decodeUnknownPromise(Inspection.Nodes)(
            JSON.parse(
              await readFile(join(directory, manifest.files.nodes), "utf8"),
            ),
          ),
          checks: await Schema.decodeUnknownPromise(Inspection.Checks)(
            JSON.parse(
              await readFile(join(directory, manifest.files.checks), "utf8"),
            ),
          ),
          findings: (
            await Promise.all(
              manifest.findings.map(async ({ path }) =>
                Schema.decodeUnknownPromise(Inspection.FindingFile)(
                  JSON.parse(
                    await readFile(
                      join(directory, path, "finding.json"),
                      "utf8",
                    ),
                  ),
                ),
              ),
            )
          ).map(({ finding }) => finding),
        };
      };
      const painted = await reportFor("Painted.preview.ts");
      const scoped = await reportFor("Scoped.preview.ts");

      deepStrictEqual(
        painted.checks
          .map(({ name, status }) => ({ name, status }))
          .toSorted((left, right) => left.name.localeCompare(right.name)),
        [
          { name: "below-unclipped", status: "passed" },
          { name: "below-unobscured", status: "passed" },
          { name: "below-visible", status: "passed" },
          { name: "border-clipped", status: "failed" },
          { name: "clipped-visible", status: "failed" },
          { name: "transparent-visible", status: "failed" },
        ],
      );
      const below = painted.nodes.find(({ name }) => name === "below");
      if (below === undefined) throw new Error("The below node is missing.");
      strictEqual(
        painted.findings.some(
          ({ evidence, rule, source }) =>
            source === "hint" &&
            rule === "clipped-content" &&
            evidence.nodeIds.includes(below.id),
        ),
        true,
      );
      strictEqual(
        painted.findings.some(
          ({ evidence, rule }) =>
            rule === "occluded-target" && evidence.nodeIds.includes(below.id),
        ),
        false,
      );
      deepStrictEqual(
        scoped.checks
          .map(({ name, status }) => ({ name, status }))
          .toSorted((left, right) => left.name.localeCompare(right.name)),
        [
          { name: "host-visible", status: "passed" },
          { name: "shadow-visible", status: "passed" },
        ],
      );
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);
});
