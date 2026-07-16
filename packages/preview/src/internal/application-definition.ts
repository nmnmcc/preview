import {
  makeDefinition,
  type PreviewDefinitionOf,
} from "./definition-base";
import type { PreviewMetadata } from "./preview-metadata";

export const ApplicationDefinitionCodeSignature =
  "@nmnmcc/preview/ApplicationDefinition";

export const ApplicationDefinitionTypeId: unique symbol =
  /*#__PURE__*/ Symbol.for(ApplicationDefinitionCodeSignature);

export type ApplicationLocation = string;

export interface ApplicationTarget {
  readonly type: "application";
  readonly location: ApplicationLocation;
}

export interface ApplicationDefinition
  extends PreviewDefinitionOf<ApplicationTarget> {
  readonly [ApplicationDefinitionTypeId]: true;
}

export interface ApplicationOptions extends PreviewMetadata {
  readonly location: ApplicationLocation;
}

export const application = (
  options: ApplicationOptions,
): ApplicationDefinition => {
  const { location, ...metadata } = options;
  if (typeof location !== "string" || location.length === 0) {
    throw new TypeError("An application preview needs a non-empty location.");
  }
  return Object.freeze({
    ...makeDefinition(metadata, { type: "application", location }),
    [ApplicationDefinitionTypeId]: true as const,
  });
};
