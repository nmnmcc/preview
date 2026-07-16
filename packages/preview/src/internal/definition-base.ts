import type { PreviewMetadata } from "./preview-metadata";

export const PreviewDefinitionTypeId: unique symbol = Symbol.for(
  "@nmnmcc/preview/PreviewDefinition",
);

export interface PreviewTargetBase {
  readonly type: string;
}

export interface PreviewDefinitionOf<
  Target extends PreviewTargetBase,
> {
  readonly [PreviewDefinitionTypeId]: true;
  readonly metadata: PreviewMetadata;
  readonly target: Target;
}

export const makeDefinition = <const Target extends PreviewTargetBase>(
  metadata: PreviewMetadata,
  target: Target,
): PreviewDefinitionOf<Target> =>
  Object.freeze({
    [PreviewDefinitionTypeId]: true as const,
    metadata: Object.freeze(metadata),
    target: Object.freeze(target),
  });
