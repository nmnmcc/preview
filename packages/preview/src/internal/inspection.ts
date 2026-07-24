import * as Schema from "effect/Schema";
import * as SchemaRules from "./schema";

const Selector = Schema.NonEmptyString;
const Name = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/iu),
);
const CssPixels = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Ratio = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(1),
);

export const ElementReference = Schema.Struct({
  type: Schema.tag("element"),
  name: Name,
});
export interface ElementReference<Name extends string = string> extends Schema
  .Schema.Type<typeof ElementReference> {
  readonly name: Name;
}

export const ViewportReference = Schema.Struct({
  type: Schema.tag("viewport"),
});
export interface ViewportReference extends Schema.Schema.Type<
  typeof ViewportReference
> {}

export type ContainerReference = ElementReference | ViewportReference;

const Tolerance = Schema.optionalKey(CssPixels);

const VisibleCheck = Schema.Struct({
  type: Schema.tag("visible"),
  element: ElementReference,
});

const InsideCheck = Schema.Struct({
  type: Schema.tag("inside"),
  element: ElementReference,
  container: Schema.Union([ElementReference, ViewportReference]),
  tolerance: Tolerance,
});

const NoOverlapCheck = Schema.Struct({
  type: Schema.tag("no-overlap"),
  first: ElementReference,
  second: ElementReference,
  tolerance: Tolerance,
});

const MinSizeCheck = Schema.Struct({
  type: Schema.tag("min-size"),
  element: ElementReference,
  width: Schema.optionalKey(CssPixels),
  height: Schema.optionalKey(CssPixels),
}).check(
  Schema.makeFilter(
    ({ width, height }) => width !== undefined || height !== undefined,
    { expected: "a width or height" },
  ),
);

const ContentFitsCheck = Schema.Struct({
  type: Schema.tag("content-fits"),
  element: ElementReference,
  axis: Schema.optionalKey(Schema.Literals(["x", "y", "both"])),
  tolerance: Tolerance,
});

const NotClippedCheck = Schema.Struct({
  type: Schema.tag("not-clipped"),
  element: ElementReference,
  tolerance: Tolerance,
});

const UnobscuredCheck = Schema.Struct({
  type: Schema.tag("unobscured"),
  element: ElementReference,
  minimumRatio: Schema.optionalKey(Ratio),
});

export const Check = Schema.Union([
  VisibleCheck,
  InsideCheck,
  NoOverlapCheck,
  MinSizeCheck,
  ContentFitsCheck,
  NotClippedCheck,
  UnobscuredCheck,
]);
export type Check = Schema.Schema.Type<typeof Check>;

const Elements = Schema.Record(Name, Selector).check(Schema.isMinProperties(1));
const DefinitionChecks = Schema.Record(Name, Check).check(
  Schema.isMinProperties(1),
);

export const Definition = Schema.Struct({
  scope: Schema.optionalKey(Selector),
  ignore: Schema.optionalKey(
    Schema.Array(Selector).check(Schema.isMinLength(1)),
  ),
  elements: Schema.optionalKey(Elements),
  checks: Schema.optionalKey(DefinitionChecks),
});
export interface Definition extends Schema.Schema.Type<typeof Definition> {}

type ElementReferences<Elements extends Readonly<Record<string, string>>> = {
  readonly [Key in keyof Elements & string]: ElementReference<Key>;
};

export interface DefineOptions<
  Elements extends Readonly<Record<string, string>>,
> {
  readonly scope?: string;
  readonly ignore?: ReadonlyArray<string>;
  readonly elements?: Elements;
  readonly checks?: (
    elements: ElementReferences<Elements>,
  ) => Readonly<Record<string, Check>>;
}

const elementReferences = <
  const Elements extends Readonly<Record<string, string>>,
>(
  elements: Elements,
): ElementReferences<Elements> => {
  const references: Record<string, ElementReference> = {};
  for (const name of Object.keys(elements)) {
    references[name] = ElementReference.make({ type: "element", name });
  }
  // Every own key in `elements` is copied once with the same key. The values
  // are made by the checked ElementReference constructor above.
  return references as ElementReferences<Elements>;
};

export const define = <
  const Elements extends Readonly<Record<string, string>> = Record<
    never,
    never
  >,
>(
  options: DefineOptions<Elements>,
): Definition => {
  const references = elementReferences(options.elements ?? ({} as Elements));
  return Schema.decodeUnknownSync(Definition)(
    Object.freeze({
      ...(options.scope === undefined ? {} : { scope: options.scope }),
      ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
      ...(options.elements === undefined ? {} : { elements: options.elements }),
      ...(options.checks === undefined
        ? {}
        : { checks: options.checks(references) }),
    }),
    { onExcessProperty: "error" },
  );
};

export const viewport: ViewportReference = Object.freeze(
  ViewportReference.make({ type: "viewport" }),
);

const toleranceFields = (tolerance: number | undefined) =>
  tolerance === undefined ? {} : { tolerance };

export const visible = (element: ElementReference): Check =>
  VisibleCheck.make({ type: "visible", element });

export const inside = (
  element: ElementReference,
  container: ContainerReference,
  options?: { readonly tolerance?: number },
): Check =>
  InsideCheck.make({
    type: "inside",
    element,
    container,
    ...toleranceFields(options?.tolerance),
  });

export const noOverlap = (
  first: ElementReference,
  second: ElementReference,
  options?: { readonly tolerance?: number },
): Check =>
  NoOverlapCheck.make({
    type: "no-overlap",
    first,
    second,
    ...toleranceFields(options?.tolerance),
  });

export const minSize = (
  element: ElementReference,
  size: { readonly width?: number; readonly height?: number },
): Check =>
  Schema.decodeUnknownSync(MinSizeCheck)(
    { type: "min-size", element, ...size },
    { onExcessProperty: "error" },
  );

export const contentFits = (
  element: ElementReference,
  options?: {
    readonly axis?: "x" | "y" | "both";
    readonly tolerance?: number;
  },
): Check =>
  ContentFitsCheck.make({
    type: "content-fits",
    element,
    ...(options?.axis === undefined ? {} : { axis: options.axis }),
    ...toleranceFields(options?.tolerance),
  });

export const notClipped = (
  element: ElementReference,
  options?: { readonly tolerance?: number },
): Check =>
  NotClippedCheck.make({
    type: "not-clipped",
    element,
    ...toleranceFields(options?.tolerance),
  });

export const unobscured = (
  element: ElementReference,
  options?: { readonly minimumRatio?: number },
): Check =>
  UnobscuredCheck.make({
    type: "unobscured",
    element,
    ...(options?.minimumRatio === undefined
      ? {}
      : { minimumRatio: options.minimumRatio }),
  });

export const Rect = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: CssPixels,
  height: CssPixels,
});
export interface Rect extends Schema.Schema.Type<typeof Rect> {}

export const Box = Schema.Struct({
  content: Schema.optionalKey(Rect),
  padding: Schema.optionalKey(Rect),
  border: Rect,
  margin: Schema.optionalKey(Rect),
  client: Schema.optionalKey(Rect),
  scroll: Schema.optionalKey(Rect),
});
export interface Box extends Schema.Schema.Type<typeof Box> {}

export const Node = Schema.Struct({
  id: Schema.NonEmptyString,
  parentId: Schema.optionalKey(Schema.NonEmptyString),
  documentIndex: NonNegativeInteger,
  order: NonNegativeInteger,
  tag: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  name: Schema.optionalKey(Name),
  box: Schema.optionalKey(Box),
  paintOrder: Schema.optionalKey(NonNegativeInteger),
  stackingContext: Schema.Boolean,
  interactive: Schema.Boolean,
  hidden: Schema.Boolean,
  styles: Schema.Record(Schema.String, Schema.String),
});
export interface Node extends Schema.Schema.Type<typeof Node> {}

export const Evidence = Schema.Struct({
  nodeIds: Schema.Array(Schema.NonEmptyString),
  rects: Schema.Array(Rect),
  detail: Schema.optionalKey(Schema.String),
  hitRatio: Schema.optionalKey(Ratio),
});
export interface Evidence extends Schema.Schema.Type<typeof Evidence> {}

export const Finding = Schema.Struct({
  id: Schema.NonEmptyString,
  source: Schema.Literals(["declaration", "check", "hint"]),
  rule: Schema.NonEmptyString,
  severity: Schema.Literals(["error", "warning"]),
  message: Schema.NonEmptyString,
  evidence: Evidence,
});
export interface Finding extends Schema.Schema.Type<typeof Finding> {}

export const CheckResult = Schema.Struct({
  name: Name,
  status: Schema.Literals(["passed", "failed", "unresolved"]),
  message: Schema.NonEmptyString,
  findingId: Schema.optionalKey(Schema.NonEmptyString),
});
export interface CheckResult extends Schema.Schema.Type<typeof CheckResult> {}

export const Target = Schema.Struct({
  source: Schema.NonEmptyString,
  state: SchemaRules.PreviewStateName,
  variant: Schema.optionalKey(Schema.String),
  viewport: Schema.NonEmptyString,
});
export interface Target extends Schema.Schema.Type<typeof Target> {}

export const Capture = Schema.Struct({
  rect: Rect,
  document: Rect,
  layoutViewport: Rect,
  deviceScaleFactor: SchemaRules.PositiveNumber,
  pngWidth: SchemaRules.PositiveInteger,
  pngHeight: SchemaRules.PositiveInteger,
  scale: Schema.Literals(["css", "device"]),
  fullPage: Schema.Boolean,
});
export interface Capture extends Schema.Schema.Type<typeof Capture> {}

export type BrowserRect = Rect;

export const BrowserElementProbe = Schema.Struct({
  elementId: NonNegativeInteger,
  selector: Schema.NonEmptyString,
  tag: Schema.NonEmptyString,
  id: Schema.optionalKey(Schema.NonEmptyString),
  className: Schema.optionalKey(Schema.NonEmptyString),
  role: Schema.optionalKey(Schema.String),
  rect: Rect,
  content: Rect,
  padding: Rect,
  margin: Rect,
  client: Rect,
  scroll: Rect,
  clip: Rect,
  styles: Schema.Record(Schema.String, Schema.String),
  hidden: Schema.Boolean,
  interactive: Schema.Boolean,
  hitRatio: Ratio,
});
export interface BrowserElementProbe extends Schema.Schema.Type<
  typeof BrowserElementProbe
> {}

export const BrowserSelectorResult = Schema.Struct({
  selector: Schema.NonEmptyString,
  error: Schema.optionalKey(Schema.String),
  matches: Schema.Array(BrowserElementProbe),
});
export interface BrowserSelectorResult extends Schema.Schema.Type<
  typeof BrowserSelectorResult
> {}

export const BrowserProbeResult = Schema.Struct({
  scope: BrowserSelectorResult,
  elements: Schema.Record(Name, BrowserSelectorResult),
  ignored: Schema.Array(BrowserSelectorResult),
  candidates: Schema.Array(BrowserElementProbe),
});
export interface BrowserProbeResult extends Schema.Schema.Type<
  typeof BrowserProbeResult
> {}

const BrowserLayoutMeasurement = Schema.Struct({
  width: CssPixels,
  height: CssPixels,
  values: Schema.Array(Schema.Finite),
});

export const BrowserLayoutFingerprint = Schema.Struct({
  first: BrowserLayoutMeasurement,
  second: BrowserLayoutMeasurement,
});
export interface BrowserLayoutFingerprint extends Schema.Schema.Type<
  typeof BrowserLayoutFingerprint
> {}

export const RenderedInspectionEvidence = Schema.Struct({
  findingId: Schema.NonEmptyString,
  png: Schema.Uint8Array,
  crop: Rect,
  pngWidth: SchemaRules.PositiveInteger,
  pngHeight: SchemaRules.PositiveInteger,
});
export interface RenderedInspectionEvidence extends Schema.Schema.Type<
  typeof RenderedInspectionEvidence
> {}

export const RenderedInspectionArtifacts = Schema.Struct({
  overview: Schema.Uint8Array,
  evidence: Schema.Array(RenderedInspectionEvidence),
});
export interface RenderedInspectionArtifacts extends Schema.Schema.Type<
  typeof RenderedInspectionArtifacts
> {}

export const Nodes = Schema.Array(Node);
export type Nodes = Schema.Schema.Type<typeof Nodes>;

export const Checks = Schema.Array(CheckResult);
export type Checks = Schema.Schema.Type<typeof Checks>;

const InspectionRelativePath = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (value) => {
      const normalized = value.replaceAll("\\", "/");
      return (
        normalized === value &&
        !normalized.startsWith("/") &&
        !/^[a-z]:\//iu.test(normalized) &&
        normalized
          .split("/")
          .every(
            (part) =>
              part !== "" &&
              part !== "." &&
              part !== ".." &&
              /^[a-z0-9._-]+$/iu.test(part),
          )
      );
    },
    { expected: "a safe relative inspection path" },
  ),
);

export const ArtifactFile = Schema.Struct({
  path: InspectionRelativePath,
  content: Schema.Uint8Array,
});
export interface ArtifactFile extends Schema.Schema.Type<typeof ArtifactFile> {}

export const ArtifactFiles = Schema.Array(ArtifactFile);
export type ArtifactFiles = Schema.Schema.Type<typeof ArtifactFiles>;

export const EvidenceImage = Schema.Struct({
  path: Schema.Literal("evidence.png"),
  crop: Rect,
  pngWidth: SchemaRules.PositiveInteger,
  pngHeight: SchemaRules.PositiveInteger,
});
export interface EvidenceImage extends Schema.Schema.Type<
  typeof EvidenceImage
> {}

export const FindingFile = Schema.Struct({
  finding: Finding,
  evidenceImage: Schema.optionalKey(EvidenceImage),
});
export interface FindingFile extends Schema.Schema.Type<typeof FindingFile> {}

export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  target: Target,
  scopeNodeId: Schema.optionalKey(Schema.NonEmptyString),
  files: Schema.Struct({
    capture: Schema.Literal("capture.json"),
    nodes: Schema.Literal("nodes.json"),
    checks: Schema.Literal("checks.json"),
    overview: Schema.Literal("overview.png"),
  }),
  findings: Schema.Array(
    Schema.Struct({
      id: Schema.NonEmptyString,
      path: InspectionRelativePath,
    }),
  ),
});
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const DefaultDefinition: Definition = Object.freeze({});
