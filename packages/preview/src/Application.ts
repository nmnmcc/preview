/**
 * Makes an immutable Application preview definition.
 */
export { application } from "./internal/application-definition";

/**
 * Marks the current application document as ready for capture.
 */
export { ready } from "./internal/browser/application";

export type {
  ApplicationDefinition,
  ApplicationLocation,
  ApplicationOptions,
} from "./internal/application-definition";
