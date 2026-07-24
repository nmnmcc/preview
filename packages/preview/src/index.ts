/**
 * Public APIs for preview definitions, matrices, and the Vite plugin.
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
 * APIs for layout inspection definitions and artifacts.
 */
export * as Inspection from "./Inspection";

/**
 * APIs for the preview Vite plugin.
 */
export * as PreviewPlugin from "./PreviewPlugin";

/**
 * Stable viewport size presets for common responsive design systems.
 */
export * as ViewportPresets from "./Viewports";

/**
 * Makes the preview Vite plugin.
 */
export { preview as default } from "./PreviewPlugin";
