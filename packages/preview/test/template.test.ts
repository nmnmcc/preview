import { describe, it } from "@effect/vitest";
import {
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import {
  template,
  type PreviewTemplate,
} from "../src/Preview";
import {
  preview,
  type ComponentPreviewDefinition,
  type PreviewMount,
  type PreviewOptions,
} from "../src/index";

interface ProjectPreviewInput {
  readonly fullHeight: boolean;
  readonly mount: PreviewMount;
}

describe("preview templates", () => {
  it("uses the core preview when no base is given", () => {
    let mapCalls = 0;
    const mount: PreviewMount = () => () => undefined;
    const projectPreview = template(
      (input: ProjectPreviewInput): PreviewOptions => {
        mapCalls += 1;
        return {
          mount: input.mount,
          viewports: {
            mobile: { height: input.fullHeight ? "full" : 844 },
          },
        };
      },
    );

    strictEqual(mapCalls, 0);
    const definition = projectPreview({ fullHeight: true, mount });

    strictEqual(mapCalls, 1);
    strictEqual(definition.target.mount, mount);
    deepStrictEqual(definition.metadata, {
      viewports: { mobile: { height: "full" } },
    });
    assertTrue(Object.isFrozen(definition));
    assertTrue(Object.isFrozen(definition.metadata));
  });

  it("composes maps from the outer template to the base", () => {
    const calls: Array<string> = [];
    const mount: PreviewMount = () => () => undefined;
    const base: PreviewTemplate<
      PreviewOptions,
      ComponentPreviewDefinition
    > = (options) => {
      calls.push("base");
      return preview(options);
    };
    const withHeight = template(
      (input: ProjectPreviewInput): PreviewOptions => {
        calls.push("height");
        return {
          mount: input.mount,
          viewports: {
            mobile: { height: input.fullHeight ? "full" : 844 },
          },
        };
      },
      base,
    );
    const withDefaults = template(
      (input: { readonly mount: PreviewMount }): ProjectPreviewInput => {
        calls.push("defaults");
        return { fullHeight: true, mount: input.mount };
      },
      withHeight,
    );

    const definition = withDefaults({ mount });

    deepStrictEqual(calls, ["defaults", "height", "base"]);
    deepStrictEqual(definition.metadata, {
      viewports: { mobile: { height: "full" } },
    });
    strictEqual(definition.target.mount, mount);
  });
});
