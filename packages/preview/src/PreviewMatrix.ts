/**
 * A value that may be used on one preview matrix axis.
 */
export type { PreviewMatrixValue } from "./internal/matrix";

/**
 * A non-empty list of values for one preview matrix axis.
 */
export type { PreviewMatrixAxis } from "./internal/matrix";

/**
 * A record of named preview matrix axes.
 */
export type { PreviewMatrixAxes } from "./internal/matrix";

/**
 * The input made from one value on every matrix axis.
 */
export type { PreviewMatrixAxisInput } from "./internal/matrix";

/**
 * Extra named matrix inputs to add to the generated combinations.
 */
export type { PreviewMatrixInclude } from "./internal/matrix";

/**
 * Any input that the matrix may pass to its preview template.
 */
export type { PreviewMatrixInput } from "./internal/matrix";

/**
 * A partial matrix input that removes matching combinations.
 */
export type { PreviewMatrixExclude } from "./internal/matrix";

/**
 * The axes, exclusions, and extra inputs used to make a matrix.
 */
export type { PreviewMatrixConfig } from "./internal/matrix";

/**
 * Makes a named preview collection from a set of matrix axes.
 */
export { matrix } from "./internal/matrix";
