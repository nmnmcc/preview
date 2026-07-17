import { describe, it } from "@effect/vitest";
import { assertInclude, assertTrue, strictEqual } from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Rpcs from "../src/internal/rpcs";
import * as Browser from "../src/internal/services/Browser";

const makeBrowser = () => {
  let connected = true;
  let closes = 0;
  const handle = {
    close: async () => {
      closes += 1;
      connected = false;
    },
    isConnected: () => connected,
    newContext: async () => {
      throw new Error("The lifecycle test opened a browser context.");
    },
  } satisfies Browser.BrowserHandle;

  return {
    closeCount: () => closes,
    disconnect: () => {
      connected = false;
    },
    handle,
  };
};

describe("preview browser lifecycle", () => {
  it.effect("does not wait for disposal before the runner connects", () =>
    Effect.gen(function* () {
      const session = yield* Browser.makeSandboxRpcSession(
        Rpcs.SandboxPreviewRequest.cases.Probe.make({
          moduleUrl: "http://preview.test/Card.preview.tsx",
        }),
      );
      const completed = yield* Deferred.make<void>();

      yield* session.dispose.pipe(
        Effect.andThen(Deferred.succeed(completed, undefined)),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;

      assertTrue(yield* Deferred.isDone(completed));
    }),
  );

  it.effect(
    "starts lazily, reuses one browser, and closes with the layer",
    () =>
      Effect.gen(function* () {
        const testBrowser = makeBrowser();
        let launches = 0;
        const browserLayer = Browser.layerWithLauncher(async (options) => {
          launches += 1;
          strictEqual(options.headless, true);
          return testBrowser.handle;
        });

        yield* Effect.gen(function* () {
          const browser = yield* Browser.Browser;
          strictEqual(launches, 0);

          yield* Effect.scoped(browser.session("/project/First.preview.ts"));
          yield* Effect.scoped(browser.session("/project/Second.preview.ts"));

          strictEqual(launches, 1);
          strictEqual(testBrowser.closeCount(), 0);
        }).pipe(Effect.provide(browserLayer));

        strictEqual(testBrowser.closeCount(), 1);
      }),
  );

  it.effect("retries a failed lazy launch on the next session", () =>
    Effect.gen(function* () {
      const testBrowser = makeBrowser();
      let launches = 0;
      const browserLayer = Browser.layerWithLauncher(async () => {
        launches += 1;
        if (launches === 1) throw new Error("launch failed");
        return testBrowser.handle;
      });

      yield* Effect.gen(function* () {
        const browser = yield* Browser.Browser;
        const first = yield* Effect.result(
          Effect.scoped(browser.session("/project/First.preview.ts")),
        );

        assertTrue(Result.isFailure(first));
        if (Result.isFailure(first)) {
          strictEqual(first.failure.source, "/project/First.preview.ts");
          assertInclude(first.failure.detail, "Could not launch");
        }
        strictEqual(launches, 1);

        yield* Effect.scoped(browser.session("/project/Second.preview.ts"));
        strictEqual(launches, 2);
      }).pipe(Effect.provide(browserLayer));

      strictEqual(testBrowser.closeCount(), 1);
    }),
  );

  it.effect("replaces a disconnected browser on the next session", () =>
    Effect.gen(function* () {
      const firstBrowser = makeBrowser();
      const secondBrowser = makeBrowser();
      const browsers = [firstBrowser, secondBrowser] as const;
      let launches = 0;
      const browserLayer = Browser.layerWithLauncher(async () => {
        const browser = browsers[launches];
        launches += 1;
        if (browser === undefined)
          throw new Error("Unexpected browser launch.");
        return browser.handle;
      });

      yield* Effect.gen(function* () {
        const browser = yield* Browser.Browser;
        yield* Effect.scoped(browser.session("/project/First.preview.ts"));
        firstBrowser.disconnect();

        yield* Effect.scoped(browser.session("/project/Second.preview.ts"));

        strictEqual(launches, 2);
        strictEqual(firstBrowser.closeCount(), 1);
        strictEqual(secondBrowser.closeCount(), 0);
      }).pipe(Effect.provide(browserLayer));

      strictEqual(secondBrowser.closeCount(), 1);
    }),
  );
});
