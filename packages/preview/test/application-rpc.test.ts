import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "@effect/vitest";
import {
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import * as Protocol from "../src/internal/protocol";
import * as ApplicationRpcServer from "../src/internal/services/ApplicationRpcServer";
import {
  ApplicationRpcTestGroup,
  ApplicationRpcTestState,
  ApplicationRpcTestStateKey,
} from "./fixtures/application-rpc-contract";

const ServerAddress = Schema.Struct({ port: Schema.Int });
const isServerAddress = Schema.is(ServerAddress);

const availablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!isServerAddress(address)) {
        server.close();
        reject(new Error("Could not reserve a test port."));
        return;
      }
      server.close((error) => {
        if (error === undefined) resolve(address.port);
        else reject(error);
      });
    });
  });

const waitForResult = async (
  page: Page,
): Promise<ApplicationRpcTestState> => {
  await page.waitForFunction(
    (key) => Reflect.has(globalThis, Symbol.for(key)),
    ApplicationRpcTestStateKey,
  );
  const input = await page.evaluate(
    (key) => Reflect.get(globalThis, Symbol.for(key)),
    ApplicationRpcTestStateKey,
  );
  return Effect.runPromise(
    Schema.decodeUnknownEffect(ApplicationRpcTestState)(input),
  );
};

const readBootstrap = async (
  page: Page,
): Promise<Protocol.ApplicationRpcBootstrap> => {
  const input = await page.evaluate((key) => {
    const state = Reflect.get(globalThis, Symbol.for(key));
    return Reflect.get(state, "bootstrap");
  }, Protocol.ApplicationRpcStateKey);
  return Effect.runPromise(
    Schema.decodeUnknownEffect(Protocol.ApplicationRpcBootstrap)(input),
  );
};

const callBinding = async (
  page: Page,
  bindingName: string,
  request: unknown,
): Promise<Protocol.ApplicationRpcBindingResponse> => {
  const input = await page.evaluate(
    async ({ bindingName, request }) => {
      const binding = Reflect.get(globalThis, bindingName);
      if (typeof binding !== "function") {
        throw new Error("The application RPC binding is missing.");
      }
      return binding(request);
    },
    { bindingName, request },
  );
  return Effect.runPromise(
    Schema.decodeUnknownEffect(Protocol.ApplicationRpcBindingResponse)(
      input,
    ),
  );
};

describe("application RPC", () => {
  it("serves typed calls, streams, cancellation, and page navigation", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-rpc-"));
    const fixture = fileURLToPath(
      new URL(
        "./fixtures/application-rpc-browser.ts",
        import.meta.url,
      ),
    );
    const port = await availablePort();
    await Promise.all([
      writeFile(
        join(root, "index.html"),
        '<!doctype html><html><body><main>RPC test</main><script type="module" src="/app.ts"></script></body></html>',
      ),
      writeFile(
        join(root, "app.ts"),
        'import "@test/application-rpc-browser";',
      ),
    ]);

    const vite = await createServer({
      configFile: false,
      logLevel: "silent",
      resolve: {
        alias: {
          "@test/application-rpc-browser": fixture,
        },
      },
      root,
      server: { host: "127.0.0.1", port, strictPort: true },
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
            const handlers = ApplicationRpcTestGroup.toLayer({
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
                    Deferred.succeed(cancelled, undefined).pipe(
                      Effect.asVoid,
                    ),
                  ),
                ),
              Screenshot: () => Effect.promise(() => page.screenshot()),
            });

            yield* Effect.gen(function* () {
              const server =
                yield* ApplicationRpcServer.ApplicationRpcServer;
              yield* server.serve(ApplicationRpcTestGroup);
              yield* Effect.tryPromise(() => page.goto(baseUrl));

              const first = yield* Effect.tryPromise(() =>
                waitForResult(page),
              );
              if (first._tag === "Failure") {
                return yield* Effect.die(first.cause);
              }
              strictEqual(first.echo, "node:browser:1");
              deepStrictEqual(first.events, ["one", "two", "three"]);
              deepStrictEqual(first.cancelled, ["first"]);
              strictEqual(first.screenshotBytes > 100, true);
              yield* Deferred.await(cancelled);

              const oldBootstrap = yield* Effect.tryPromise(() =>
                readBootstrap(page),
              );
              const invalid = yield* Effect.tryPromise(() =>
                callBinding(page, oldBootstrap.bindingName, {
                  _tag: "Unknown",
                }),
              );
              deepStrictEqual(invalid, {
                _tag: "Rejected",
                version: Protocol.ApplicationRpcProtocolVersion,
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
                callBinding(
                  page,
                  oldBootstrap.bindingName,
                  {
                    _tag: "Receive",
                    version: oldBootstrap.version,
                    channelId: oldBootstrap.channelId,
                    documentId: oldBootstrap.documentId,
                    clientId: 0,
                  },
                ),
              );
              deepStrictEqual(stale, {
                _tag: "Rejected",
                version: Protocol.ApplicationRpcProtocolVersion,
                reason: "stale-document",
              });
            }).pipe(
              Effect.provide(
                Layer.merge(
                  ApplicationRpcServer.layer(page),
                  handlers,
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
