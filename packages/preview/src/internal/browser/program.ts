import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import type * as Rpcs from "../rpcs";
import { layer } from "./layer";
import { PreviewRpcClient } from "./services/PreviewRpcClient";
import { PreviewRunner, type PreviewExecution } from "./services/PreviewRunner";

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
  ) => Effect.Effect<PreviewExecution, Rpcs.SandboxPreviewError>;
}) =>
  Effect.gen(function* () {
    const request = yield* operations.request;
    const disposeFiber = yield* operations.awaitDispose.pipe(Effect.forkScoped);

    const executeUntilDispose = Effect.exit(operations.execute(request)).pipe(
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
  yield* runRequest({
    request: client.SandboxRequest(),
    complete: (exit) => client.SandboxComplete({ exit }),
    awaitDispose: client.SandboxAwaitDispose(),
    disposed: client.SandboxDisposed(),
    execute: runner.execute,
  });
});

/** Runs the current browser preview request. */
export const program = run.pipe(Effect.provide(layer), Effect.scoped);
