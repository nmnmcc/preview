import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import * as Rpcs from "../src/internal/rpcs";
import * as PreviewRpcServer from "../src/internal/services/PreviewRpcServer";
import {
  PreviewRpcTestGroup,
  PreviewRpcTestState,
  PreviewRpcTestStateKey,
} from "./fixtures/preview-rpc-contract";

const waitForResult = async (page: Page): Promise<PreviewRpcTestState> => {
  await page.waitForFunction(
    (key) => Reflect.has(globalThis, Symbol.for(key)),
    PreviewRpcTestStateKey,
  );
  const input = await page.evaluate(
    (key) => Reflect.get(globalThis, Symbol.for(key)),
    PreviewRpcTestStateKey,
  );
  return Effect.runPromise(
    Schema.decodeUnknownEffect(PreviewRpcTestState)(input),
  );
};

const callBinding = async (
  page: Page,
  request: unknown,
): Promise<Rpcs.PreviewRpcBindingResponse> => {
  const input = await page.evaluate(
    async ({ bindingName, request }) => {
      const binding = Reflect.get(globalThis, bindingName);
      if (typeof binding !== "function") {
        throw new Error("The Preview RPC binding is missing.");
      }
      return binding(request);
    },
    { bindingName: Rpcs.PreviewRpcBindingName, request },
  );
  return Effect.runPromise(
    Schema.decodeUnknownEffect(Rpcs.PreviewRpcBindingResponse)(input),
  );
};

describe("Preview RPC", () => {
  it("serves typed calls, streams, cancellation, and page navigation", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-rpc-"));
    const fixture = fileURLToPath(
      new URL("./fixtures/preview-rpc-browser.ts", import.meta.url),
    );
    await Promise.all([
      writeFile(
        join(root, "index.html"),
        '<!doctype html><html><body><main>RPC test</main><script type="module" src="/app.ts"></script></body></html>',
      ),
      writeFile(join(root, "app.ts"), 'import "@test/preview-rpc-browser";'),
    ]);

    const vite = await createServer({
      configFile: false,
      logLevel: "silent",
      resolve: {
        alias: {
          "@test/preview-rpc-browser": fixture,
        },
      },
      root,
      server: { host: "127.0.0.1", port: 0 },
    });
    const browser = await chromium.launch({ headless: true });

    try {
      await vite.listen();
      const baseUrl = vite.resolvedUrls?.local[0];
      if (baseUrl === undefined) {
        throw new Error("The test Vite server has no local URL.");
      }
      const page = await browser.newPage();
      let echoCalls = 0;

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const cancelled = yield* Deferred.make<void>();
            const handlers = PreviewRpcTestGroup.toLayer({
              Echo: ({ value }) =>
                Effect.sync(() => {
                  echoCalls += 1;
                  return `node:${value}:${echoCalls}`;
                }),
              Events: () => Stream.make("one", "two", "three"),
              Cancelled: () =>
                Stream.make("first").pipe(
                  Stream.concat(Stream.never),
                  Stream.ensuring(
                    Deferred.succeed(cancelled, undefined).pipe(Effect.asVoid),
                  ),
                ),
              Screenshot: () => Effect.promise(() => page.screenshot()),
            });

            yield* Effect.gen(function* () {
              yield* Effect.tryPromise(() => page.goto(baseUrl));

              const first = yield* Effect.tryPromise(() => waitForResult(page));
              if (first._tag === "Failure") {
                return yield* Effect.die(first.cause);
              }
              strictEqual(first.echo, "node:browser:1");
              deepStrictEqual(first.events, ["one", "two", "three"]);
              deepStrictEqual(first.cancelled, ["first"]);
              strictEqual(first.screenshotBytes > 100, true);
              yield* Deferred.await(cancelled);

              const staleDocumentId = "stale-test-document";
              const connected = yield* Effect.tryPromise(() =>
                callBinding(page, {
                  _tag: "Connect",
                  version: Rpcs.PreviewRpcProtocolVersion,
                  documentId: staleDocumentId,
                }),
              );
              deepStrictEqual(connected, {
                _tag: "Accepted",
                version: Rpcs.PreviewRpcProtocolVersion,
              });
              const invalid = yield* Effect.tryPromise(() =>
                callBinding(page, { _tag: "Unknown" }),
              );
              deepStrictEqual(invalid, {
                _tag: "Rejected",
                version: Rpcs.PreviewRpcProtocolVersion,
                reason: "invalid-message",
              });

              yield* Effect.tryPromise(() => page.reload());
              const second = yield* Effect.tryPromise(() =>
                waitForResult(page),
              );
              if (second._tag === "Failure") {
                return yield* Effect.die(second.cause);
              }
              strictEqual(second.echo, "node:browser:2");
              deepStrictEqual(second.events, ["one", "two", "three"]);

              const stale = yield* Effect.tryPromise(() =>
                callBinding(page, {
                  _tag: "Receive",
                  version: Rpcs.PreviewRpcProtocolVersion,
                  documentId: staleDocumentId,
                  clientId: 0,
                }),
              );
              deepStrictEqual(stale, {
                _tag: "Rejected",
                version: Rpcs.PreviewRpcProtocolVersion,
                reason: "stale-document",
              });
            }).pipe(
              Effect.provide(
                PreviewRpcServer.serveLayer(page, PreviewRpcTestGroup).pipe(
                  Layer.provide(handlers),
                ),
              ),
            );
          }),
        ),
      );
    } finally {
      await browser.close();
      await vite.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);
});
