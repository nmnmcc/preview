import { availableParallelism } from "node:os";
import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import { ViewportPresets } from "@nmnmcc/preview";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  layer as configLayer,
  Config as PreviewConfig,
  resolvePreviewMetadata,
  resolvePreviewOptions,
} from "../src/internal/services/Config";
import type { PreviewPluginOptions } from "../src/PreviewPlugin";

describe("preview configuration", () => {
  it.effect("resolves required project viewports and defaults", () =>
    Effect.gen(function* () {
      const config = yield* resolvePreviewOptions({
        capture: {
          viewports: {
            mobile: { width: 390, height: 844 },
          },
        },
      });

      strictEqual(config.clean, false);
      deepStrictEqual(config.include, ["**/*.preview.{js,jsx,ts,tsx}"]);
      deepStrictEqual(config.exclude, []);
      strictEqual(config.output, ".preview");
      strictEqual(config.concurrency, availableParallelism());
      strictEqual(config.timeoutMs, 30_000);
      strictEqual(config.version, undefined);
      deepStrictEqual(config.viewports.mobile, {
        name: "mobile",
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
      });

      const cleanConfig = yield* resolvePreviewOptions({
        artifacts: { clean: true, version: { retain: 3 } },
        capture: {
          concurrency: 2,
          viewports: {
            mobile: { width: 390, height: 844 },
          },
        },
      });
      strictEqual(cleanConfig.clean, true);
      strictEqual(cleanConfig.concurrency, 2);
      deepStrictEqual(cleanConfig.version, { retain: 3 });
    }),
  );

  it.effect(
    "provides resolved options and generation output as a service",
    () =>
      Effect.gen(function* () {
        const config = yield* PreviewConfig;

        strictEqual(config.options.output, "artifacts/previews");
        const defaultGeneration = yield* config.resolveGeneration();
        deepStrictEqual(defaultGeneration.cleanOutputs, ["artifacts/previews"]);

        const overrideGeneration = yield* config.resolveGeneration("images");
        strictEqual(overrideGeneration.output, "images");
        deepStrictEqual(overrideGeneration.cleanOutputs, [
          "artifacts/previews",
          "images",
        ]);
      }).pipe(
        Effect.provide(
          configLayer({
            artifacts: { output: "artifacts\\previews" },
            capture: {
              viewports: { mobile: { width: 390, height: 844 } },
            },
          }),
        ),
      ),
  );

  it.effect("rejects invalid capture concurrency", () =>
    Effect.gen(function* () {
      for (const concurrency of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        const result = yield* Effect.result(
          resolvePreviewOptions({
            capture: {
              concurrency,
              viewports: { mobile: { width: 390, height: 844 } },
            },
          }),
        );

        assertTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          strictEqual(result.failure._tag, "PreviewConfigError");
          assertInclude(result.failure.detail, '["capture"]["concurrency"]');
        }
      }
    }),
  );

  it.effect("rejects output paths outside a source child directory", () =>
    Effect.gen(function* () {
      const invalidOutputs = [
        "",
        ".",
        "..",
        "../images",
        "/images",
        "C:\\images",
        "images//nested",
        "images/*",
      ];

      for (const output of invalidOutputs) {
        const result = yield* Effect.result(
          resolvePreviewOptions({
            artifacts: { output },
            capture: {
              viewports: { mobile: { width: 390, height: 844 } },
            },
          }),
        );
        assertTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          strictEqual(result.failure._tag, "PreviewConfigError");
          assertInclude(result.failure.detail, "output");
        }
      }
    }),
  );

  it.effect("accepts source-like output directory names", () =>
    Effect.gen(function* () {
      const src = yield* resolvePreviewOptions({
        artifacts: { output: "src" },
        capture: {
          viewports: { mobile: { width: 390, height: 844 } },
        },
      });
      const images = yield* resolvePreviewOptions({
        artifacts: { output: "images" },
        capture: {
          viewports: { mobile: { width: 390, height: 844 } },
        },
      });

      strictEqual(src.output, "src");
      strictEqual(images.output, "images");
    }),
  );

  it.effect("normalizes include and exclude globs", () =>
    Effect.gen(function* () {
      const options: PreviewPluginOptions = {
        capture: {
          viewports: {
            mobile: { width: 390, height: 844 },
          },
        },
        files: {
          include: ["src/**/*.story.ts", "src/**/*.story.tsx"],
          exclude: "src/generated/**",
        },
      };
      const config = yield* resolvePreviewOptions(options);

      deepStrictEqual(config.include, [
        "src/**/*.story.ts",
        "src/**/*.story.tsx",
      ]);
      deepStrictEqual(config.exclude, ["src/generated/**"]);
    }),
  );

  it.effect("resolves a public viewport preset group", () =>
    Effect.gen(function* () {
      const config = yield* resolvePreviewOptions({
        capture: { viewports: ViewportPresets.Tailwind },
      });

      deepStrictEqual(Object.keys(config.viewports), [
        "base",
        "sm",
        "md",
        "lg",
        "xl",
        "2xl",
      ]);
      deepStrictEqual(config.viewports.base, {
        name: "base",
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
      });
      deepStrictEqual(config.viewports["2xl"], {
        name: "2xl",
        width: 1536,
        height: 864,
        deviceScaleFactor: 1,
      });
      for (const viewport of Object.values(config.viewports)) {
        strictEqual(viewport.deviceScaleFactor, 1);
      }

      for (const group of Object.values(ViewportPresets)) {
        const groupConfig = yield* resolvePreviewOptions({
          capture: { viewports: group },
        });
        deepStrictEqual(Object.keys(groupConfig.viewports), Object.keys(group));
        for (const viewport of Object.values(groupConfig.viewports)) {
          strictEqual(viewport.deviceScaleFactor, 1);
        }
      }
    }),
  );

  it.effect("selects, overrides, and adds per-file viewports", () =>
    Effect.gen(function* () {
      const config = yield* resolvePreviewOptions({
        capture: {
          viewports: {
            mobile: { width: 390, height: 844 },
            desktop: { width: 1440, height: 900 },
          },
        },
      });
      const metadata = yield* resolvePreviewMetadata(
        {
          viewports: {
            mobile: { width: 360, height: "full-900" },
            poster: { width: 600, height: 1200 },
          },
        },
        config,
      );

      deepStrictEqual(metadata.viewports, [
        {
          name: "mobile",
          width: 360,
          height: "full-900",
          deviceScaleFactor: 1,
        },
        { name: "poster", width: 600, height: 1200, deviceScaleFactor: 1 },
      ]);
    }),
  );

  it.effect("rejects missing and invalid viewport dimensions", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.result(resolvePreviewOptions({}));
      const invalid = yield* Effect.result(
        resolvePreviewOptions({
          capture: {
            viewports: { mobile: { width: 0, height: 844 } },
          },
        }),
      );
      const invalidHeights = [
        "page",
        "full-",
        "full-0",
        "full--1",
        "full-1.5",
        "full-900px",
        "full-9007199254740992",
      ];

      assertTrue(Result.isFailure(missing));
      assertTrue(Result.isFailure(invalid));
      if (Result.isFailure(missing)) {
        strictEqual(missing.failure._tag, "PreviewConfigError");
        assertInclude(missing.failure.detail, '["capture"]');
      }
      if (Result.isFailure(invalid)) {
        strictEqual(invalid.failure._tag, "PreviewConfigError");
        assertInclude(
          invalid.failure.detail,
          '["capture"]["viewports"]["mobile"]["width"]',
        );
      }
      for (const height of invalidHeights) {
        const result = yield* Effect.result(
          resolvePreviewOptions({
            capture: {
              viewports: { mobile: { width: 390, height } },
            },
          }),
        );
        assertTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          assertInclude(
            result.failure.detail,
            '["capture"]["viewports"]["mobile"]["height"]',
          );
        }
      }
    }),
  );

  it.effect("rejects empty and unknown preview viewport selections", () =>
    Effect.gen(function* () {
      const emptyProject = yield* Effect.result(
        resolvePreviewOptions({ capture: { viewports: {} } }),
      );
      assertTrue(Result.isFailure(emptyProject));
      if (Result.isFailure(emptyProject)) {
        strictEqual(emptyProject.failure._tag, "PreviewConfigError");
        assertInclude(emptyProject.failure.detail, "viewports");
      }

      const project = yield* resolvePreviewOptions({
        capture: {
          viewports: { mobile: { width: 390, height: 844 } },
        },
      });
      const emptySelection = yield* Effect.result(
        resolvePreviewMetadata({ viewports: {} }, project),
      );
      assertTrue(Result.isFailure(emptySelection));
      if (Result.isFailure(emptySelection)) {
        strictEqual(emptySelection.failure._tag, "PreviewConfigError");
        assertInclude(emptySelection.failure.detail, "preview metadata");
      }

      const unknownSelection = yield* Effect.result(
        resolvePreviewMetadata({ viewports: { unknown: true } }, project),
      );
      assertTrue(Result.isFailure(unknownSelection));
      if (Result.isFailure(unknownSelection)) {
        strictEqual(unknownSelection.failure._tag, "PreviewConfigError");
        assertInclude(unknownSelection.failure.detail, "unknown viewport");
      }
    }),
  );

  it.effect("rejects invalid retention and old flat options", () =>
    Effect.gen(function* () {
      const invalidInputs: ReadonlyArray<unknown> = [
        {
          artifacts: { version: { retain: 0 } },
          capture: {
            viewports: { mobile: { width: 390, height: 844 } },
          },
        },
        {
          artifacts: { version: {} },
          capture: {
            viewports: { mobile: { width: 390, height: 844 } },
          },
        },
        {
          viewports: { mobile: { width: 390, height: 844 } },
        },
        {
          capture: {
            viewports: { mobile: { width: 390, height: 844 } },
          },
          output: ".preview",
        },
      ];

      for (const input of invalidInputs) {
        const result = yield* Effect.result(resolvePreviewOptions(input));
        assertTrue(Result.isFailure(result));
        if (Result.isFailure(result)) {
          strictEqual(result.failure._tag, "PreviewConfigError");
        }
      }
    }),
  );
});
