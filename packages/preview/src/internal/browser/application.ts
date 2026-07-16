import * as Schema from "effect/Schema";
import {
  ApplicationReadyStateKey,
  ApplicationReadyStateVersion,
} from "../protocol";

const ApplicationReadyLoading = Schema.Struct({
  version: Schema.Literal(ApplicationReadyStateVersion),
  status: Schema.Literal("loading"),
});

const isApplicationReadyLoading = Schema.is(ApplicationReadyLoading);

/**
 * Marks the current application document as ready for capture.
 *
 * This function has no effect when Preview is not capturing the document.
 */
export const ready = (): void => {
  const state = Reflect.get(
    globalThis,
    Symbol.for(ApplicationReadyStateKey),
  );
  if (isApplicationReadyLoading(state)) {
    Reflect.set(state, "status", "ready");
  }
};
