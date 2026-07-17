import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { afterEach } from "vitest";
import { application } from "../src/Application";
import { preview, type PreviewReady } from "../src/index";
import { runRequest } from "../src/internal/browser/program";
import * as PreviewRunner from "../src/internal/browser/services/PreviewRunner";
import * as Rpcs from "../src/internal/rpcs";

const definitionKey = "__NMM_PREVIEW_TEST_DEFINITION__";
let moduleId = 0;
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

const restoreDocument = (): void => {
  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
    return;
  }
  Object.defineProperty(globalThis, "document", originalDocument);
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, definitionKey);
  restoreDocument();
});

const dataModule = (source: string): string =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}#${moduleId++}`;

interface RunnerRequest {
  readonly action?: "probe" | "render";
  readonly variant?: string;
}

const setRunnerEnvironment = (
  definition: unknown,
  root: object | null,
): string => {
  Reflect.set(globalThis, definitionKey, definition);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id: string) => (id === "preview-root" ? root : null),
    },
  });
  return dataModule(
    `export default globalThis[${JSON.stringify(definitionKey)}]`,
  );
};

const execute = (
  definition: unknown,
  root: object | null,
  request: RunnerRequest = {},
): Effect.Effect<PreviewRunner.PreviewExecution, Rpcs.SandboxPreviewError> => {
  const moduleUrl = setRunnerEnvironment(definition, root);
  const rpcRequest: Rpcs.SandboxPreviewRequest =
    request.action === "probe"
      ? Rpcs.SandboxPreviewRequest.cases.Probe.make({ moduleUrl })
      : Rpcs.SandboxPreviewRequest.cases.Render.make({
          moduleUrl,
          ...(request.variant === undefined
            ? {}
            : { variant: request.variant }),
        });
  return Effect.gen(function* () {
    const runner = yield* PreviewRunner.PreviewRunner;
    return yield* runner.execute(rpcRequest);
  }).pipe(Effect.provide(PreviewRunner.layer));
};

const executeFailure = (
  definition: unknown,
  root: object | null,
  request?: RunnerRequest,
): Promise<Rpcs.SandboxPreviewError> =>
  Effect.runPromise(Effect.flip(execute(definition, root, request)));

const requireFunction = <Arguments extends ReadonlyArray<unknown>>(
  value: ((...arguments_: Arguments) => void) | undefined,
): ((...arguments_: Arguments) => void) => {
  if (value === undefined) throw new Error("The test signal is missing.");
  return value;
};

describe("preview browser runner", () => {
  it.effect("interrupts pending execution when disposal is requested", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const executeStarted = yield* Deferred.make<void>();
        const executeInterrupted = yield* Deferred.make<void>();
        const disposeRequested = yield* Deferred.make<void>();
        const disposed = yield* Deferred.make<void>();
        const request = Rpcs.SandboxPreviewRequest.cases.Probe.make({
          moduleUrl: "data:text/javascript,export default {}",
        });

        const fiber = yield* runRequest({
          request: Effect.succeed(request),
          complete: () =>
            Effect.die("Pending execution completed before disposal."),
          awaitDispose: Deferred.await(disposeRequested),
          disposed: Deferred.succeed(disposed, undefined).pipe(Effect.asVoid),
          execute: () =>
            Deferred.succeed(executeStarted, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Deferred.succeed(executeInterrupted, undefined).pipe(
                  Effect.asVoid,
                ),
              ),
            ),
        }).pipe(Effect.forkChild);
        yield* Deferred.await(executeStarted);
        yield* Deferred.succeed(disposeRequested, undefined);
        yield* Fiber.join(fiber);

        yield* Deferred.await(executeInterrupted);
        yield* Deferred.await(disposed);
      }),
    ),
  );

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

    const running = Effect.runPromise(execute(definition, root));
    await mountCalled;
    requireFunction(ready)();
    requireFunction(ready)();
    requireFunction(finishMount)();

    const execution = await running;
    deepStrictEqual(execution.result, { type: "render" });
    await Effect.runPromise(execution.dispose);
    await Effect.runPromise(execution.dispose);
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

    const execution = await Effect.runPromise(
      execute(collection, null, { action: "probe" }),
    );

    strictEqual(mountCalls, 0);
    deepStrictEqual(execution.result, {
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

    const execution = await Effect.runPromise(
      execute(collection, {}, { variant: "error" }),
    );

    deepStrictEqual(calls, ["error"]);
    deepStrictEqual(execution.result, { type: "render" });
    await Effect.runPromise(execution.dispose);
  });

  it("requires a collection target for mounting", async () => {
    const error = await executeFailure(
      { ready: preview({ mount: () => () => undefined }) },
      {},
    );
    strictEqual(
      error.detail,
      "A preview variant must be selected before rendering a preview collection.",
    );
  });

  it("reports mount failures without waiting for ready", async () => {
    const error = await executeFailure(
      preview({
        mount: () => Promise.reject(new Error("mount failed")),
      }),
      {},
    );
    strictEqual(error.detail, "Sandbox mount failed.");
  });

  it("rejects a mount that does not return an unmount function", async () => {
    const invalidMount = new Proxy(() => () => undefined, {
      apply: () => undefined,
    });
    const error = await executeFailure(preview({ mount: invalidMount }), {});
    strictEqual(error.detail, "Sandbox mount failed.");
  });

  it("rejects a default export that was not made by preview", async () => {
    const error = await executeFailure(
      {
        metadata: {},
        target: { type: "sandbox", mount: () => () => undefined },
      },
      {},
    );
    strictEqual(
      error.detail,
      "The default export must be a preview definition or a non-empty preview collection.",
    );
  });

  it("reports a missing Sandbox root", async () => {
    const error = await executeFailure(
      preview({ mount: () => () => undefined }),
      null,
    );
    strictEqual(error.detail, "The preview root element is missing.");
  });

  it("does not run an Application inside the Sandbox page", async () => {
    const error = await executeFailure(
      application({ location: "/projects/42" }),
      {},
    );
    strictEqual(
      error.detail,
      "An application preview cannot run inside the Sandbox page.",
    );
  });

  it.effect("preserves interruption and aborts the Sandbox mount", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const mountStarted = yield* Deferred.make<void>();
        let signal: AbortSignal | undefined;
        const definition = preview({
          mount: (context) => {
            signal = context.signal;
            Deferred.doneUnsafe(mountStarted, Effect.void);
            return new Promise<never>(() => undefined);
          },
        });

        const fiber = yield* Effect.forkChild(execute(definition, {}));
        yield* Deferred.await(mountStarted);
        yield* Fiber.interrupt(fiber);

        strictEqual(signal?.aborted, true);
      }),
    ),
  );

  it.effect("runs a late unmount exactly once after interruption", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const mountStarted = yield* Deferred.make<void>();
        const finishMount = yield* Deferred.make<() => void>();
        const unmounted = yield* Deferred.make<void>();
        const context = yield* Effect.context<never>();
        const runPromise = Effect.runPromiseWith(context);
        let signal: AbortSignal | undefined;
        let unmountCalls = 0;
        const definition = preview({
          mount: (mountContext) => {
            signal = mountContext.signal;
            Deferred.doneUnsafe(mountStarted, Effect.void);
            return runPromise(Deferred.await(finishMount));
          },
        });

        const fiber = yield* Effect.forkChild(execute(definition, {}));
        yield* Deferred.await(mountStarted);
        yield* Fiber.interrupt(fiber);
        strictEqual(signal?.aborted, true);

        Deferred.doneUnsafe(
          finishMount,
          Effect.succeed(() => {
            unmountCalls += 1;
            Deferred.doneUnsafe(unmounted, Effect.void);
          }),
        );
        yield* Deferred.await(unmounted);
        strictEqual(unmountCalls, 1);
      }),
    ),
  );
});
