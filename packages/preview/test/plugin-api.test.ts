import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  assertMatch,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import { createServer } from "vite";
import preview from "../src/index";

describe("preview plugin api", () => {
  it("generates only while attached to a running Vite server", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-api-"));
    const plugin = preview({
      viewports: { test: { width: 100, height: 100 } },
    });

    await rejects(
      plugin.previewApi.generate(),
      /not attached to a running Vite server/,
    );

    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      mode: "preview-cli",
      plugins: [plugin],
      root,
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await rejects(plugin.previewApi.generate(), /no reachable local URL/);
      await server.listen();

      const baseUrl = server.resolvedUrls?.local[0];
      if (baseUrl === undefined) {
        throw new Error("The test Vite server has no local URL.");
      }
      const html = await fetch(
        new URL("/__nmnmcc_preview/", baseUrl),
      ).then((response) => response.text());
      const runnerProxy = html.match(
        /<script type="module" src="([^"]*html-proxy[^"]*)"/u,
      )?.[1];
      if (runnerProxy === undefined) {
        throw new Error("The preview runner script is missing.");
      }
      const runnerModule = await fetch(new URL(runnerProxy, baseUrl)).then(
        (response) => response.text(),
      );

      assertMatch(runnerModule, /\/src\/runner\.ts/u);
      assertInclude(runnerModule, "runPreview()");
      strictEqual(runnerModule.includes("virtual:"), false);

      deepStrictEqual(await plugin.previewApi.generate({ paths: [] }), {
        artifacts: [],
        failures: [],
      });

      await server.close();
      await rejects(plugin.previewApi.generate(), /plugin is closed/);
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});
