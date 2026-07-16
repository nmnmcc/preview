import { defineConfig } from "tsdown"

interface DevelopmentEntry {
  readonly development: string
  readonly default: string
}

const declarationPath = (entry: string): string => {
  if (!entry.endsWith(".mjs")) {
    throw new Error(`Expected an ESM entry, received ${entry}`)
  }
  return `${entry.slice(0, -4)}.d.mts`
}

const publishedEntry = (entry: string) => ({
  types: declarationPath(entry),
  default: entry
})

const isDevelopmentEntry = (entry: unknown): entry is DevelopmentEntry =>
  typeof entry === "object" &&
  entry !== null &&
  typeof Reflect.get(entry, "development") === "string" &&
  typeof Reflect.get(entry, "default") === "string"

const developmentEntry = (entry: DevelopmentEntry) => ({
  development: entry.development,
  types: declarationPath(entry.default),
  default: entry.default
})

export default defineConfig({
  entry: {
    index: "src/index.ts",
    browser: "src/browser.ts",
    runner: "src/runner.ts"
  },
  platform: "node",
  deps: {
    onlyImport: [
      "@effect/platform-browser",
      "@effect/platform-node-shared",
      "effect",
      "playwright",
      "vite"
    ]
  },
  exports: {
    customExports(exports, { isPublish }) {
      const browserEntry = exports["./browser"]
      const defaultEntry = exports["."]
      const runnerEntry = exports["./runner"]
      if (isPublish) {
        if (
          typeof browserEntry !== "string" ||
          typeof defaultEntry !== "string" ||
          typeof runnerEntry !== "string"
        ) {
          throw new Error("Could not generate the preview package entries")
        }
        exports["."] = {
          browser: publishedEntry(browserEntry),
          ...publishedEntry(defaultEntry)
        }
        exports["./internal/runner"] = publishedEntry(runnerEntry)
      } else if (
        isDevelopmentEntry(browserEntry) &&
        isDevelopmentEntry(defaultEntry) &&
        isDevelopmentEntry(runnerEntry)
      ) {
        exports["."] = {
          browser: developmentEntry(browserEntry),
          ...developmentEntry(defaultEntry)
        }
        exports["./internal/runner"] = developmentEntry(runnerEntry)
      } else {
        throw new Error("Could not generate the preview package entries")
      }
      delete exports["./browser"]
      delete exports["./runner"]
      return exports
    }
  }
})
