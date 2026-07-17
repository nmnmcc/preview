import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { preview } from "../src/index";
import { matrix } from "../src/PreviewMatrix";

const makeDefinition = () => preview({ mount: () => () => undefined });

const callMatrix = (config: unknown): unknown =>
  Reflect.apply(matrix, undefined, [config, makeDefinition]);

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
    deepStrictEqual(collection["locale=en,state=error"]?.metadata, {
      viewports: { mobile: { height: "full" } },
    });
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
        matrix({ axes: { theme: ["high contrast"] } }, () =>
          preview({ mount: () => () => undefined }),
        ),
      /axis value.*letters, numbers/,
    );
    assert.throws(
      () =>
        matrix({ axes: { count: [-1] } }, () =>
          preview({ mount: () => () => undefined }),
        ),
      /non-negative safe integer/,
    );
  });

  it.each([
    [{ axes: {} }, /axes must not be empty/u],
    [{ axes: { theme: [] } }, /must have at least one value/u],
    [{ axes: { "high contrast": ["light"] } }, /axis name.*letters, numbers/u],
    [
      { axes: { theme: [{ name: "light" }] } },
      /not a string, number, or boolean/u,
    ],
    [{ axes: { count: [1, "1"] } }, /more than one value named "1"/u],
  ] as const)("rejects invalid axes %#", (config, expected) => {
    assert.throws(() => callMatrix(config), expected);
  });

  it.each([
    [
      { axes: { theme: ["light"] }, exclude: [{}] },
      /exclude entries must name at least one axis/u,
    ],
    [
      {
        axes: { theme: ["light"] },
        exclude: [{ locale: "en" }],
      },
      /exclude references unknown axis "locale"/u,
    ],
    [
      {
        axes: { theme: ["light"] },
        exclude: [{ theme: "dark" }],
      },
      /exclude references unknown value "dark"/u,
    ],
  ] as const)("rejects invalid exclusions %#", (config, expected) => {
    assert.throws(() => callMatrix(config), expected);
  });

  it.each([
    [
      {
        axes: { theme: ["light"] },
        include: { "high contrast": { theme: "dark" } },
      },
      /included variant name.*letters, numbers/u,
    ],
    [
      {
        axes: { theme: ["light"], locale: ["en"] },
        include: { special: { theme: "dark" } },
      },
      /must set every matrix axis and no other fields/u,
    ],
    [
      {
        axes: { theme: ["light"] },
        include: { special: { theme: { name: "dark" } } },
      },
      /not a string, number, or boolean/u,
    ],
  ] as const)("rejects invalid included variants %#", (config, expected) => {
    assert.throws(() => callMatrix(config), expected);
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
