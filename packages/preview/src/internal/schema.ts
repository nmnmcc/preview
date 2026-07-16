import * as Schema from "effect/Schema";

export const PositiveNumber = Schema.Finite.check(Schema.isGreaterThan(0));

export const PositiveInteger = Schema.Int.check(Schema.isGreaterThan(0));

export const ViewportName = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/i),
);

export const PreviewVariantName = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9_,=-]*$/i),
);
