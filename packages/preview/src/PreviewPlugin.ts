import type {
  BrowserContextOptions,
  LaunchOptions,
  PageScreenshotOptions,
} from "playwright";
import type { PreviewViewport } from "./internal/preview";

/**
 * Playwright settings used by Preview capture.
 */
export interface PreviewPlaywrightOptions {
  readonly launch?: Readonly<LaunchOptions>;
  readonly context?: Readonly<
    Omit<
      BrowserContextOptions,
      | "deviceScaleFactor"
      | "javaScriptEnabled"
      | "offline"
      | "serviceWorkers"
      | "viewport"
    >
  >;
  readonly screenshot?: Readonly<
    Pick<
      PageScreenshotOptions,
      "animations" | "caret" | "omitBackground" | "scale" | "style" | "timeout"
    >
  >;
}

/**
 * The settings accepted by the preview Vite plugin.
 */
export interface PreviewPluginOptions {
  readonly files?: {
    readonly include?: string | ReadonlyArray<string>;
    readonly exclude?: string | ReadonlyArray<string>;
  };
  readonly capture: {
    readonly viewports: Readonly<Record<string, PreviewViewport>>;
    /**
     * Generates filesystem layout inspection artifacts.
     */
    readonly inspection?: true;
    /**
     * The maximum number of Playwright page tasks that may run at once.
     *
     * @default node:os.availableParallelism()
     */
    readonly concurrency?: number;
    readonly timeoutMs?: number;
    readonly playwright?: PreviewPlaywrightOptions;
  };
  readonly artifacts?: {
    readonly output?: string;
    readonly clean?: boolean;
    readonly version?: {
      /**
       * The number of real versions to keep for each artifact.
       */
      readonly retain: number;
    };
  };
  readonly build?: {
    /**
     * Checks final build chunks for Preview code.
     *
     * @default true
     */
    readonly check?: boolean;
  };
}

/**
 * Makes the preview Vite plugin.
 */
export { preview } from "./internal/plugin";
