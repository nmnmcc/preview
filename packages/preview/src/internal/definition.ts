import {
  type ApplicationDefinition,
  type ApplicationLocation,
  type ApplicationOptions,
  type ApplicationTarget,
} from "./application-definition";
import {
  makeDefinition,
  type PreviewDefinitionOf,
} from "./definition-base";
import type { PreviewMetadata } from "./preview-metadata";

export {
  application,
  ApplicationDefinitionCodeSignature,
  ApplicationDefinitionTypeId,
} from "./application-definition";

export type {
  ApplicationDefinition,
  ApplicationLocation,
  ApplicationOptions,
  ApplicationTarget,
} from "./application-definition";

export { PreviewDefinitionTypeId } from "./definition-base";

export type PreviewReady = () => void;

export type PreviewUnmount = () => void | Promise<void>;

export interface PreviewMountContext {
  readonly root: HTMLElement;
  readonly ready: PreviewReady;
  readonly signal: AbortSignal;
}

export type PreviewMount = (
  context: PreviewMountContext,
) => PreviewUnmount | Promise<PreviewUnmount>;

export interface ComponentTarget {
  readonly type: "sandbox";
  readonly mount: PreviewMount;
}

export type PreviewTarget = ComponentTarget | ApplicationTarget;

export interface ComponentPreviewDefinition
  extends PreviewDefinitionOf<ComponentTarget> {}

export type PreviewDefinition =
  | ComponentPreviewDefinition
  | ApplicationDefinition;

export interface PreviewOptions extends PreviewMetadata {
  readonly mount: PreviewMount;
}

export type PreviewTemplate<
  Input,
  Output extends PreviewDefinition = PreviewDefinition,
> = (input: Input) => Output;

export const preview = (
  options: PreviewOptions,
): ComponentPreviewDefinition => {
  const { mount, ...metadata } = options;
  if (typeof mount !== "function") {
    throw new TypeError("A component preview needs a mount function.");
  }
  return makeDefinition(metadata, { type: "sandbox", mount });
};

export function template<Input>(
  map: (input: Input) => PreviewOptions,
): PreviewTemplate<Input, ComponentPreviewDefinition>;
export function template<
  Input,
  BaseInput,
  Output extends PreviewDefinition,
>(
  map: (input: Input) => NoInfer<BaseInput>,
  base: PreviewTemplate<BaseInput, Output>,
): PreviewTemplate<Input, Output>;
export function template<
  Input,
  BaseInput,
  Output extends PreviewDefinition,
>(
  ...args:
    | readonly [map: (input: Input) => PreviewOptions]
    | readonly [
        map: (input: Input) => BaseInput,
        base: PreviewTemplate<BaseInput, Output>,
      ]
): PreviewTemplate<Input, ComponentPreviewDefinition | Output> {
  if (args.length === 1) {
    const [map] = args;
    return (input) => preview(map(input));
  }

  const [map, base] = args;
  return (input) => base(map(input));
}
