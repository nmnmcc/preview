import { defineConfig } from "tsdown";

export default defineConfig({
  workspace: {
    include: ["packages/*"],
  },
  format: "esm",
  fixedExtension: true,
  clean: true,
  sourcemap: true,
  dts: {
    sourcemap: true,
  },
  deps: {
    skipNodeModulesBundle: true,
  },
  failOnWarn: true,
  suppressWarnings: [
    "TypeScript 7.0 does not yet have a stable API and is experimental",
  ],
  unused: {
    level: "error",
  },
  publint: {
    level: "error",
    strict: true,
  },
  attw: {
    profile: "esm-only",
    level: "error",
  },
  exports: {
    devExports: "development",
    legacy: false,
  },
});
