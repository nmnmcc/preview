import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { application } from "../src/Application";
import { preview, type PreviewReady } from "../src/index";
import {
  type PreviewAction,
  PreviewDisposeKey,
  PreviewStateKey,
} from "../src/internal/protocol";
import { program } from "../src/internal/browser/program";

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
  Reflect.deleteProperty(globalThis, PreviewDisposeKey);
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
  return Effect.runPromise(program);
};

const requireFunction = <Arguments extends ReadonlyArray<unknown>>(
  value: ((...arguments_: Arguments) => void) | undefined,
): ((...arguments_: Arguments) => void) => {
  if (value === undefined) throw new Error("The test signal is missing.");
  return value;
};

const disposePreview = async (): Promise<void> => {
  const dispose: unknown = Reflect.get(globalThis, PreviewDisposeKey);
  if (typeof dispose !== "function") {
    throw new Error("The preview dispose function is missing.");
  }
  await dispose();
};

describe("preview browser runner", () => {
  it("waits for mount and ready, then disposes exactly once", async () => {
    const root = {};
    let finishMount: (() => void) | undefined;
    let ready: PreviewReady | undefined;
    let signal: AbortSignal | undefined;
    let markMountCalled: (() => void) | undefined;
    let unmountCalls = 0;
    const mountCalled = new Promise<void>((resolve) => {
      markMountCalled = resolve;
    });
    const definition = preview({
      mount: (context) => {
        strictEqual(context.root, root);
        ready = context.ready;
        signal = context.signal;
        requireFunction(markMountCalled)();
        return new Promise((resolve) => {
          finishMount = () => {
            resolve(() => {
              unmountCalls += 1;
            });
          };
        });
      },
    });

    const running = run(definition, root);
    await mountCalled;
    deepStrictEqual(Reflect.get(globalThis, PreviewStateKey), {
      status: "loading",
    });

    requireFunction(ready)();
    requireFunction(ready)();
    strictEqual(
      Reflect.get(Reflect.get(globalThis, PreviewStateKey), "status"),
      "loading",
    );

    requireFunction(finishMount)();
    await running;
    deepStrictEqual(Reflect.get(globalThis, PreviewStateKey), {
      status: "ready",
      result: { type: "render" },
    });

    await disposePreview();
    await disposePreview();
    strictEqual(signal?.aborted, true);
    strictEqual(unmountCalls, 1);
    requireFunction(ready)();
    strictEqual(unmountCalls, 1);
  });

  it("probes Sandbox and Application targets without mounting", async () => {
    let mountCalls = 0;
    const collection = {
      "locale=en": preview({
        mount: () => {
          mountCalls += 1;
          return () => undefined;
        },
        viewports: { mobile: { height: "full" } },
      }),
      route: application({
        location: "/projects/42",
        viewports: { mobile: true },
      }),
    };

    await run(collection, null, { action: "probe" });

    strictEqual(mountCalls, 0);
    deepStrictEqual(Reflect.get(globalThis, PreviewStateKey), {
      status: "ready",
      result: {
        type: "probe",
        targets: [
          {
            variant: "locale=en",
            metadata: {
              viewports: { mobile: { height: "full" } },
            },
            target: { type: "sandbox" },
          },
          {
            variant: "route",
            metadata: { viewports: { mobile: true } },
            target: {
              type: "application",
              location: "/projects/42",
            },
          },
        ],
      },
    });
  });

  it("mounts only the selected collection target", async () => {
    const calls: Array<string> = [];
    const collection = {
      ready: preview({
        mount: ({ ready }) => {
          calls.push("ready");
          ready();
          return () => undefined;
        },
      }),
      error: preview({
        mount: ({ ready }) => {
          calls.push("error");
          ready();
          return () => undefined;
        },
      }),
    };

    await run(collection, {}, { action: "render", variant: "error" });

    deepStrictEqual(calls, ["error"]);
    deepStrictEqual(Reflect.get(globalThis, PreviewStateKey), {
      status: "ready",
      result: { type: "render" },
    });
    await disposePreview();
  });

  it("requires a collection target for mounting", async () => {
    await run(
      { ready: preview({ mount: () => () => undefined }) },
      {},
      { action: "render" },
    );

    const state = Reflect.get(globalThis, PreviewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "A preview variant must be selected",
    );
  });

  it("reports mount failures without waiting for ready", async () => {
    const definition = preview({
      mount: () => Promise.reject(new Error("mount failed")),
    });

    await run(definition, {});
    const state = Reflect.get(globalThis, PreviewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(String(Reflect.get(state, "error")), "mount failed");
  });

  it("rejects a mount that does not return an unmount function", async () => {
    const invalidMount = new Proxy(() => () => undefined, {
      apply: () => undefined,
    });
    const definition = preview({
      mount: invalidMount,
    });

    await run(definition, {});
    const state = Reflect.get(globalThis, PreviewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "must return an unmount function",
    );
  });

  it("rejects a default export that was not made by preview", async () => {
    await run(
      {
        metadata: {},
        target: { type: "sandbox", mount: () => () => undefined },
      },
      {},
    );
    const state = Reflect.get(globalThis, PreviewStateKey);
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

    await Effect.runPromise(program);
    const state = Reflect.get(globalThis, PreviewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "The preview module URL is missing.",
    );
  });

  it("reports a missing Sandbox root", async () => {
    await run(preview({ mount: () => () => undefined }), null);
    const state = Reflect.get(globalThis, PreviewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "The preview root element is missing.",
    );
  });

  it("does not run an Application inside the Sandbox page", async () => {
    await run(application({ location: "/projects/42" }), {});
    const state = Reflect.get(globalThis, PreviewStateKey);
    strictEqual(Reflect.get(state, "status"), "error");
    assertInclude(
      String(Reflect.get(state, "error")),
      "cannot run inside the Sandbox page",
    );
  });

  it.effect("preserves interruption and aborts the Sandbox mount", () =>
    Effect.scoped(Effect.gen(function* () {
      const mountStarted = yield* Deferred.make<void>();
      let signal: AbortSignal | undefined;
      const definition = preview({
        mount: (context) => {
          signal = context.signal;
          Deferred.doneUnsafe(mountStarted, Effect.void);
          return new Promise<never>(() => undefined);
        },
      });
      setRunnerEnvironment(definition, {}, { action: "render" });

      const fiber = yield* Effect.forkChild(program);
      yield* Deferred.await(mountStarted);
      yield* Fiber.interrupt(fiber);

      deepStrictEqual(Reflect.get(globalThis, PreviewStateKey), {
        status: "loading",
      });
      strictEqual(signal?.aborted, true);
    })),
  );
});
