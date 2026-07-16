import * as Schema from "effect/Schema";

export interface GeneratedArtifact {
  readonly source: string;
  readonly variant?: string;
  readonly viewport: string;
  readonly pngPath: string;
}

export interface GenerationFailure {
  readonly source: string;
  readonly variant?: string;
  readonly viewport?: string;
  readonly message: string;
}

export interface GenerationSummary {
  readonly artifacts: ReadonlyArray<GeneratedArtifact>;
  readonly failures: ReadonlyArray<GenerationFailure>;
}

export const GeneratedArtifact = Schema.toStandardSchemaV1(
  Schema.Struct({
    source: Schema.String,
    variant: Schema.optionalKey(Schema.String),
    viewport: Schema.String,
    pngPath: Schema.String,
  }),
) satisfies Schema.Codec<GeneratedArtifact>;

export const GenerationFailure = Schema.toStandardSchemaV1(
  Schema.Struct({
    source: Schema.String,
    variant: Schema.optionalKey(Schema.String),
    viewport: Schema.optionalKey(Schema.String),
    message: Schema.String,
  }),
) satisfies Schema.Codec<GenerationFailure>;

export const GenerationSummary = Schema.toStandardSchemaV1(
  Schema.Struct({
    artifacts: Schema.Array(GeneratedArtifact),
    failures: Schema.Array(GenerationFailure),
  }),
) satisfies Schema.Codec<GenerationSummary>;
