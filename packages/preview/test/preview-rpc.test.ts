import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
            const rpcServer = yield* PreviewRpcServer.make(page);
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
            yield* rpcServer
              .serve(PreviewRpcTestGroup)
              .pipe(Effect.provide(handlers));

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

              const firstDocument = yield* rpcServer.currentDocument;
              if (Option.isNone(firstDocument)) {
                return yield* Effect.die(
                  "The first RPC document identity is missing.",
                );
              }

              const navigationUrl = new URL(baseUrl);
              navigationUrl.searchParams.set("held-navigation", "true");
              let releaseNavigation = (): void => undefined;
              let reportNavigation = (): void => undefined;
              const navigationReleased = new Promise<void>((resolve) => {
                releaseNavigation = resolve;
              });
              const navigationStarted = new Promise<void>((resolve) => {
                reportNavigation = resolve;
              });
              yield* Effect.tryPromise(() =>
                page.route(
                  navigationUrl.href,
                  async (route) => {
                    reportNavigation();
                    await navigationReleased;
                    await route.continue();
                  },
                  { times: 1 },
                ),
              );
              const navigation = page.goto(navigationUrl.href);
              yield* Effect.promise(() => navigationStarted);

              strictEqual(
                Option.isNone(yield* rpcServer.currentDocument),
                true,
              );
              strictEqual(
                yield* rpcServer.isCurrent(firstDocument.value),
                false,
              );

              releaseNavigation();
              yield* Effect.tryPromise(() => navigation);
              const second = yield* Effect.tryPromise(() =>
                waitForResult(page),
              );
              if (second._tag === "Failure") {
                return yield* Effect.die(second.cause);
              }
              strictEqual(second.echo, "node:browser:2");
              deepStrictEqual(second.events, ["one", "two", "three"]);

              const secondDocument = yield* rpcServer.currentDocument;
              if (Option.isNone(secondDocument)) {
                return yield* Effect.die(
                  "The second RPC document identity is missing.",
                );
              }
              strictEqual(
                secondDocument.value.epoch > firstDocument.value.epoch,
                true,
              );
              strictEqual(
                secondDocument.value.documentId ===
                  firstDocument.value.documentId,
                false,
              );

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

              const reloaded = page.waitForNavigation({
                waitUntil: "commit",
              });
              rpcServer.reloadCurrentDocument();
              yield* Effect.tryPromise(() => reloaded);
              const third = yield* Effect.tryPromise(() => waitForResult(page));
              if (third._tag === "Failure") {
                return yield* Effect.die(third.cause);
              }
              strictEqual(third.echo, "node:browser:3");
              deepStrictEqual(third.events, ["one", "two", "three"]);

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
            });
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
