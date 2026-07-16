import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import type { PreviewDone } from "../src/Preview";
import { preview } from "../src/Preview";
import {
  type PreviewAction,
  previewStateKey,
} from "../src/internal/protocol";
import { runPreviewEffect } from "../src/runner";

const definitionKey = "__NMM_PREVIEW_TEST_DEFINITION__";
let moduleId = 0;

const dataModule = (source: string): string =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}#${moduleId++}`;

interface RunnerRequest {
  readonly action?: PreviewAction;
  readonly variant?: string;
}

const setRunnerEnvironment = (
  definition: unknown,
  root: object | null,
  request: RunnerRequest = {},
): void => {
  Reflect.set(globalThis, definitionKey, definition);
  const previewModule = dataModule(
    `export default globalThis[${JSON.stringify(definitionKey)}]`,
  );
  const parameters = new URLSearchParams({
    module: previewModule,
    action: request.action ?? "render",
  });
  if (request.variant !== undefined) {
    parameters.set("variant", request.variant);
  }
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      search: `?${parameters.toString()}`,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id: string) => (id === "preview-root" ? root : null),
    },
  });
};

const run = (
  definition: unknown,
  root: object | null,
  request?: RunnerRequest,
): Promise<void> => {
  setRunnerEnvironment(definition, root, request);
  return Effect.runPromise(runPreviewEffect);
};

const requireFunction = <Arguments extends ReadonlyArray<unknown>>(
  value: ((...arguments_: Arguments) => void) | undefined,
): ((...arguments_: Arguments) => void) => {
  if (value === undefined) throw new Error("The test signal is missing.");
  return value;
};

describe("preview browser runner", () => {
  it("waits for both render and done, and treats done as idempotent", async () => {
    const root = {};
    let finishRender: (() => void) | undefined;
    let done: PreviewDone | undefined;
    let markRenderCalled: (() => void) | undefined;
    const renderCalled = new Promise<void>((resolve) => {
      markRenderCalled = resolve;
    });
    const definition = preview({
      render: (receivedRoot, receivedDone) => {
        strictEqual(receivedRoot, root);
        done = receivedDone;
        requireFunction(markRenderCalled)();
        return new Promise<void>((resolve) => {
          finishRender = resolve;
        });
      },
    });

    const running = run(definition, root);
    await renderCalled;
    deepStrictEqual(Reflect.get(globalThis, previewStateKey), {
      status: "loading",
    });

    requireFunction(done)();
    requireFunction(done)();
    strictEqual(
      Reflect.get(Reflect.get(globalThis, previewStateKey), "status"),
      "loading",
    );

    requireFunction(finishRender)();
    await running;
    deepStrictEqual(Reflect.get(globalThis, previewStateKey), {
      status: "ready",
      result: { type: "render" },
    });
  });

  it("probes every collection target without rendering", async () => {
    let renderCalls = 0;
    const collection = {
      "locale=en": preview({
        capture: "fullPage",
        render: () => {
          renderCalls += 1;
        },
      }),
      "locale=zh": preview({
        viewports: { mobile: true },
        render: () => {
          renderCalls += 1;
        },
      }),
    };

    await run(collection, null, { action: "probe" });

    strictEqual(renderCalls, 0);
    deepStrictEqual(Reflect.get(globalThis, previewStateKey), {
      status: "ready",
      result: {
        type: "probe",
        targets: [
          { variant: "locale=en", metadata: { capture: "fullPage" } },
          {
            variant: "locale=zh",
            metadata: { viewports: { mobile: true } },
          },
        ],
      },
    });
  });

  it("renders only the selected collection target", async () => {
    const calls: Array<string> = [];
    const collection = {
      ready: preview({
        render: (_root, done) => {
          calls.push("ready");
          done();
        },
      }),
      error: preview({
        render: (_root, done) => {
          calls.push("error");
          done();
        },
      }),
    };

    await run(collection, {}, { action: "render", variant: "error" });

    deepStrictEqual(calls, ["error"]);
    deepStrictEqual(Reflect.get(globalThis, previewStateKey), {
      status: "ready",
      result: { type: "render" },
    });
  });

  it("requires a collection target for rendering", async () => {
    await run(
      { ready: preview({ render: () => undefined }) },
      {},
      { action: "render" },
    );

    const state = Reflect.get(globalThis, previewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "A preview variant must be selected",
    );
  });

  it("reports render failures without waiting for done", async () => {
    const definition = preview({
      render: () => Promise.reject(new Error("render failed")),
    });

    await run(definition, {});
    const state = Reflect.get(globalThis, previewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(String(Reflect.get(state, "error")), "render failed");
  });

  it("rejects a default export that was not made by preview", async () => {
    await run({ render: () => undefined }, {});
    const state = Reflect.get(globalThis, previewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "The default export must be a preview definition",
    );
  });

  it("reports a missing module URL", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { search: "" },
    });

    await Effect.runPromise(runPreviewEffect);
    const state = Reflect.get(globalThis, previewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "The preview module URL is missing.",
    );
  });

  it("reports a missing preview root", async () => {
    await run(preview({ render: () => undefined }), null);
    const state = Reflect.get(globalThis, previewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "The preview root element is missing.",
    );
  });

  it.effect("preserves interruption instead of reporting an error", () =>
    Effect.gen(function* () {
      const renderStarted = yield* Deferred.make<void>();
      const definition = preview({
        render: () => {
          Deferred.doneUnsafe(renderStarted, Effect.void);
        },
      });
      setRunnerEnvironment(definition, {}, { action: "render" });

      const fiber = yield* Effect.forkChild(runPreviewEffect);
      yield* Deferred.await(renderStarted);
      yield* Fiber.interrupt(fiber);

      deepStrictEqual(Reflect.get(globalThis, previewStateKey), {
        status: "loading",
      });
    }),
  );
});
