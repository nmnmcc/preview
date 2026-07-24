import type * as Path from "effect/Path";
import colors from "picocolors";
import type * as Generation from "./generation";

type PreviewLogType = "error" | "info" | "warn";

const PreviewFileNamePattern = /\.preview\.[^.]+$/u;
const PreviewTag = "[preview]";
let timeFormatter: Intl.DateTimeFormat;

const getTimeFormatter = (): Intl.DateTimeFormat => {
  timeFormatter ??= new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  return timeFormatter;
};

const logColor = (type: PreviewLogType): typeof colors.cyan => {
  switch (type) {
    case "error":
      return colors.red;
    case "info":
      return colors.cyan;
    case "warn":
      return colors.yellow;
  }
};

const formatTag = (type: PreviewLogType): string =>
  logColor(type)(colors.bold(PreviewTag));

const formatPrefix = (type: PreviewLogType, timestampMillis: number): string =>
  `${colors.dim(getTimeFormatter().format(new Date(timestampMillis)))} ${formatTag(type)}`;

const previewName = (path: Path.Path, source: string): string =>
  path.basename(source).replace(PreviewFileNamePattern, "");

export const formatMessage = (
  type: PreviewLogType,
  message: string,
  timestampMillis: number,
): string =>
  `${formatPrefix(type, timestampMillis)} ${logColor(type)(message)}`;

export const formatGeneratedArtifact = (
  path: Path.Path,
  artifact: Generation.GeneratedArtifact,
  timestampMillis: number,
): string => {
  const directory = path.dirname(artifact.source);
  const cleanPath = path.relative(directory, artifact.pngPath);
  const inspection = artifact.inspection;
  if (inspection === undefined) {
    return `${formatPrefix("info", timestampMillis)} ${colors.cyan(previewName(path, artifact.source))} -> ${colors.dim(cleanPath)}`;
  }
  const readmePath = path.relative(directory, inspection.readmePath);
  const overviewPath = path.relative(directory, inspection.overviewPath);
  const checks = inspection.checks;
  const findings = inspection.findings;
  return `${formatPrefix("info", timestampMillis)} ${colors.cyan(previewName(path, artifact.source))} -> ${colors.dim(cleanPath)}; inspect ${colors.dim(readmePath)}, ${colors.dim(overviewPath)} (${colors.red(`${findings.errors} errors`)}, ${colors.yellow(`${findings.warnings} warnings`)}; checks ${checks.passed} passed, ${checks.failed} failed, ${checks.unresolved} unresolved)`;
};

export const formatGenerationFailure = (
  path: Path.Path,
  failure: Generation.GenerationFailure,
  timestampMillis: number,
): string =>
  `${formatPrefix("error", timestampMillis)} ${colors.cyan(previewName(path, failure.source))} -> ${colors.red(failure.message)}`;
