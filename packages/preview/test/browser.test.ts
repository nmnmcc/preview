import { describe, it } from "@effect/vitest";
import { assertInclude, assertTrue, strictEqual } from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import * as Rpcs from "../src/internal/rpcs";
import * as Browser from "../src/internal/services/Browser";
import * as PreviewRpcServer from "../src/internal/services/PreviewRpcServer";

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
      const rpcRequest = Rpcs.SandboxPreviewRequest.cases.Probe.make({
        moduleUrl: "http://preview.test/Card.preview.tsx",
      });
      const session = yield* Browser.makeSandboxRpcSession(
        rpcRequest,
        {
          source: "/project/Card.preview.tsx",
          baseUrl: "http://preview.test/",
          viewport: {
            name: "desktop",
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
          },
          timeoutMs: 1_000,
          rpcRequest,
        },
        () => Effect.die("The probe lifecycle captured a state."),
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

  it.effect("captures named states in order and ends idempotently", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const session = yield* Browser.makeCaptureRpcSession(
          {
            source: "/project/Card.preview.tsx",
            baseUrl: "http://preview.test/",
            viewport: {
              name: "desktop",
              width: 1280,
              height: 720,
              deviceScaleFactor: 1,
            },
            timeoutMs: 1_000,
          },
          (state) =>
            Effect.succeed({ state, png: new Uint8Array([state.length]) }),
        );
        const waiting = yield* session.awaitStates.pipe(Effect.forkChild);

        yield* session.handlers.CaptureEmit({ name: "loading" });
        yield* session.handlers.CaptureEmit({ name: "ready" });
        yield* session.handlers.CaptureDone();
        yield* session.handlers.CaptureDone();

        const states = yield* Fiber.join(waiting);
        strictEqual(states.length, 2);
        strictEqual(states[0].state, "loading");
        strictEqual(states[1]?.state, "ready");
      }),
    ),
  );

  it.effect("does not restart the next-state timeout for a new document", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstDocument: PreviewRpcServer.DocumentIdentity = {
          epoch: 1,
          documentId: "first",
        };
        const secondDocument: PreviewRpcServer.DocumentIdentity = {
          epoch: 2,
          documentId: "second",
        };
        const current = yield* Ref.make(firstDocument);
        const documents = new Map([
          [1, firstDocument],
          [2, secondDocument],
        ]);
        const isSameDocument = (
          left: PreviewRpcServer.DocumentIdentity,
          right: PreviewRpcServer.DocumentIdentity,
        ): boolean =>
          left.epoch === right.epoch && left.documentId === right.documentId;
        const rpcServer = PreviewRpcServer.PreviewRpcServer.of({
          serve: () => Effect.void,
          document: (serverClientId) =>
            Ref.get(current).pipe(
              Effect.map((active) => {
                const document = documents.get(serverClientId);
                return document !== undefined &&
                  isSameDocument(document, active)
                  ? Option.some(document)
                  : Option.none();
              }),
            ),
          currentDocument: Ref.get(current).pipe(Effect.map(Option.some)),
          isCurrent: (document) =>
            Ref.get(current).pipe(
              Effect.map((active) => isSameDocument(document, active)),
            ),
          reloadCurrentDocument: () => undefined,
        });
        const session = yield* Browser.makeCaptureRpcSession(
          {
            source: "/project/Card.preview.tsx",
            baseUrl: "http://preview.test/",
            viewport: {
              name: "desktop",
              width: 1280,
              height: 720,
              deviceScaleFactor: 1,
            },
            timeoutMs: 1_000,
          },
          (state) =>
            Effect.succeed({ state, png: new Uint8Array([state.length]) }),
          rpcServer,
        );
        const waiting = yield* session.awaitStates.pipe(
          Effect.result,
          Effect.forkChild,
        );

        yield* session.handlers.CaptureEmit(
          { name: "old" },
          { client: { id: 1 } },
        );
        yield* Effect.yieldNow;
        yield* TestClock.adjust("600 millis");
        yield* Ref.set(current, secondDocument);
        yield* TestClock.adjust("399 millis");
        strictEqual(waiting.pollUnsafe(), undefined);

        yield* TestClock.adjust("1 millis");
        const result = yield* Fiber.join(waiting);
        assertTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assertInclude(result.failure.detail, "within 1000 ms");
        }
      }),
    ),
  );

  it.effect("rejects duplicate and post-done states", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const makeSession = () =>
          Browser.makeCaptureRpcSession(
            {
              source: "/project/Card.preview.tsx",
              baseUrl: "http://preview.test/",
              viewport: {
                name: "desktop",
                width: 1280,
                height: 720,
                deviceScaleFactor: 1,
              },
              timeoutMs: 1_000,
            },
            (state) => Effect.succeed({ state, png: new Uint8Array() }),
          );

        const duplicate = yield* makeSession();
        yield* duplicate.handlers.CaptureEmit({ name: "ready" });
        const duplicateExit = yield* Effect.result(
          duplicate.handlers.CaptureEmit({ name: "ready" }),
        );
        assertTrue(Result.isFailure(duplicateExit));
        if (Result.isFailure(duplicateExit)) {
          strictEqual(duplicateExit.failure.reason, "duplicate-state");
        }

        const afterDone = yield* makeSession();
        yield* afterDone.handlers.CaptureEmit({ name: "ready" });
        yield* afterDone.handlers.CaptureDone();
        const afterDoneExit = yield* Effect.result(
          afterDone.handlers.CaptureEmit({ name: "later" }),
        );
        assertTrue(Result.isFailure(afterDoneExit));
        if (Result.isFailure(afterDoneExit)) {
          strictEqual(afterDoneExit.failure.reason, "after-done");
        }
      }),
    ),
  );

  it.effect("rejects concurrent emit and done calls before an emit ends", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const captureStarted = yield* Deferred.make<void>();
        const finishCapture = yield* Deferred.make<void>();
        const session = yield* Browser.makeCaptureRpcSession(
          {
            source: "/project/Card.preview.tsx",
            baseUrl: "http://preview.test/",
            viewport: {
              name: "desktop",
              width: 1280,
              height: 720,
              deviceScaleFactor: 1,
            },
            timeoutMs: 1_000,
          },
          (state) =>
            Deferred.succeed(captureStarted, undefined).pipe(
              Effect.andThen(Deferred.await(finishCapture)),
              Effect.as({ state, png: new Uint8Array() }),
            ),
        );
        const first = yield* session.handlers
          .CaptureEmit({ name: "loading" })
          .pipe(Effect.result, Effect.forkChild);
        yield* Deferred.await(captureStarted);

        const concurrent = yield* Effect.result(
          session.handlers.CaptureEmit({ name: "ready" }),
        );
        assertTrue(Result.isFailure(concurrent));
        if (Result.isFailure(concurrent)) {
          strictEqual(concurrent.failure.reason, "concurrent-emit");
        }

        yield* Deferred.succeed(finishCapture, undefined);
        yield* Fiber.join(first);

        const secondSessionStarted = yield* Deferred.make<void>();
        const secondSessionFinish = yield* Deferred.make<void>();
        const secondSession = yield* Browser.makeCaptureRpcSession(
          {
            source: "/project/Card.preview.tsx",
            baseUrl: "http://preview.test/",
            viewport: {
              name: "desktop",
              width: 1280,
              height: 720,
              deviceScaleFactor: 1,
            },
            timeoutMs: 1_000,
          },
          (state) =>
            Deferred.succeed(secondSessionStarted, undefined).pipe(
              Effect.andThen(Deferred.await(secondSessionFinish)),
              Effect.as({ state, png: new Uint8Array() }),
            ),
        );
        const secondEmit = yield* secondSession.handlers
          .CaptureEmit({ name: "loading" })
          .pipe(Effect.result, Effect.forkChild);
        yield* Deferred.await(secondSessionStarted);
        const earlyDone = yield* Effect.result(
          secondSession.handlers.CaptureDone(),
        );
        assertTrue(Result.isFailure(earlyDone));
        if (Result.isFailure(earlyDone)) {
          strictEqual(earlyDone.failure.reason, "done-during-emit");
        }
        yield* Deferred.succeed(secondSessionFinish, undefined);
        yield* Fiber.join(secondEmit);
      }),
    ),
  );

  it.effect("rejects done before the first state", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const session = yield* Browser.makeCaptureRpcSession(
          {
            source: "/project/Card.preview.tsx",
            baseUrl: "http://preview.test/",
            viewport: {
              name: "desktop",
              width: 1280,
              height: 720,
              deviceScaleFactor: 1,
            },
            timeoutMs: 1_000,
          },
          (state) => Effect.succeed({ state, png: new Uint8Array() }),
        );
        const result = yield* Effect.result(session.handlers.CaptureDone());
        assertTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          strictEqual(result.failure.reason, "empty-done");
        }
      }),
    ),
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
