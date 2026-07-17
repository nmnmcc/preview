import { describe, it } from "@effect/vitest";
import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { application } from "../src/Application";
import vitePreview, { Preview, preview } from "../src/index";

describe("public preview API", () => {
  it("makes separate Vite plugin and component preview values", () => {
    const mount = () => () => undefined;
    const definition = preview({
      mount,
      viewports: { mobile: { height: "full" } },
    });
    const vitePlugin = vitePreview({
      capture: {
        viewports: { mobile: { width: 390, height: 844 } },
      },
    });

    strictEqual(vitePlugin.name, "@nmnmcc/preview");
    deepStrictEqual(
      Schema.decodeUnknownSync(Preview.PreviewDefinition)(definition),
      definition,
    );
    strictEqual(definition.target.type, "sandbox");
    strictEqual(definition.target.mount, mount);
    deepStrictEqual(definition.metadata, {
      viewports: { mobile: { height: "full" } },
    });
    assertTrue(Object.isFrozen(definition));
    assertTrue(Object.isFrozen(definition.metadata));
    assertTrue(Object.isFrozen(definition.target));
  });

  it("rejects invalid preview definitions through the internal schema", () => {
    const definition = preview({ mount: () => () => undefined });
    const definitionTypeId = Object.getOwnPropertySymbols(definition)[0];
    if (definitionTypeId === undefined) {
      throw new Error("The preview definition type ID is missing.");
    }

    const missingTypeId = Schema.decodeUnknownResult(Preview.PreviewDefinition)(
      {
        metadata: {},
        target: { type: "sandbox", mount: () => () => undefined },
      },
    );
    const invalidMetadata = Schema.decodeUnknownResult(
      Preview.PreviewDefinition,
    )({
      [definitionTypeId]: true,
      metadata: { viewports: { mobile: { height: "invalid" } } },
      target: { type: "sandbox", mount: () => () => undefined },
    });
    const invalidTarget = Schema.decodeUnknownResult(Preview.PreviewDefinition)(
      {
        [definitionTypeId]: true,
        metadata: {},
        target: { type: "sandbox", mount: "invalid" },
      },
    );
    const fabricatedApplication = Schema.decodeUnknownResult(
      Preview.PreviewDefinition,
    )({
      [definitionTypeId]: true,
      metadata: {},
      target: { type: "application", location: "/projects/42" },
    });

    assertTrue(Result.isFailure(missingTypeId));
    assertTrue(Result.isFailure(invalidMetadata));
    assertTrue(Result.isFailure(invalidTarget));
    assertTrue(Result.isFailure(fabricatedApplication));
  });

  it("makes an application definition with a distinct target", () => {
    const definition = application({
      location: "/projects/42",
      viewports: { desktop: { height: "full" } },
    });

    strictEqual(definition.target.type, "application");
    strictEqual(definition.target.location, "/projects/42");
    deepStrictEqual(definition.metadata, {
      viewports: { desktop: { height: "full" } },
    });
    deepStrictEqual(
      Schema.decodeUnknownSync(Preview.PreviewDefinition)(definition),
      definition,
    );
    assertTrue(Object.isFrozen(definition));
    assertTrue(Object.isFrozen(definition.metadata));
    assertTrue(Object.isFrozen(definition.target));
  });
});
