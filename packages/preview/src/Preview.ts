/**
 * Defines and checks the size and optional device scale for a viewport.
 */
export { PreviewViewport } from "./internal/preview";

/**
 * A fixed viewport height or a full-page height with an optional layout height.
 */
export type { PreviewViewportHeight } from "./internal/preview";

/**
 * Defines and checks how a preview selects or changes a viewport.
 */
export { PreviewViewportOverride } from "./internal/preview";

/**
 * Defines and checks capture settings that a preview may override.
 */
export { PreviewMetadata } from "./internal/preview";

/**
 * Defines and checks a preview with its metadata and target.
 */
export { PreviewDefinition } from "./internal/preview";

/**
 * Defines and checks a non-empty record of named preview definitions.
 */
export { PreviewCollection } from "./internal/preview";

/**
 * Defines and checks a preview module's supported default export.
 */
export { PreviewExport } from "./internal/preview";

/**
 * The target used by one preview definition.
 */
export type { PreviewTarget } from "./internal/preview";

/**
 * A reusable function that maps input to a preview definition.
 */
export type { PreviewTemplate } from "./internal/preview";

/**
 * Makes or extends a reusable preview template.
 */
export { template } from "./internal/preview";
