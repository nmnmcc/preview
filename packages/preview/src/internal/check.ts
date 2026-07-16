import * as Schema from "effect/Schema";
import { ApplicationDefinitionCodeSignature } from "./definition";
import { ApplicationReadyStateKey } from "./protocol";

export const ApplicationModuleId = "@nmnmcc/preview/application";
export const PreviewLabel = "preview";

export interface ProductionCodeMatch {
  readonly chunk: string;
  readonly match: string;
}

const PreviewLabeledStatement = Schema.Struct({
  type: Schema.Literal("LabeledStatement"),
  label: Schema.Struct({ name: Schema.Literal(PreviewLabel) }),
});

const OutputChunk = Schema.Struct({
  type: Schema.Literal("chunk"),
  fileName: Schema.optionalKey(Schema.String),
  code: Schema.optionalKey(Schema.String),
  imports: Schema.optionalKey(Schema.Array(Schema.String)),
  dynamicImports: Schema.optionalKey(Schema.Array(Schema.String)),
});

const isObjectValue = Schema.is(Schema.ObjectKeyword);
const isPreviewLabeledStatement = Schema.is(PreviewLabeledStatement);
const isOutputChunk = Schema.is(OutputChunk);

const PreviewLabelCandidate = /\bpreview\s*:/u;

const hasPreviewLabel = (value: unknown): boolean => {
  const pending: Array<unknown> = [value];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!isObjectValue(current) || visited.has(current)) continue;
    visited.add(current);

    if (isPreviewLabeledStatement(current)) return true;

    pending.push(...Object.values(current));
  }

  return false;
};

const CodeSignatures = [
  {
    label: "Application ready runtime",
    value: ApplicationReadyStateKey,
  },
  {
    label: "Application preview definition",
    value: ApplicationDefinitionCodeSignature,
  },
] as const;

/**
 * Finds Application Preview code in final build chunks.
 */
export const findApplicationPreviewCode = (
  bundle: object,
  parse: (code: string) => unknown,
): Array<ProductionCodeMatch> => {
  const matches: Array<ProductionCodeMatch> = [];
  for (const value of Object.values(bundle)) {
    if (!isOutputChunk(value)) continue;
    const fileName = value.fileName ?? "unknown chunk";
    const code = value.code ?? "";
    for (const signature of CodeSignatures) {
      if (code.includes(signature.value)) {
        matches.push({ chunk: fileName, match: signature.label });
      }
    }

    if (
      PreviewLabelCandidate.test(code) &&
      hasPreviewLabel(parse(code))
    ) {
      matches.push({
        chunk: fileName,
        match: `label ${PreviewLabel}:`,
      });
    }

    const imports = [
      ...(value.imports ?? []),
      ...(value.dynamicImports ?? []),
    ];
    if (imports.includes(ApplicationModuleId)) {
      matches.push({
        chunk: fileName,
        match: `external import ${ApplicationModuleId}`,
      });
    }
  }
  return matches;
};

export const formatProductionCodeError = (
  environment: string,
  matches: ReadonlyArray<ProductionCodeMatch>,
): string => {
  const details = matches
    .map((match) => `- ${match.chunk}: ${match.match}`)
    .join("\n");
  return `[preview] Application Preview code remains in the production bundle for environment ${JSON.stringify(environment)}.\n${details}\nWrap capture-only lifecycle code in preview: { ... }. Set build: { check: false } only when this code is intentional.`;
};
