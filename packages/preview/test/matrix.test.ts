import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import {
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import { preview } from "../src/Preview";
import { matrix } from "../src/PreviewMatrix";

const compileMatrixContracts = (): void => {
  matrix(
    {
      axes: {
        locale: ["en", "zh"],
        state: ["ready", "error"],
      },
      include: {
        "rtl-error": { locale: "ar", state: "error" },
      },
    },
    (input) => {
      const locale: "en" | "zh" | "ar" = input.locale;
      const state: "ready" | "error" = input.state;
      return preview({
        render: (root) => {
          root.textContent = `${locale}:${state}`;
        },
      });
    },
  );

  matrix(
    {
      axes: {
        // @ts-expect-error A matrix axis must have at least one value.
        locale: [],
      },
    },
    () => preview({ render: () => undefined }),
  );

  matrix(
    {
      axes: {
        // @ts-expect-error Complex values must use a string fixture key.
        user: [{ name: "Ada" }],
      },
    },
    () => preview({ render: () => undefined }),
  );

  matrix(
    {
      axes: { locale: ["en", "zh"] },
      exclude: [
        {
          // @ts-expect-error Exclude values must come from the axis.
          locale: "fr",
        },
      ],
    },
    () => preview({ render: () => undefined }),
  );
};

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
          capture: input.state === "error" ? "fullPage" : "viewport",
          render: () => undefined,
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
    strictEqual(
      collection["locale=en,state=error"]?.metadata.capture,
      "fullPage",
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
      () => preview({ render: () => undefined }),
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
          () => preview({ render: () => undefined }),
        ),
      /axis value.*letters, numbers/,
    );
    assert.throws(
      () =>
        matrix(
          { axes: { count: [-1] } },
          () => preview({ render: () => undefined }),
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
          () => preview({ render: () => undefined }),
        ),
      /final matrix must contain at least one variant/,
    );
  });
});

void compileMatrixContracts;
