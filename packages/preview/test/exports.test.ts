import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as browserEntry from "../src/browser";
import * as packageEntry from "../src/index";
import type {
  Preview,
  PreviewGeneration,
  PreviewMatrix,
  PreviewPlugin,
} from "../src/index";

type PublicTypes = readonly [
  Preview.CaptureMode,
  Preview.PreviewCollection,
  Preview.PreviewDefinition,
  Preview.PreviewDone,
  Preview.PreviewExport,
  Preview.PreviewMetadata,
  Preview.PreviewOptions,
  Preview.PreviewRender,
  Preview.PreviewTemplate<Preview.PreviewOptions>,
  Preview.PreviewViewport,
  Preview.PreviewViewportOverride,
  PreviewGeneration.GeneratedArtifact,
  PreviewGeneration.GenerationFailure,
  PreviewGeneration.GenerationSummary,
  PreviewMatrix.PreviewMatrixAxes,
  PreviewMatrix.PreviewMatrixAxis,
  PreviewMatrix.PreviewMatrixAxisInput<PreviewMatrix.PreviewMatrixAxes>,
  PreviewMatrix.PreviewMatrixConfig<PreviewMatrix.PreviewMatrixAxes>,
  PreviewMatrix.PreviewMatrixExclude<PreviewMatrix.PreviewMatrixAxes>,
  PreviewMatrix.PreviewMatrixInclude<PreviewMatrix.PreviewMatrixAxes>,
  PreviewMatrix.PreviewMatrixInput<PreviewMatrix.PreviewMatrixAxes>,
  PreviewMatrix.PreviewMatrixValue,
  PreviewPlugin.GenerateRequest,
  PreviewPlugin.PreviewPluginApi,
  PreviewPlugin.PreviewPluginOptions,
  PreviewPlugin.PreviewVitePlugin,
];

describe("package exports", () => {
  it("keeps common functions direct and groups the other default entry APIs", () => {
    deepStrictEqual(Object.keys(packageEntry).toSorted(), [
      "Preview",
      "PreviewGeneration",
      "PreviewMatrix",
      "PreviewPlugin",
      "default",
      "matrix",
      "preview",
      "template",
    ]);

    strictEqual(packageEntry.preview, packageEntry.Preview.preview);
    strictEqual(packageEntry.template, packageEntry.Preview.template);
    strictEqual(packageEntry.matrix, packageEntry.PreviewMatrix.matrix);
    strictEqual(packageEntry.default, packageEntry.PreviewPlugin.preview);
  });

  it("keeps common functions direct and groups the browser-safe APIs", () => {
    deepStrictEqual(Object.keys(browserEntry).toSorted(), [
      "Preview",
      "PreviewMatrix",
      "matrix",
      "preview",
      "template",
    ]);

    strictEqual(browserEntry.preview, browserEntry.Preview.preview);
    strictEqual(browserEntry.template, browserEntry.Preview.template);
    strictEqual(browserEntry.matrix, browserEntry.PreviewMatrix.matrix);
  });
});
