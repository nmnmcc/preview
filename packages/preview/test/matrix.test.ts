import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import {
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import { matrix } from "../src/PreviewMatrix";
import { preview } from "../src/index";

describe("preview matrix", () => {
  it("expands axes in order, removes matches, and adds named inputs", () => {
    const calls: Array<Readonly<Record<string, string>>> = [];
    const collection = matrix(
      {
        axes: {
          locale: ["en", "zh"],
          state: ["ready", "error"],
        },
        exclude: [{ locale: "zh", state: "error" }],
        include: {
          "rtl-error": { locale: "ar", state: "error" },
        },
      },
      (input) => {
        calls.push(input);
        return preview({
          mount: () => () => undefined,
          viewports: {
            mobile: {
              height: input.state === "error" ? "full" : 844,
            },
          },
        });
      },
    );

    deepStrictEqual(Object.keys(collection), [
      "locale=en,state=ready",
      "locale=en,state=error",
      "locale=zh,state=ready",
      "rtl-error",
    ]);
    deepStrictEqual(calls, [
      { locale: "en", state: "ready" },
      { locale: "en", state: "error" },
      { locale: "zh", state: "ready" },
      { locale: "ar", state: "error" },
    ]);
    deepStrictEqual(
      collection["locale=en,state=error"]?.metadata,
      { viewports: { mobile: { height: "full" } } },
    );
    assertTrue(Object.isFrozen(collection));
  });

  it("supports boolean and non-negative integer axes", () => {
    const collection = matrix(
      {
        axes: {
          disabled: [false, true],
          count: [0, 2],
        },
      },
      () => preview({ mount: () => () => undefined }),
    );

    deepStrictEqual(Object.keys(collection), [
      "disabled=false,count=0",
      "disabled=false,count=2",
      "disabled=true,count=0",
      "disabled=true,count=2",
    ]);
  });

  it("rejects names that cannot be used in stable artifact paths", () => {
    assert.throws(
      () =>
        matrix(
          { axes: { theme: ["high contrast"] } },
          () => preview({ mount: () => () => undefined }),
        ),
      /axis value.*letters, numbers/,
    );
    assert.throws(
      () =>
        matrix(
          { axes: { count: [-1] } },
          () => preview({ mount: () => () => undefined }),
        ),
      /non-negative safe integer/,
    );
  });

  it("rejects an empty final matrix", () => {
    assert.throws(
      () =>
        matrix(
          {
            axes: { theme: ["light"] },
            exclude: [{ theme: "light" }],
          },
          () => preview({ mount: () => () => undefined }),
        ),
      /final matrix must contain at least one variant/,
    );
  });
});
