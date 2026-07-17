import { fileURLToPath } from "node:url";

export const RunnerModuleId = "@nmnmcc/preview/internal/runner";

const PackageUrl = new URL(
  ".",
  import.meta.resolve("@nmnmcc/preview/package.json"),
);

export const RunnerPackagePath = fileURLToPath(PackageUrl);

export const RunnerModulePath = fileURLToPath(
  new URL("./src/internal/browser/main.ts", PackageUrl),
);
