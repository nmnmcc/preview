import * as Effect from "effect/Effect";
import { layer } from "./layer";
import { PreviewRunner } from "./services/PreviewRunner";

/** Runs the current browser preview request. */
export const program = Effect.gen(function* () {
  const runner = yield* PreviewRunner;
  yield* runner.run;
}).pipe(Effect.provide(layer));
