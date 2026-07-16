/**
 * Defines the supported screenshot capture modes.
 */
export { CaptureMode } from "./internal/preview";

/**
 * Defines the size and optional device scale for a viewport.
 */
export { PreviewViewport } from "./internal/preview";

/**
 * Lets one preview use a configured viewport or override part of it.
 */
export { PreviewViewportOverride } from "./internal/preview";

/**
 * Defines capture settings that a preview may override.
 */
export { PreviewMetadata } from "./internal/preview";

/**
 * Defines a checked preview with its metadata and render function.
 */
export { PreviewDefinition } from "./internal/preview";

/**
 * Defines a non-empty record of named preview definitions.
 */
export { PreviewCollection } from "./internal/preview";

/**
 * Marks a preview render as ready for capture.
 */
export type { PreviewDone } from "./internal/preview";

/**
 * Renders a preview into its root element.
 */
export type { PreviewRender } from "./internal/preview";

/**
 * A preview module's supported default export.
 */
export type { PreviewExport } from "./internal/preview";

/**
 * The options used to make one preview definition.
 */
export type { PreviewOptions } from "./internal/preview";

/**
 * A reusable function that maps input to a preview definition.
 */
export type { PreviewTemplate } from "./internal/preview";

/**
 * Makes an immutable preview definition.
 */
export { preview } from "./internal/preview";

/**
 * Makes or extends a reusable preview template.
 */
export { template } from "./internal/preview";
