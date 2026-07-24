/**
 * Makes an immutable Application preview definition.
 */
export { application } from "./internal/application-definition";

/**
 * Captures named application states and ends the current capture.
 */
export { done, emit } from "./internal/browser/application";

export type {
  ApplicationDefinition,
  ApplicationLocation,
  ApplicationOptions,
} from "./internal/application-definition";
