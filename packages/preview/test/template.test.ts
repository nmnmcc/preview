import { describe, it } from "@effect/vitest";
import {
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import {
  preview,
  template,
  type PreviewOptions,
  type PreviewRender,
  type PreviewTemplate,
} from "../src/Preview";

interface ProjectPreviewInput {
  readonly captureFullPage: boolean;
  readonly render: PreviewRender;
}

const compileTemplateContracts = (): void => {
  interface BaseInput {
    readonly value: string;
  }

  const base: PreviewTemplate<BaseInput> = ({ value }) =>
    preview({
      render: (root) => {
        root.textContent = value;
      },
    });
  const composed = template(
    (input: { readonly count: number }): BaseInput => ({
      value: String(input.count),
    }),
    base,
  );

  composed({ count: 1 });

  // @ts-expect-error The composed input requires count.
  composed({});

  template(
    // @ts-expect-error The map result must match the base input.
    (input: { readonly invalid: true }) => input,
    base,
  );
};

describe("preview templates", () => {
  it("uses the core preview when no base is given", () => {
    let mapCalls = 0;
    const render: PreviewRender = () => undefined;
    const projectPreview = template(
      (input: ProjectPreviewInput): PreviewOptions => {
        mapCalls += 1;
        return {
          capture: input.captureFullPage ? "fullPage" : "viewport",
          render: input.render,
        };
      },
    );

    strictEqual(mapCalls, 0);
    const definition = projectPreview({ captureFullPage: true, render });

    strictEqual(mapCalls, 1);
    strictEqual(definition.render, render);
    deepStrictEqual(definition.metadata, { capture: "fullPage" });
    assertTrue(Object.isFrozen(definition));
    assertTrue(Object.isFrozen(definition.metadata));
  });

  it("composes maps from the outer template to the base", () => {
    const calls: Array<string> = [];
    const render: PreviewRender = () => undefined;
    const base: PreviewTemplate<PreviewOptions> = (options) => {
      calls.push("base");
      return preview(options);
    };
    const withCapture = template(
      (input: ProjectPreviewInput): PreviewOptions => {
        calls.push("capture");
        return {
          capture: input.captureFullPage ? "fullPage" : "viewport",
          render: input.render,
        };
      },
      base,
    );
    const withDefaults = template(
      (input: { readonly render: PreviewRender }): ProjectPreviewInput => {
        calls.push("defaults");
        return { captureFullPage: true, render: input.render };
      },
      withCapture,
    );

    const definition = withDefaults({ render });

    deepStrictEqual(calls, ["defaults", "capture", "base"]);
    deepStrictEqual(definition.metadata, { capture: "fullPage" });
    strictEqual(definition.render, render);
  });
});

void compileTemplateContracts;
