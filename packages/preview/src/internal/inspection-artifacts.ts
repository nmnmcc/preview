import * as Inspection from "./inspection";
import type { AnalysisResult } from "./inspection-analysis";

export type InspectionArtifactFile = Inspection.ArtifactFile;

export interface InspectionArtifactTree {
  readonly files: ReadonlyArray<InspectionArtifactFile>;
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

interface FindingLocation {
  readonly finding: Inspection.Finding;
  readonly path: string;
}

const encoder = new TextEncoder();

const text = (value: string): Uint8Array => encoder.encode(value);

const json = (value: unknown): Uint8Array =>
  text(`${JSON.stringify(value, undefined, 2)}\n`);

const slug = (value: string): string => {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.length === 0 ? "finding" : normalized;
};

const findingLocations = (
  findings: ReadonlyArray<Inspection.Finding>,
): ReadonlyArray<FindingLocation> =>
  findings.map((finding, index) => {
    const ordinal = String(index + 1).padStart(4, "0");
    const directoryName = `${ordinal}-${slug(finding.id)}`.slice(0, 80);
    return {
      finding,
      path: `findings/${finding.severity === "error" ? "errors" : "warnings"}/${directoryName}`,
    };
  });

const countBy = <Value>(
  values: ReadonlyArray<Value>,
  predicate: (value: Value) => boolean,
): number => values.filter(predicate).length;

const checkMark = (status: Inspection.CheckResult["status"]): string =>
  status === "passed" ? "x" : " ";

const rootReadme = (
  analysis: AnalysisResult,
  locations: ReadonlyArray<FindingLocation>,
): string => {
  const target = analysis.target;
  const variant = target.variant === undefined ? "default" : target.variant;
  const checks =
    analysis.checks.length === 0
      ? "No checks were declared.\n"
      : analysis.checks
          .map(
            (check) =>
              `- [${checkMark(check.status)}] \`${check.name}\` (${check.status}): ${check.message}`,
          )
          .join("\n") + "\n";
  const findings =
    locations.length === 0
      ? "No findings were recorded.\n"
      : locations
          .map(
            ({ finding, path }) =>
              `- [\`${finding.id}\`](${path}/README.md) (${finding.severity}): ${finding.message}`,
          )
          .join("\n") + "\n";
  return `# Layout inspection

Target: \`${target.source}\` / \`${target.state}\` / \`${variant}\` / \`${target.viewport}\`

Open [the annotated overview](overview.png) with the clean PNG. The overview has the same size as the clean PNG.

## Checks

${checks}
## Findings

${findings}
## Machine data

- [Manifest](manifest.json)
- [Capture](capture.json)
- [Nodes](nodes.json)
- [Checks](checks.json)
`;
};

const findingReadme = (
  finding: Inspection.Finding,
  hasEvidenceImage: boolean,
): string => {
  const evidence = hasEvidenceImage
    ? "Open [the evidence image](evidence.png) for the visible capture region.\n"
    : "This finding has no geometry inside the capture, so it has no evidence image.\n";
  const detail =
    finding.evidence.detail === undefined
      ? ""
      : `\n## Detail\n\n${finding.evidence.detail}\n`;
  return `# ${finding.id}

- Severity: \`${finding.severity}\`
- Source: \`${finding.source}\`
- Rule: \`${finding.rule}\`

${finding.message}

${evidence}
Read [finding.json](finding.json) for the exact data.
${detail}`;
};

export const make = (
  analysis: AnalysisResult,
  rendered: Inspection.RenderedInspectionArtifacts,
): InspectionArtifactTree => {
  const locations = findingLocations(analysis.findings);
  const evidenceByFindingId = new Map(
    rendered.evidence.map((evidence) => [evidence.findingId, evidence]),
  );
  const manifest = Inspection.Manifest.make({
    schemaVersion: 1,
    target: analysis.target,
    ...(analysis.scopeNodeId === undefined
      ? {}
      : { scopeNodeId: analysis.scopeNodeId }),
    files: {
      capture: "capture.json",
      nodes: "nodes.json",
      checks: "checks.json",
      overview: "overview.png",
    },
    findings: locations.map(({ finding, path }) => ({
      id: finding.id,
      path,
    })),
  });
  const files: Array<InspectionArtifactFile> = [
    { path: "README.md", content: text(rootReadme(analysis, locations)) },
    { path: "manifest.json", content: json(manifest) },
    { path: "capture.json", content: json(analysis.capture) },
    { path: "nodes.json", content: json(analysis.nodes) },
    { path: "checks.json", content: json(analysis.checks) },
    { path: "overview.png", content: rendered.overview },
  ];
  for (const { finding, path } of locations) {
    const evidence = evidenceByFindingId.get(finding.id);
    const evidenceImage =
      evidence === undefined
        ? undefined
        : Inspection.EvidenceImage.make({
            path: "evidence.png",
            crop: Inspection.Rect.make(evidence.crop),
            pngWidth: evidence.pngWidth,
            pngHeight: evidence.pngHeight,
          });
    const findingFile = Inspection.FindingFile.make({
      finding,
      ...(evidenceImage === undefined ? {} : { evidenceImage }),
    });
    files.push(
      {
        path: `${path}/README.md`,
        content: text(findingReadme(finding, evidence !== undefined)),
      },
      { path: `${path}/finding.json`, content: json(findingFile) },
    );
    if (evidence !== undefined) {
      files.push({ path: `${path}/evidence.png`, content: evidence.png });
    }
  }
  return {
    files,
    findings: {
      errors: countBy(
        analysis.findings,
        ({ severity }) => severity === "error",
      ),
      warnings: countBy(
        analysis.findings,
        ({ severity }) => severity === "warning",
      ),
    },
    checks: {
      passed: countBy(analysis.checks, ({ status }) => status === "passed"),
      failed: countBy(analysis.checks, ({ status }) => status === "failed"),
      unresolved: countBy(
        analysis.checks,
        ({ status }) => status === "unresolved",
      ),
    },
  };
};
