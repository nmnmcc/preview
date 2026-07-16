import { describe, it } from "@effect/vitest";
import {
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Schema from "effect/Schema";
import {
  Antd,
  Bootstrap,
  Mui,
  Storybook,
  Tailwind,
} from "@nmnmcc/preview/viewports";
import { PreviewViewport } from "../src/internal/preview";

const viewportGroups = [Antd, Bootstrap, Mui, Storybook, Tailwind];

describe("viewport presets", () => {
  it("keeps the documented preset sizes", () => {
    deepStrictEqual({ Tailwind, Bootstrap, Mui, Antd, Storybook }, {
      Tailwind: {
        base: { width: 390, height: 844 },
        sm: { width: 640, height: 960 },
        md: { width: 768, height: 1024 },
        lg: { width: 1024, height: 768 },
        xl: { width: 1280, height: 720 },
        "2xl": { width: 1536, height: 864 },
      },
      Bootstrap: {
        xs: { width: 390, height: 844 },
        sm: { width: 576, height: 864 },
        md: { width: 768, height: 1024 },
        lg: { width: 992, height: 744 },
        xl: { width: 1200, height: 800 },
        xxl: { width: 1400, height: 900 },
      },
      Mui: {
        xs: { width: 390, height: 844 },
        sm: { width: 600, height: 900 },
        md: { width: 900, height: 1200 },
        lg: { width: 1200, height: 800 },
        xl: { width: 1536, height: 864 },
      },
      Antd: {
        xs: { width: 390, height: 844 },
        sm: { width: 576, height: 864 },
        md: { width: 768, height: 1024 },
        lg: { width: 992, height: 744 },
        xl: { width: 1200, height: 800 },
        xxl: { width: 1600, height: 900 },
        xxxl: { width: 1920, height: 1080 },
      },
      Storybook: {
        mobile1: { width: 320, height: 568 },
        mobile2: { width: 414, height: 896 },
        tablet: { width: 834, height: 1112 },
        desktop: { width: 1280, height: 1024 },
      },
    });
  });

  it("checks and freezes every preset", () => {
    for (const group of viewportGroups) {
      assertTrue(Object.isFrozen(group));
      for (const preset of Object.values(group)) {
        assertTrue(Object.isFrozen(preset));
        deepStrictEqual(
          Schema.decodeUnknownSync(PreviewViewport)(preset),
          preset,
        );
        strictEqual(Object.hasOwn(preset, "deviceScaleFactor"), false);
      }
    }
  });
});
