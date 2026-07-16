import * as Schema from "effect/Schema";

export const GeneratedArtifact = Schema.Struct({
  source: Schema.String,
  variant: Schema.optionalKey(Schema.String),
  viewport: Schema.String,
  pngPath: Schema.String,
});
export interface GeneratedArtifact
  extends Schema.Schema.Type<typeof GeneratedArtifact> {}

export const GenerationFailure = Schema.Struct({
  source: Schema.String,
  variant: Schema.optionalKey(Schema.String),
  viewport: Schema.optionalKey(Schema.String),
  message: Schema.String,
});
export interface GenerationFailure
  extends Schema.Schema.Type<typeof GenerationFailure> {}

export const GenerationSummary = Schema.Struct({
  artifacts: Schema.Array(GeneratedArtifact),
  failures: Schema.Array(GenerationFailure),
});
export interface GenerationSummary
  extends Schema.Schema.Type<typeof GenerationSummary> {}
