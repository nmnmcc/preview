import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Schema from "effect/Schema";
import type { PreviewDone, PreviewEmit } from "../definition";
import { PreviewRpcBindingName } from "../rpcs";
import { PreviewStateName } from "../schema";
import * as PreviewRpcClient from "./services/PreviewRpcClient";

const runtime = ManagedRuntime.make(PreviewRpcClient.layer);
const decodeStateName = Schema.decodeUnknownPromise(PreviewStateName);
let doneSent = false;

const hasActiveCapture = (): boolean =>
  typeof Reflect.get(globalThis, PreviewRpcBindingName) === "function";

/**
 * Captures one named state from the current application document.
 *
 * This function resolves without work when Preview is not capturing the
 * document.
 */
export const emit: PreviewEmit = async (input) => {
  const name = await decodeStateName(input);
  if (!hasActiveCapture()) return;
  await runtime.runPromise(
    PreviewRpcClient.PreviewRpcClient.use(({ CaptureEmit }) =>
      CaptureEmit({ name }),
    ),
  );
};

/**
 * Ends the current application capture after its emitted states.
 *
 * This function has no effect when Preview is not capturing the document.
 */
export const done: PreviewDone = () => {
  if (!hasActiveCapture() || doneSent) return;
  doneSent = true;
  PreviewRpcClient.PreviewRpcClient.use(({ CaptureDone }) =>
    CaptureDone(),
  ).pipe(Effect.exit, Effect.asVoid, runtime.runFork);
};
