import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Inspection from "./inspection";
import type { PreviewViewportHeight } from "./preview-metadata";

export const ComputedStyles = [
  "display",
  "position",
  "box-sizing",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "overflow-x",
  "overflow-y",
  "visibility",
  "opacity",
  "z-index",
  "transform",
  "clip-path",
  "pointer-events",
  "content-visibility",
] as const;

const NumberArray = Schema.Array(Schema.Finite);
const RareBooleanData = Schema.Struct({ index: NumberArray });
const RareIntegerData = Schema.Struct({
  index: NumberArray,
  value: NumberArray,
});
const RareStringData = RareIntegerData;

const SnapshotNodes = Schema.Struct({
  parentIndex: Schema.optionalKey(NumberArray),
  nodeType: Schema.optionalKey(NumberArray),
  nodeName: Schema.optionalKey(NumberArray),
  backendNodeId: Schema.optionalKey(NumberArray),
  attributes: Schema.optionalKey(Schema.Array(NumberArray)),
  shadowRootType: Schema.optionalKey(RareStringData),
  contentDocumentIndex: Schema.optionalKey(RareIntegerData),
  isClickable: Schema.optionalKey(RareBooleanData),
});

const SnapshotLayout = Schema.Struct({
  nodeIndex: NumberArray,
  styles: Schema.Array(NumberArray),
  bounds: Schema.Array(NumberArray),
  stackingContexts: RareBooleanData,
  paintOrders: Schema.optionalKey(NumberArray),
  offsetRects: Schema.optionalKey(Schema.Array(NumberArray)),
  scrollRects: Schema.optionalKey(Schema.Array(NumberArray)),
  clientRects: Schema.optionalKey(Schema.Array(NumberArray)),
});

const SnapshotDocument = Schema.Struct({
  nodes: SnapshotNodes,
  layout: SnapshotLayout,
  scrollOffsetX: Schema.optionalKey(Schema.Finite),
  scrollOffsetY: Schema.optionalKey(Schema.Finite),
  contentWidth: Schema.optionalKey(Schema.Finite),
  contentHeight: Schema.optionalKey(Schema.Finite),
});

const Snapshot = Schema.Struct({
  documents: Schema.Array(SnapshotDocument).check(Schema.isMinLength(1)),
  strings: Schema.Array(Schema.String),
});

interface InspectionViewport {
  readonly name: string;
  readonly width: number;
  readonly height: PreviewViewportHeight;
  readonly layoutHeight: number;
  readonly deviceScaleFactor: number;
}

export interface AnalysisInput {
  readonly source: string;
  readonly state: string;
  readonly variant?: string;
  readonly viewport: InspectionViewport;
  readonly definition: Inspection.Definition;
  readonly snapshot: unknown;
  readonly probes: unknown;
  readonly pngWidth: number;
  readonly pngHeight: number;
  readonly screenshotScale: "css" | "device";
  readonly unstable: boolean;
}

export interface AnalysisResult {
  readonly target: Inspection.Target;
  readonly capture: Inspection.Capture;
  readonly scopeNodeId?: string;
  readonly nodes: Inspection.Nodes;
  readonly checks: Inspection.Checks;
  readonly findings: ReadonlyArray<Inspection.Finding>;
  readonly declarationFailures: number;
  readonly checkFailures: number;
}

const finite = (value: number | undefined, fallback = 0): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

const nonNegative = (value: number | undefined, fallback = 0): number =>
  Math.max(0, finite(value, fallback));

const rectFrom = (
  values: ReadonlyArray<number> | undefined,
  offset: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): Inspection.Rect | undefined => {
  const [x, y, width, height] = values ?? [];
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    ![x, y, width, height].every(Number.isFinite)
  ) {
    return undefined;
  }
  return Inspection.Rect.make({
    x: x + offset.x,
    y: y + offset.y,
    width: Math.max(0, width),
    height: Math.max(0, height),
  });
};

const shiftRect = (
  value: Inspection.BrowserRect,
  offset: { readonly x: number; readonly y: number },
): Inspection.Rect =>
  Inspection.Rect.make({
    x: value.x + offset.x,
    y: value.y + offset.y,
    width: Math.max(0, value.width),
    height: Math.max(0, value.height),
  });

const cssNumber = (styles: Readonly<Record<string, string>>, name: string) => {
  const parsed = Number.parseFloat(styles[name] ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

const inset = (
  value: Inspection.Rect,
  top: number,
  right: number,
  bottom: number,
  left: number,
): Inspection.Rect =>
  Inspection.Rect.make({
    x: value.x + left,
    y: value.y + top,
    width: Math.max(0, value.width - left - right),
    height: Math.max(0, value.height - top - bottom),
  });

const outset = (
  value: Inspection.Rect,
  top: number,
  right: number,
  bottom: number,
  left: number,
): Inspection.Rect =>
  Inspection.Rect.make({
    x: value.x - left,
    y: value.y - top,
    width: Math.max(0, value.width + left + right),
    height: Math.max(0, value.height + top + bottom),
  });

const boxFrom = (
  border: Inspection.Rect,
  styles: Readonly<Record<string, string>>,
  client?: Inspection.Rect,
  scroll?: Inspection.Rect,
): Inspection.Box => {
  const padding = inset(
    border,
    cssNumber(styles, "border-top-width"),
    cssNumber(styles, "border-right-width"),
    cssNumber(styles, "border-bottom-width"),
    cssNumber(styles, "border-left-width"),
  );
  const content = inset(
    padding,
    cssNumber(styles, "padding-top"),
    cssNumber(styles, "padding-right"),
    cssNumber(styles, "padding-bottom"),
    cssNumber(styles, "padding-left"),
  );
  const margin = outset(
    border,
    cssNumber(styles, "margin-top"),
    cssNumber(styles, "margin-right"),
    cssNumber(styles, "margin-bottom"),
    cssNumber(styles, "margin-left"),
  );
  return Inspection.Box.make({
    border,
    padding,
    content,
    margin,
    ...(client === undefined ? {} : { client }),
    ...(scroll === undefined ? {} : { scroll }),
  });
};

const intersection = (
  first: Inspection.Rect,
  second: Inspection.Rect,
): Inspection.Rect => {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  return Inspection.Rect.make({
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  });
};

const contains = (
  container: Inspection.Rect,
  value: Inspection.Rect,
  tolerance = 0.5,
): boolean =>
  value.x >= container.x - tolerance &&
  value.y >= container.y - tolerance &&
  value.x + value.width <= container.x + container.width + tolerance &&
  value.y + value.height <= container.y + container.height + tolerance;

const centerInside = (
  value: Inspection.Rect,
  container: Inspection.Rect,
): boolean => {
  const x = value.x + value.width / 2;
  const y = value.y + value.height / 2;
  return (
    x >= container.x &&
    x <= container.x + container.width &&
    y >= container.y &&
    y <= container.y + container.height
  );
};

const rectDistance = (
  first: Inspection.Rect,
  second: Inspection.Rect,
): number =>
  Math.abs(first.x - second.x) +
  Math.abs(first.y - second.y) +
  Math.abs(first.width - second.width) +
  Math.abs(first.height - second.height);

const rareValues = (
  data:
    | {
        readonly index: ReadonlyArray<number>;
        readonly value: ReadonlyArray<number>;
      }
    | undefined,
): ReadonlyMap<number, number> => {
  const values = new Map<number, number>();
  if (data === undefined) return values;
  for (let index = 0; index < data.index.length; index += 1) {
    const key = data.index[index];
    const value = data.value[index];
    if (key !== undefined && value !== undefined) values.set(key, value);
  }
  return values;
};

const rareIndexes = (
  data: { readonly index: ReadonlyArray<number> } | undefined,
): ReadonlySet<number> => new Set(data?.index ?? []);

const safeString = (
  strings: ReadonlyArray<string>,
  index: number | undefined,
): string =>
  index === undefined || !Number.isSafeInteger(index)
    ? ""
    : (strings[index] ?? "");

const attributesAt = (
  strings: ReadonlyArray<string>,
  attributes: ReadonlyArray<number> | undefined,
): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  if (attributes === undefined) return result;
  for (let index = 0; index < attributes.length; index += 2) {
    const name = safeString(strings, attributes[index]);
    const value = safeString(strings, attributes[index + 1]);
    if (name.length > 0) result[name] = value;
  }
  return result;
};

const safeLabel = (
  tag: string,
  attributes: Readonly<Record<string, string>>,
): string => {
  const id = attributes.id;
  if (id !== undefined && id.length > 0) return `${tag}#${id}`;
  const testId = attributes["data-testid"];
  if (testId !== undefined && testId.length > 0) {
    return `${tag}[data-testid=${JSON.stringify(testId)}]`;
  }
  const role = attributes.role;
  if (role !== undefined && role.length > 0) return `${tag}[role=${role}]`;
  const className = attributes.class;
  if (className !== undefined && className.length > 0) {
    const first = className.trim().split(/\s+/u)[0];
    if (first !== undefined && first.length > 0) return `${tag}.${first}`;
  }
  return tag;
};

const isInteractive = (
  tag: string,
  attributes: Readonly<Record<string, string>>,
  clickable: boolean,
): boolean =>
  clickable ||
  ["a", "button", "input", "select", "summary", "textarea"].includes(tag) ||
  ["button", "link"].includes(attributes.role ?? "") ||
  attributes.tabindex !== undefined ||
  attributes.contenteditable !== undefined;

interface NormalizedSnapshot {
  readonly nodes: ReadonlyArray<Inspection.Node>;
  readonly capture: Inspection.Capture;
}

const normalizeSnapshot = (
  snapshot: typeof Snapshot.Type,
  input: AnalysisInput,
): NormalizedSnapshot => {
  const { documents, strings } = snapshot;
  const offsets: Array<{ x: number; y: number } | undefined> = documents.map(
    (_, index) => (index === 0 ? { x: 0, y: 0 } : undefined),
  );

  for (let pass = 0; pass < documents.length; pass += 1) {
    for (
      let documentIndex = 0;
      documentIndex < documents.length;
      documentIndex += 1
    ) {
      const document = documents[documentIndex];
      const parentOffset = offsets[documentIndex];
      if (document === undefined || parentOffset === undefined) continue;
      const childDocuments = rareValues(document.nodes.contentDocumentIndex);
      const layoutByNode = new Map<number, number>();
      for (
        let layoutIndex = 0;
        layoutIndex < document.layout.nodeIndex.length;
        layoutIndex += 1
      ) {
        const nodeIndex = document.layout.nodeIndex[layoutIndex];
        if (nodeIndex !== undefined) layoutByNode.set(nodeIndex, layoutIndex);
      }
      for (const [nodeIndex, childIndex] of childDocuments) {
        if (
          !Number.isSafeInteger(childIndex) ||
          offsets[childIndex] !== undefined
        )
          continue;
        const layoutIndex = layoutByNode.get(nodeIndex);
        const owner = rectFrom(
          layoutIndex === undefined
            ? undefined
            : document.layout.bounds[layoutIndex],
          parentOffset,
        );
        const child = documents[childIndex];
        if (owner !== undefined && child !== undefined) {
          offsets[childIndex] = {
            x: owner.x - finite(child.scrollOffsetX),
            y: owner.y - finite(child.scrollOffsetY),
          };
        }
      }
    }
  }

  const nodes: Array<Inspection.Node> = [];
  let order = 0;
  for (
    let documentIndex = 0;
    documentIndex < documents.length;
    documentIndex += 1
  ) {
    const document = documents[documentIndex];
    if (document === undefined) continue;
    const offset = offsets[documentIndex] ?? { x: 0, y: 0 };
    const layoutByNode = new Map<number, number>();
    for (
      let layoutIndex = 0;
      layoutIndex < document.layout.nodeIndex.length;
      layoutIndex += 1
    ) {
      const nodeIndex = document.layout.nodeIndex[layoutIndex];
      if (nodeIndex !== undefined) layoutByNode.set(nodeIndex, layoutIndex);
    }
    const clickable = rareIndexes(document.nodes.isClickable);
    const stacking = rareIndexes(document.layout.stackingContexts);
    const nodeCount = Math.max(
      document.nodes.nodeType?.length ?? 0,
      document.nodes.nodeName?.length ?? 0,
      document.nodes.parentIndex?.length ?? 0,
    );
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
      if (document.nodes.nodeType?.[nodeIndex] !== 1) continue;
      const tag = safeString(
        strings,
        document.nodes.nodeName?.[nodeIndex],
      ).toLowerCase();
      if (tag.length === 0) continue;
      const attributes = attributesAt(
        strings,
        document.nodes.attributes?.[nodeIndex],
      );
      const layoutIndex = layoutByNode.get(nodeIndex);
      const border = rectFrom(
        layoutIndex === undefined
          ? undefined
          : document.layout.bounds[layoutIndex],
        offset,
      );
      const styles: Record<string, string> = {};
      if (layoutIndex !== undefined) {
        const styleValues = document.layout.styles[layoutIndex] ?? [];
        for (
          let styleIndex = 0;
          styleIndex < ComputedStyles.length;
          styleIndex += 1
        ) {
          const name = ComputedStyles[styleIndex];
          if (name !== undefined)
            styles[name] = safeString(strings, styleValues[styleIndex]);
        }
      }
      const client = rectFrom(
        layoutIndex === undefined
          ? undefined
          : document.layout.clientRects?.[layoutIndex],
        offset,
      );
      const scroll = rectFrom(
        layoutIndex === undefined
          ? undefined
          : document.layout.scrollRects?.[layoutIndex],
        offset,
      );
      const parentIndex = document.nodes.parentIndex?.[nodeIndex];
      const opacity = Number.parseFloat(styles.opacity ?? "1");
      nodes.push(
        Inspection.Node.make({
          id: `d${documentIndex}:n${nodeIndex}`,
          ...(parentIndex === undefined || parentIndex < 0
            ? {}
            : { parentId: `d${documentIndex}:n${parentIndex}` }),
          documentIndex,
          order,
          tag,
          label: safeLabel(tag, attributes),
          ...(border === undefined
            ? {}
            : { box: boxFrom(border, styles, client, scroll) }),
          ...(layoutIndex === undefined ||
          document.layout.paintOrders?.[layoutIndex] === undefined
            ? {}
            : {
                paintOrder: nonNegative(
                  document.layout.paintOrders[layoutIndex],
                ),
              }),
          stackingContext:
            layoutIndex !== undefined && stacking.has(layoutIndex),
          interactive: isInteractive(tag, attributes, clickable.has(nodeIndex)),
          hidden:
            border === undefined ||
            styles.display === "none" ||
            styles.visibility === "hidden" ||
            (Number.isFinite(opacity) && opacity <= 0.01) ||
            border.width <= 0 ||
            border.height <= 0,
          styles,
        }),
      );
      order += 1;
    }
  }

  const main = documents[0];
  const scrollX = finite(main?.scrollOffsetX);
  const scrollY = finite(main?.scrollOffsetY);
  const fullPage = typeof input.viewport.height === "string";
  const documentWidth = Math.max(
    input.viewport.width,
    nonNegative(main?.contentWidth, input.viewport.width),
  );
  const documentHeight = Math.max(
    input.viewport.layoutHeight,
    nonNegative(main?.contentHeight, input.viewport.layoutHeight),
  );
  const captureRect = Inspection.Rect.make(
    fullPage
      ? { x: 0, y: 0, width: documentWidth, height: documentHeight }
      : {
          x: scrollX,
          y: scrollY,
          width: input.viewport.width,
          height: input.viewport.layoutHeight,
        },
  );
  return {
    nodes,
    capture: {
      rect: captureRect,
      document: Inspection.Rect.make({
        x: 0,
        y: 0,
        width: documentWidth,
        height: documentHeight,
      }),
      layoutViewport: Inspection.Rect.make({
        x: scrollX,
        y: scrollY,
        width: input.viewport.width,
        height: input.viewport.layoutHeight,
      }),
      deviceScaleFactor: input.viewport.deviceScaleFactor,
      pngWidth: input.pngWidth,
      pngHeight: input.pngHeight,
      scale: input.screenshotScale,
      fullPage,
    },
  };
};

interface ResolvedElement {
  readonly name?: string;
  readonly nodeId?: string;
  readonly probe: Inspection.BrowserElementProbe;
  readonly border: Inspection.Rect;
  readonly box: Inspection.Box;
  readonly clip: Inspection.Rect;
}

const shiftedElement = (
  probe: Inspection.BrowserElementProbe,
  offset: { readonly x: number; readonly y: number },
  name?: string,
): ResolvedElement => {
  const border = shiftRect(probe.rect, offset);
  return {
    ...(name === undefined ? {} : { name }),
    probe,
    border,
    clip: shiftRect(probe.clip, offset),
    box: Inspection.Box.make({
      border,
      content: shiftRect(probe.content, offset),
      padding: shiftRect(probe.padding, offset),
      margin: shiftRect(probe.margin, offset),
      client: shiftRect(probe.client, offset),
      scroll: shiftRect(probe.scroll, offset),
    }),
  };
};

const paintedArea = (
  element: ResolvedElement,
  capture: Inspection.Rect,
): Inspection.Rect =>
  intersection(intersection(element.border, element.clip), capture);

const matchNode = (
  element: ResolvedElement,
  nodes: ReadonlyArray<Inspection.Node>,
  usedNodeIds: ReadonlySet<string>,
): string | undefined => {
  let best: { readonly id: string; readonly distance: number } | undefined;
  for (const node of nodes) {
    if (
      node.documentIndex !== 0 ||
      node.tag !== element.probe.tag ||
      node.box === undefined ||
      usedNodeIds.has(node.id)
    )
      continue;
    const distance = rectDistance(node.box.border, element.border);
    if (best === undefined || distance < best.distance)
      best = { id: node.id, distance };
  }
  return best !== undefined && best.distance <= 4 ? best.id : undefined;
};

const matchNodes = (
  elements: ReadonlyArray<ResolvedElement>,
  nodes: ReadonlyArray<Inspection.Node>,
): ReadonlyMap<number, string> => {
  const nodeIds = new Map<number, string>();
  const usedNodeIds = new Set<string>();
  for (const element of elements) {
    if (nodeIds.has(element.probe.elementId)) continue;
    const nodeId = matchNode(element, nodes, usedNodeIds);
    if (nodeId === undefined) continue;
    nodeIds.set(element.probe.elementId, nodeId);
    usedNodeIds.add(nodeId);
  }
  return nodeIds;
};

const withNodeId = (
  element: ResolvedElement,
  nodeIds: ReadonlyMap<number, string>,
): ResolvedElement => {
  const nodeId = nodeIds.get(element.probe.elementId);
  return {
    ...element,
    ...(nodeId === undefined ? {} : { nodeId }),
  };
};

const isAncestor = (
  ancestorId: string,
  descendantId: string,
  nodes: ReadonlyMap<string, Inspection.Node>,
): boolean => {
  const visited = new Set<string>();
  let parentId = nodes.get(descendantId)?.parentId;
  while (parentId !== undefined && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = nodes.get(parentId)?.parentId;
  }
  return false;
};

const finding = (input: {
  readonly id: string;
  readonly source: "declaration" | "check" | "hint";
  readonly rule: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly elements?: ReadonlyArray<ResolvedElement>;
  readonly rects?: ReadonlyArray<Inspection.Rect>;
  readonly detail?: string;
  readonly hitRatio?: number;
}): Inspection.Finding =>
  Inspection.Finding.make({
    id: input.id,
    source: input.source,
    rule: input.rule,
    severity: input.severity,
    message: input.message,
    evidence: Inspection.Evidence.make({
      nodeIds: (input.elements ?? []).flatMap(({ nodeId }) =>
        nodeId === undefined ? [] : [nodeId],
      ),
      rects: input.rects ?? (input.elements ?? []).map(({ border }) => border),
      ...(input.detail === undefined ? {} : { detail: input.detail }),
      ...(input.hitRatio === undefined ? {} : { hitRatio: input.hitRatio }),
    }),
  });

export const analyze = Effect.fn("Inspection.analyze")(function* (
  input: AnalysisInput,
) {
  const snapshot = yield* Schema.decodeUnknownEffect(Snapshot)(input.snapshot);
  const probes = yield* Schema.decodeUnknownEffect(
    Inspection.BrowserProbeResult,
  )(input.probes);
  const normalized = normalizeSnapshot(snapshot, input);
  const mainScroll = {
    x: normalized.capture.layoutViewport.x,
    y: normalized.capture.layoutViewport.y,
  };
  const findings: Array<Inspection.Finding> = [];
  let declarationFailures = 0;

  const scopeResult = probes.scope;
  let scope: ResolvedElement | undefined;
  if (scopeResult.error !== undefined || scopeResult.matches.length !== 1) {
    if (input.definition.scope !== undefined) {
      declarationFailures += 1;
      findings.push(
        finding({
          id: "declaration.scope",
          source: "declaration",
          rule: "scope",
          severity: "error",
          message:
            scopeResult.error === undefined
              ? `Inspection scope ${JSON.stringify(scopeResult.selector)} matched ${scopeResult.matches.length} elements; expected one.`
              : `Inspection scope ${JSON.stringify(scopeResult.selector)} is invalid.`,
          ...(scopeResult.error === undefined
            ? {}
            : { detail: scopeResult.error }),
        }),
      );
    }
  } else {
    const scopeProbe = scopeResult.matches[0];
    if (scopeProbe !== undefined) {
      scope = shiftedElement(scopeProbe, mainScroll);
    }
  }

  const resolved = new Map<string, ResolvedElement>();
  for (const [name, result] of Object.entries(probes.elements).toSorted(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (result.error !== undefined || result.matches.length !== 1) {
      declarationFailures += 1;
      findings.push(
        finding({
          id: `declaration.element.${name}`,
          source: "declaration",
          rule: "element",
          severity: "error",
          message:
            result.error === undefined
              ? `Inspection element ${JSON.stringify(name)} matched ${result.matches.length} elements; expected one.`
              : `Inspection element ${JSON.stringify(name)} has an invalid selector.`,
          ...(result.error === undefined ? {} : { detail: result.error }),
        }),
      );
      continue;
    }
    const elementProbe = result.matches[0];
    if (elementProbe === undefined) continue;
    const element = shiftedElement(elementProbe, mainScroll, name);
    resolved.set(name, element);
  }

  const ignored: Array<Inspection.Rect> = [];
  for (let index = 0; index < probes.ignored.length; index += 1) {
    const result = probes.ignored[index];
    if (result === undefined) continue;
    if (result.error !== undefined) {
      declarationFailures += 1;
      findings.push(
        finding({
          id: `declaration.ignore.${index + 1}`,
          source: "declaration",
          rule: "ignore",
          severity: "error",
          message: `Inspection ignore selector ${JSON.stringify(result.selector)} is invalid.`,
          detail: result.error,
        }),
      );
    } else {
      ignored.push(
        ...result.matches.map((probe) => shiftRect(probe.rect, mainScroll)),
      );
    }
  }

  const candidateElementsForMatching = probes.candidates.map((probe) =>
    shiftedElement(probe, mainScroll),
  );
  const nodeIds = matchNodes(
    [
      ...candidateElementsForMatching,
      ...(scope === undefined ? [] : [scope]),
      ...resolved.values(),
    ],
    normalized.nodes,
  );
  if (scope !== undefined) scope = withNodeId(scope, nodeIds);
  for (const [name, element] of resolved) {
    resolved.set(name, withNodeId(element, nodeIds));
  }

  const checkResults: Array<Inspection.CheckResult> = [];
  let checkFailures = 0;
  for (const [name, check] of Object.entries(
    input.definition.checks ?? {},
  ).toSorted(([left], [right]) => left.localeCompare(right))) {
    const elementNames =
      check.type === "no-overlap"
        ? [check.first.name, check.second.name]
        : check.type === "inside" && check.container.type === "element"
          ? [check.element.name, check.container.name]
          : [check.element.name];
    const missing = elementNames.filter(
      (elementName) => !resolved.has(elementName),
    );
    if (missing.length > 0) {
      checkFailures += 1;
      const findingId = `check.${name}`;
      const message = `Check ${JSON.stringify(name)} could not run because ${missing.map((value) => JSON.stringify(value)).join(", ")} did not resolve.`;
      findings.push(
        finding({
          id: findingId,
          source: "check",
          rule: check.type,
          severity: "error",
          message,
        }),
      );
      checkResults.push(
        Inspection.CheckResult.make({
          name,
          status: "unresolved",
          message,
          findingId,
        }),
      );
      continue;
    }

    const primary = resolved.get(elementNames[0] ?? "");
    if (primary === undefined) continue;
    const tolerance = "tolerance" in check ? (check.tolerance ?? 0.5) : 0.5;
    let passed = false;
    let message = "";
    let evidence: ReadonlyArray<ResolvedElement> = [primary];
    switch (check.type) {
      case "visible": {
        const visibleArea = paintedArea(primary, normalized.capture.rect);
        passed =
          !primary.probe.hidden &&
          visibleArea.width > 0.5 &&
          visibleArea.height > 0.5;
        message = passed
          ? `${primary.name} is visible in the capture.`
          : `${primary.name} is not visible in the capture.`;
        break;
      }
      case "inside": {
        const container =
          check.container.type === "viewport"
            ? normalized.capture.layoutViewport
            : resolved.get(check.container.name)?.box.padding;
        passed =
          container !== undefined &&
          contains(container, primary.border, tolerance);
        message = passed
          ? `${primary.name} is inside ${check.container.type === "viewport" ? "the viewport" : check.container.name}.`
          : `${primary.name} is outside ${check.container.type === "viewport" ? "the viewport" : check.container.name}.`;
        if (check.container.type === "element") {
          const containerElement = resolved.get(check.container.name);
          if (containerElement !== undefined)
            evidence = [primary, containerElement];
        }
        break;
      }
      case "no-overlap": {
        const second = resolved.get(check.second.name);
        if (second !== undefined) {
          evidence = [primary, second];
          const overlap = intersection(primary.border, second.border);
          passed = overlap.width <= tolerance || overlap.height <= tolerance;
        }
        message = passed
          ? `${check.first.name} and ${check.second.name} do not overlap.`
          : `${check.first.name} and ${check.second.name} overlap.`;
        break;
      }
      case "min-size": {
        passed =
          (check.width === undefined ||
            primary.border.width + 0.5 >= check.width) &&
          (check.height === undefined ||
            primary.border.height + 0.5 >= check.height);
        message = passed
          ? `${primary.name} meets its minimum size.`
          : `${primary.name} is smaller than its minimum size.`;
        break;
      }
      case "content-fits": {
        const client = primary.box.client;
        const scroll = primary.box.scroll;
        const axis = check.axis ?? "both";
        passed =
          client !== undefined &&
          scroll !== undefined &&
          (axis === "y" || scroll.width <= client.width + tolerance) &&
          (axis === "x" || scroll.height <= client.height + tolerance);
        message = passed
          ? `${primary.name} content fits its client box.`
          : `${primary.name} content overflows its client box.`;
        break;
      }
      case "not-clipped": {
        passed = contains(
          intersection(primary.clip, normalized.capture.rect),
          primary.border,
          tolerance,
        );
        message = passed
          ? `${primary.name} is not clipped.`
          : `${primary.name} is clipped by an ancestor or the viewport.`;
        break;
      }
      case "unobscured": {
        const minimumRatio = check.minimumRatio ?? 1;
        passed = primary.probe.hitRatio >= minimumRatio;
        message = passed
          ? `${primary.name} is unobscured at its hit-test samples.`
          : `${primary.name} is obscured at some hit-test samples.`;
        break;
      }
    }

    if (passed) {
      checkResults.push(
        Inspection.CheckResult.make({ name, status: "passed", message }),
      );
    } else {
      checkFailures += 1;
      const findingId = `check.${name}`;
      findings.push(
        finding({
          id: findingId,
          source: "check",
          rule: check.type,
          severity: "error",
          message,
          elements: evidence,
          ...(check.type === "unobscured"
            ? { hitRatio: primary.probe.hitRatio }
            : {}),
        }),
      );
      checkResults.push(
        Inspection.CheckResult.make({
          name,
          status: "failed",
          message,
          findingId,
        }),
      );
    }
  }

  const scopeRect =
    input.definition.scope === undefined
      ? normalized.capture.document
      : (scope?.border ?? normalized.capture.document);
  const resolvedElements = [...resolved.values()];
  const resolvedByElementId = new Map(
    resolvedElements.map((element) => [element.probe.elementId, element]),
  );
  const candidates: Array<ResolvedElement> = candidateElementsForMatching
    .map((element) => {
      const matched = withNodeId(element, nodeIds);
      const named = resolvedByElementId.get(element.probe.elementId);
      return {
        ...matched,
        ...(named?.name === undefined ? {} : { name: named.name }),
      };
    })
    .filter(
      (candidate) =>
        centerInside(candidate.border, scopeRect) &&
        !ignored.some((ignoredRect) =>
          centerInside(candidate.border, ignoredRect),
        ),
    );
  for (const element of resolvedElements) {
    if (
      candidates.some(({ name }) => name === element.name) ||
      !centerInside(element.border, scopeRect) ||
      ignored.some((ignoredRect) => centerInside(element.border, ignoredRect))
    ) {
      continue;
    }
    candidates.push(element);
  }
  const namedNodeIds = new Set(
    [...resolved.values()].flatMap(({ nodeId }) =>
      nodeId === undefined ? [] : [nodeId],
    ),
  );
  const meaningful = candidates.filter(
    ({ name, nodeId, probe }) =>
      probe.interactive ||
      name !== undefined ||
      (nodeId !== undefined && namedNodeIds.has(nodeId)),
  );

  if (
    normalized.capture.document.width >
    normalized.capture.layoutViewport.width + 1
  ) {
    findings.push(
      finding({
        id: "hint.horizontal-overflow",
        source: "hint",
        rule: "horizontal-overflow",
        severity: "warning",
        message: `Document content is ${Math.round(normalized.capture.document.width - normalized.capture.layoutViewport.width)} CSS px wider than the layout viewport.`,
        rects: [
          Inspection.Rect.make({
            x:
              normalized.capture.layoutViewport.x +
              normalized.capture.layoutViewport.width,
            y: normalized.capture.document.y,
            width:
              normalized.capture.document.width -
              normalized.capture.layoutViewport.width,
            height: normalized.capture.document.height,
          }),
        ],
      }),
    );
  }

  const seenHint = new Set<string>();
  const hintKey = (rule: string, element: ResolvedElement): string =>
    `${rule}.${element.nodeId ?? `probe.${element.probe.elementId}`}`;
  for (const element of candidates) {
    const named =
      element.name !== undefined ||
      (element.nodeId !== undefined && namedNodeIds.has(element.nodeId));
    const overflowX = element.probe.styles.overflowX;
    const overflowY = element.probe.styles.overflowY;
    const clippedX =
      element.probe.scroll.width > element.probe.client.width + 1 &&
      (overflowX === "hidden" || overflowX === "clip");
    const clippedY =
      element.probe.scroll.height > element.probe.client.height + 1 &&
      (overflowY === "hidden" || overflowY === "clip");
    if (clippedX || clippedY) {
      const id = hintKey("clipped-content", element);
      if (!seenHint.has(id)) {
        seenHint.add(id);
        findings.push(
          finding({
            id: `hint.${id}`,
            source: "hint",
            rule: "clipped-content",
            severity: "warning",
            message: `${element.probe.tag} clips content on ${clippedX && clippedY ? "both axes" : clippedX ? "the x axis" : "the y axis"}.`,
            elements: [element],
          }),
        );
      }
    }
    if (!element.probe.interactive && !named) {
      continue;
    }
    if (element.probe.hidden) {
      const id = hintKey("invisible-target", element);
      findings.push(
        finding({
          id: `hint.${id}`,
          source: "hint",
          rule: "invisible-target",
          severity: "warning",
          message: `${element.name ?? element.probe.tag} is hidden or has no visible area.`,
          elements: [element],
        }),
      );
      continue;
    }
    const visible = intersection(element.border, normalized.capture.rect);
    if (visible.width <= 0.5 || visible.height <= 0.5) {
      const id = hintKey("outside-capture", element);
      findings.push(
        finding({
          id: `hint.${id}`,
          source: "hint",
          rule: "outside-capture",
          severity: "warning",
          message: `${element.name ?? element.probe.tag} is outside the captured area.`,
          elements: [element],
        }),
      );
    } else {
      const painted = paintedArea(element, normalized.capture.rect);
      if (painted.width <= 0.5 || painted.height <= 0.5) {
        const id = hintKey("invisible-target", element);
        findings.push(
          finding({
            id: `hint.${id}`,
            source: "hint",
            rule: "invisible-target",
            severity: "warning",
            message: `${element.name ?? element.probe.tag} is hidden or has no visible area.`,
            elements: [element],
          }),
        );
      }
    }
    if (element.probe.hitRatio < 5 / 9) {
      const id = hintKey("occluded-target", element);
      findings.push(
        finding({
          id: `hint.${id}`,
          source: "hint",
          rule: "occluded-target",
          severity: "warning",
          message: `${element.name ?? element.probe.tag} is blocked at most hit-test samples.`,
          elements: [element],
          hitRatio: element.probe.hitRatio,
        }),
      );
    }
  }

  const nodesById = new Map(normalized.nodes.map((node) => [node.id, node]));
  for (let firstIndex = 0; firstIndex < meaningful.length; firstIndex += 1) {
    const first = meaningful[firstIndex];
    if (first === undefined) continue;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < meaningful.length;
      secondIndex += 1
    ) {
      const second = meaningful[secondIndex];
      if (
        second === undefined ||
        first.probe.elementId === second.probe.elementId
      )
        continue;
      const contained =
        contains(first.border, second.border, 0) ||
        contains(second.border, first.border, 0);
      const nested =
        first.nodeId === undefined ||
        second.nodeId === undefined ||
        isAncestor(first.nodeId, second.nodeId, nodesById) ||
        isAncestor(second.nodeId, first.nodeId, nodesById);
      if (contained && nested) continue;
      const overlap = intersection(first.border, second.border);
      if (overlap.width <= 1 || overlap.height <= 1) continue;
      const key = `${first.probe.elementId}.${second.probe.elementId}`;
      findings.push(
        finding({
          id: `hint.possible-overlap.${key}`,
          source: "hint",
          rule: "possible-overlap",
          severity: "warning",
          message: `${first.name ?? first.probe.tag} and ${second.name ?? second.probe.tag} overlap.`,
          elements: [first, second],
          rects: [overlap],
        }),
      );
    }
  }

  if (input.unstable) {
    findings.push(
      finding({
        id: "hint.unstable-after-emit",
        source: "hint",
        rule: "unstable-after-emit",
        severity: "warning",
        message:
          "The document changed after emit() during the capture transaction.",
      }),
    );
  }

  const namedByNode = new Map(
    [...resolved.entries()].flatMap(([name, element]) =>
      element.nodeId === undefined ? [] : [[element.nodeId, name] as const],
    ),
  );
  const nodes = normalized.nodes.map((node) => {
    const name = namedByNode.get(node.id);
    const element = name === undefined ? undefined : resolved.get(name);
    return Inspection.Node.make({
      ...node,
      ...(name === undefined ? {} : { name, label: name }),
      ...(element === undefined ? {} : { box: element.box }),
    });
  });
  return {
    target: Inspection.Target.make({
      source: input.source,
      state: input.state,
      ...(input.variant === undefined ? {} : { variant: input.variant }),
      viewport: input.viewport.name,
    }),
    capture: Inspection.Capture.make(normalized.capture),
    ...(scope?.nodeId === undefined ? {} : { scopeNodeId: scope.nodeId }),
    nodes: Inspection.Nodes.make(nodes),
    checks: Inspection.Checks.make(checkResults),
    findings,
    declarationFailures,
    checkFailures,
  } satisfies AnalysisResult;
});
