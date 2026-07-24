/**
 * Browser-safe APIs for preview definitions and matrices.
 *
 * @packageDocumentation
 */

/**
 * Makes an isolated component preview definition.
 */
export { preview } from "./internal/definition";

export type {
  ComponentPreviewDefinition,
  PreviewDefinition,
  PreviewDone,
  PreviewEmit,
  PreviewMount,
  PreviewMountContext,
  PreviewOptions,
  PreviewUnmount,
} from "./internal/definition";

/**
 * Makes or extends a reusable preview template.
 */
export { template } from "./Preview";

/**
 * Makes a named preview collection from a set of matrix axes.
 */
export { matrix } from "./PreviewMatrix";

/**
 * APIs for preview definitions and templates.
 */
export * as Preview from "./Preview";

/**
 * APIs for preview matrices.
 */
export * as PreviewMatrix from "./PreviewMatrix";

/**
 * Browser-safe APIs for layout inspection definitions and artifacts.
 */
export * as Inspection from "./Inspection";
