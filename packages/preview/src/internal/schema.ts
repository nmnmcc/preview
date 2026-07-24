import * as Schema from "effect/Schema";

export const PositiveNumber = Schema.Finite.check(Schema.isGreaterThan(0));

export const PositiveInteger = Schema.Int.check(Schema.isGreaterThan(0));

export const PreviewNamePartPattern = /^[a-z0-9][a-z0-9_-]*$/i;

export const PreviewNamePart = Schema.NonEmptyString.check(
  Schema.isPattern(PreviewNamePartPattern),
);

export const PreviewStateNamePattern = /^[a-z0-9][a-z0-9_-]*$/;

export const PreviewStateName = Schema.NonEmptyString.check(
  Schema.isPattern(PreviewStateNamePattern),
);

export const ViewportName = PreviewNamePart;

export const PreviewVariantName = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9_,=-]*$/i),
);
