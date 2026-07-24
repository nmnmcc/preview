import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import type * as Rpcs from "../rpcs";
import { layer } from "./layer";
import { PreviewRpcClient } from "./services/PreviewRpcClient";
import {
  PreviewRunner,
  type PreviewExecution,
  type PreviewLifecycle,
} from "./services/PreviewRunner";

export const runRequest = <
  RequestError,
  CompleteError,
  AwaitDisposeError,
  DisposedError,
>(operations: {
  readonly request: Effect.Effect<Rpcs.SandboxPreviewRequest, RequestError>;
  readonly complete: (
    exit: Rpcs.SandboxPreviewExit,
  ) => Effect.Effect<void, CompleteError>;
  readonly awaitDispose: Effect.Effect<void, AwaitDisposeError>;
  readonly disposed: Effect.Effect<void, DisposedError>;
  readonly execute: (
    request: Rpcs.SandboxPreviewRequest,
    lifecycle: PreviewLifecycle,
  ) => Effect.Effect<PreviewExecution, Rpcs.SandboxPreviewError>;
  readonly lifecycle: PreviewLifecycle;
}) =>
  Effect.gen(function* () {
    const request = yield* operations.request;
    const disposeFiber = yield* operations.awaitDispose.pipe(Effect.forkScoped);

    const executeUntilDispose = Effect.exit(
      operations.execute(request, operations.lifecycle),
    ).pipe(
      Effect.flatMap((execution) =>
        operations
          .complete(Exit.map(execution, ({ result }) => result))
          .pipe(
            Effect.andThen(Fiber.join(disposeFiber)),
            Effect.ensuring(
              Exit.isSuccess(execution) ? execution.value.dispose : Effect.void,
            ),
          ),
      ),
    );

    yield* Effect.raceFirst(executeUntilDispose, Fiber.join(disposeFiber));
    yield* operations.disposed;
  });

/** Runs one browser preview request with the provided services. */
export const run = Effect.gen(function* () {
  const client = yield* PreviewRpcClient;
  const runner = yield* PreviewRunner;
  const context = yield* Effect.context<never>();
  const runPromise = Effect.runPromiseWith(context);
  const runFork = Effect.runForkWith(context);
  let done = false;
  const lifecycle: PreviewLifecycle = {
    emit: (name) => runPromise(client.CaptureEmit({ name })),
    done: () => {
      if (done) return;
      done = true;
      runFork(client.CaptureDone().pipe(Effect.exit, Effect.asVoid));
    },
  };
  yield* runRequest({
    request: client.SandboxRequest(),
    complete: (exit) => client.SandboxComplete({ exit }),
    awaitDispose: client.SandboxAwaitDispose(),
    disposed: client.SandboxDisposed(),
    execute: runner.execute,
    lifecycle,
  });
});

/** Runs the current browser preview request. */
export const program = run.pipe(Effect.provide(layer), Effect.scoped);
