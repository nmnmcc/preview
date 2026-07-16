import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts"
  },
  exports: false,
  platform: "browser",
  target: "es2022",
  deps: {
    onlyImport: ["@nmnmcc/preview", "react", "react-dom"]
  }
})
