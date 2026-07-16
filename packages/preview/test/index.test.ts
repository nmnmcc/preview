import { describe, it } from "@effect/vitest";
import {
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Preview as BrowserPreview } from "../src/browser";
import vitePreview, { Preview, preview, template } from "../src/index";

describe("package entry", () => {
  it("separates the default Vite plugin from per-file preview definitions", () => {
    const render = () => undefined;
    const definition = preview({ capture: "fullPage", render });
    const vitePlugin = vitePreview({
      viewports: { mobile: { width: 390, height: 844 } },
    });

    strictEqual(vitePlugin.name, "@nmnmcc/preview");
    strictEqual(BrowserPreview.template, template);
    deepStrictEqual(
      Schema.decodeUnknownSync(Preview.PreviewDefinition)(definition),
      definition,
    );
    strictEqual(definition.render, render);
    deepStrictEqual(definition.metadata, { capture: "fullPage" });
    assertTrue(Object.isFrozen(definition));
    assertTrue(Object.isFrozen(definition.metadata));
  });

  it("rejects invalid preview definitions through the public schema", () => {
    const definition = preview({ render: () => undefined });
    const definitionTypeId = Object.getOwnPropertySymbols(definition)[0];
    if (definitionTypeId === undefined) {
      throw new Error("The preview definition type ID is missing.");
    }

    const missingTypeId = Schema.decodeUnknownResult(Preview.PreviewDefinition)({
      metadata: {},
      render: () => undefined,
    });
    const invalidMetadata = Schema.decodeUnknownResult(Preview.PreviewDefinition)({
      [definitionTypeId]: true,
      metadata: { capture: "invalid" },
      render: () => undefined,
    });
    const invalidRender = Schema.decodeUnknownResult(Preview.PreviewDefinition)({
      [definitionTypeId]: true,
      metadata: {},
      render: "invalid",
    });

    assertTrue(Result.isFailure(missingTypeId));
    assertTrue(Result.isFailure(invalidMetadata));
    assertTrue(Result.isFailure(invalidRender));
  });
});
