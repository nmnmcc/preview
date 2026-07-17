import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as PreviewRpcClient from "./services/PreviewRpcClient";

const runtime = ManagedRuntime.make(PreviewRpcClient.layer);

/**
 * Marks the current application document as ready for capture.
 *
 * This function has no effect when Preview is not capturing the document.
 */
export const ready = (): void => {
  PreviewRpcClient.PreviewRpcClient.use(({ ApplicationReady }) =>
    ApplicationReady(),
  ).pipe(Effect.exit, Effect.asVoid, runtime.runFork);
};
