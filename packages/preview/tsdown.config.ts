import * as Schema from "effect/Schema";
import { defineConfig } from "tsdown";

const DevelopmentEntry = Schema.Struct({
  development: Schema.String,
  default: Schema.String,
});

interface DevelopmentEntry extends Schema.Schema.Type<
  typeof DevelopmentEntry
> {}

const declarationPath = (entry: string): string => {
  if (!entry.endsWith(".mjs")) {
    throw new Error(`Expected an ESM entry, received ${entry}`);
  }
  return `${entry.slice(0, -4)}.d.mts`;
};

const publishedEntry = (entry: string) => ({
  types: declarationPath(entry),
  default: entry,
});

const isDevelopmentEntry = Schema.is(DevelopmentEntry);

const developmentEntry = (entry: DevelopmentEntry) => ({
  development: entry.development,
  types: declarationPath(entry.default),
  default: entry.default,
});

export default defineConfig({
  entry: {
    index: "src/index.ts",
    application: "src/Application.ts",
    browser: "src/browser.ts",
    main: "src/internal/cli/main.ts",
    runner: "src/internal/browser/main.ts",
    viewports: "src/Viewports.ts",
  },
  platform: "node",
  deps: {
    onlyImport: [
      "@effect/platform-browser",
      "@effect/platform-node-shared",
      "effect",
      "picocolors",
      "playwright",
      "vite",
    ],
  },
  exports: {
    bin: false,
    exclude: ["main"],
    customExports(exports, { isPublish }) {
      const browserEntry = exports["./browser"];
      const defaultEntry = exports["."];
      const runnerEntry = exports["./runner"];
      if (isPublish) {
        if (
          typeof browserEntry !== "string" ||
          typeof defaultEntry !== "string" ||
          typeof runnerEntry !== "string"
        ) {
          throw new Error("Could not generate the preview package entries");
        }
        exports["."] = {
          browser: publishedEntry(browserEntry),
          ...publishedEntry(defaultEntry),
        };
        exports["./internal/runner"] = publishedEntry(runnerEntry);
      } else if (
        isDevelopmentEntry(browserEntry) &&
        isDevelopmentEntry(defaultEntry) &&
        isDevelopmentEntry(runnerEntry)
      ) {
        exports["."] = {
          browser: developmentEntry(browserEntry),
          ...developmentEntry(defaultEntry),
        };
        exports["./internal/runner"] = developmentEntry(runnerEntry);
      } else {
        throw new Error("Could not generate the preview package entries");
      }
      delete exports["./browser"];
      delete exports["./runner"];
      return exports;
    },
  },
});
