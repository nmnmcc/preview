/**
 * Browser-safe APIs for preview definitions and matrices.
 *
 * @packageDocumentation
 */

/**
 * Makes an immutable preview definition.
 */
export { preview } from "./Preview";

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
