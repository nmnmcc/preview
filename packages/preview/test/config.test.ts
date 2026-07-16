import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  resolvePreviewMetadata,
  resolvePreviewOptions,
} from "../src/internal/config";

describe("preview configuration", () => {
  it.effect("resolves required project viewports and defaults", () =>
    Effect.gen(function* () {
      const config = yield* resolvePreviewOptions({
        viewports: {
          mobile: { width: 390, height: 844 },
        },
      });

      strictEqual(config.capture, "viewport");
      strictEqual(config.timeoutMs, 30_000);
      deepStrictEqual(config.viewports.mobile, {
        name: "mobile",
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
      });
    }),
  );

  it.effect("selects, overrides, and adds per-file viewports", () =>
    Effect.gen(function* () {
      const config = yield* resolvePreviewOptions({
        viewports: {
          mobile: { width: 390, height: 844 },
          desktop: { width: 1440, height: 900 },
        },
      });
      const metadata = yield* resolvePreviewMetadata(
        {
          capture: "fullPage",
          viewports: {
            mobile: { width: 360 },
            poster: { width: 600, height: 1200 },
          },
        },
        config,
      );

      strictEqual(metadata.capture, "fullPage");
      deepStrictEqual(metadata.viewports, [
        { name: "mobile", width: 360, height: 844, deviceScaleFactor: 1 },
        { name: "poster", width: 600, height: 1200, deviceScaleFactor: 1 },
      ]);
    }),
  );

  it.effect("rejects missing and invalid viewport dimensions", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.result(resolvePreviewOptions({}));
      const invalid = yield* Effect.result(
        resolvePreviewOptions({
          viewports: { mobile: { width: 0, height: 844 } },
        }),
      );

      assertTrue(Result.isFailure(missing));
      assertTrue(Result.isFailure(invalid));
      if (Result.isFailure(missing)) {
        strictEqual(missing.failure._tag, "PreviewConfigError");
        assertInclude(missing.failure.detail, '["viewports"]');
      }
      if (Result.isFailure(invalid)) {
        strictEqual(invalid.failure._tag, "PreviewConfigError");
        assertInclude(
          invalid.failure.detail,
          '["viewports"]["mobile"]["width"]',
        );
      }
    }),
  );

});
