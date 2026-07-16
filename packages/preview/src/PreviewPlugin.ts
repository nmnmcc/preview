/**
 * Limits one generation run to the given preview paths or glob patterns.
 */
export type { GenerateRequest } from "./internal/plugin";

/**
 * The generation API exposed by the Vite plugin.
 */
export type { PreviewPluginApi } from "./internal/plugin";

/**
 * The Vite plugin type with its preview generation API.
 */
export type { PreviewVitePlugin } from "./internal/plugin";

/**
 * The settings accepted by the preview Vite plugin.
 */
export type { PreviewPluginOptions } from "./internal/config";

/**
 * Makes the preview Vite plugin.
 */
export { preview } from "./internal/plugin";
