import * as Schema from "effect/Schema";

export interface GeneratedInspectionArtifact {
  readonly directoryPath: string;
  readonly readmePath: string;
  readonly manifestPath: string;
  readonly overviewPath: string;
  readonly findings: {
    readonly errors: number;
    readonly warnings: number;
  };
  readonly checks: {
    readonly passed: number;
    readonly failed: number;
    readonly unresolved: number;
  };
}

export interface GeneratedArtifact {
  readonly source: string;
  readonly state: string;
  readonly variant?: string;
  readonly viewport: string;
  readonly pngPath: string;
  readonly inspection?: GeneratedInspectionArtifact;
}

export interface GenerationFailure {
  readonly source: string;
  readonly state?: string;
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
    state: Schema.String,
    variant: Schema.optionalKey(Schema.String),
    viewport: Schema.String,
    pngPath: Schema.String,
    inspection: Schema.optionalKey(
      Schema.Struct({
        directoryPath: Schema.String,
        readmePath: Schema.String,
        manifestPath: Schema.String,
        overviewPath: Schema.String,
        findings: Schema.Struct({
          errors: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
          warnings: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        }),
        checks: Schema.Struct({
          passed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
          failed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
          unresolved: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        }),
      }),
    ),
  }),
) satisfies Schema.Codec<GeneratedArtifact>;

export const GenerationFailure = Schema.toStandardSchemaV1(
  Schema.Struct({
    source: Schema.String,
    state: Schema.optionalKey(Schema.String),
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
