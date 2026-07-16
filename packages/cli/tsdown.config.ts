import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    main: "src/main.ts"
  },
  platform: "node",
  dts: false,
  deps: {
    onlyImport: [
      "@effect/platform-node-shared",
      "@nmnmcc/preview",
      "effect",
      "vite"
    ]
  },
  unused: {
    level: "error",
    ignore: {
      peerDependencies: ["playwright"]
    }
  },
  attw: false,
  exports: {
    devExports: false,
    exclude: ["main"],
    bin: {
      preview: "src/main.ts"
    }
  }
})
