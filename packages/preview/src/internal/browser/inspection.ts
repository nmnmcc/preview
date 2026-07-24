import type {
  BrowserElementProbe,
  BrowserLayoutFingerprint,
  BrowserProbeResult,
  BrowserRect,
  BrowserSelectorResult,
  RenderedInspectionArtifacts,
  RenderedInspectionEvidence,
} from "../inspection";

export type {
  BrowserElementProbe,
  BrowserLayoutFingerprint,
  BrowserProbeResult,
  BrowserRect,
  BrowserSelectorResult,
  RenderedInspectionArtifacts,
  RenderedInspectionEvidence,
} from "../inspection";

export interface InspectionPreparationOptions {
  readonly disableAnimations: boolean;
  readonly hideCaret: boolean;
  readonly style?: string;
}

export interface InspectionRenderModel {
  readonly png: Uint8Array;
  readonly capture: {
    readonly rect: BrowserRect;
    readonly pngWidth: number;
    readonly pngHeight: number;
  };
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly name?: string;
    readonly box?: { readonly border: BrowserRect };
  }>;
  readonly findings: ReadonlyArray<{
    readonly id: string;
    readonly severity: "error" | "warning";
    readonly evidence: {
      readonly nodeIds: ReadonlyArray<string>;
      readonly rects: ReadonlyArray<BrowserRect>;
    };
  }>;
}

export const renderInspectionArtifacts = async (
  input: InspectionRenderModel,
): Promise<RenderedInspectionArtifacts> => {
  const capture = input.capture.rect;
  const scaleX = input.capture.pngWidth / capture.width;
  const scaleY = input.capture.pngHeight / capture.height;
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX <= 0 ||
    scaleY <= 0
  ) {
    throw new Error("Inspection capture dimensions are invalid.");
  }

  const png = new Uint8Array(input.png.byteLength);
  png.set(input.png);
  const bitmap = await createImageBitmap(
    new Blob([png.buffer], { type: "image/png" }),
  );
  const toPng = async (canvas: OffscreenCanvas): Promise<Uint8Array> =>
    new Uint8Array(
      await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer(),
    );
  const contextFor = (
    canvas: OffscreenCanvas,
  ): OffscreenCanvasRenderingContext2D => {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Could not create a 2D canvas.");
    return context;
  };
  const intersection = (
    first: BrowserRect,
    second: BrowserRect,
  ): BrowserRect => {
    const x = Math.max(first.x, second.x);
    const y = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const bottom = Math.min(first.y + first.height, second.y + second.height);
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  };
  const union = (
    rects: ReadonlyArray<BrowserRect>,
  ): BrowserRect | undefined => {
    if (rects.length === 0) return undefined;
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const rect of rects) {
      left = Math.min(left, rect.x);
      top = Math.min(top, rect.y);
      right = Math.max(right, rect.x + rect.width);
      bottom = Math.max(bottom, rect.y + rect.height);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const colorFor = (severity: "error" | "warning"): string =>
    severity === "error" ? "#dc2626" : "#d97706";
  const drawRect = (
    context: OffscreenCanvasRenderingContext2D,
    rect: BrowserRect,
    origin: BrowserRect,
    color: string,
    width: number,
  ): void => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.strokeRect(
      (rect.x - origin.x) * scaleX,
      (rect.y - origin.y) * scaleY,
      rect.width * scaleX,
      rect.height * scaleY,
    );
  };

  try {
    const overviewCanvas = new OffscreenCanvas(
      input.capture.pngWidth,
      input.capture.pngHeight,
    );
    const overviewContext = contextFor(overviewCanvas);
    overviewContext.drawImage(bitmap, 0, 0);

    const gridStep = capture.width > 2400 || capture.height > 2400 ? 500 : 100;
    overviewContext.save();
    overviewContext.strokeStyle = "rgba(15, 23, 42, 0.32)";
    overviewContext.fillStyle = "#0f172a";
    overviewContext.lineWidth = Math.max(1, Math.min(scaleX, scaleY));
    overviewContext.font = `${Math.max(10, Math.round(11 * Math.min(scaleX, scaleY)))}px ui-monospace, monospace`;
    overviewContext.textBaseline = "top";
    for (
      let x = Math.ceil(capture.x / gridStep) * gridStep;
      x <= capture.x + capture.width;
      x += gridStep
    ) {
      const pixelX = (x - capture.x) * scaleX;
      overviewContext.beginPath();
      overviewContext.moveTo(pixelX, 0);
      overviewContext.lineTo(pixelX, input.capture.pngHeight);
      overviewContext.stroke();
      overviewContext.fillText(String(x), pixelX + 4, 4);
    }
    for (
      let y = Math.ceil(capture.y / gridStep) * gridStep;
      y <= capture.y + capture.height;
      y += gridStep
    ) {
      const pixelY = (y - capture.y) * scaleY;
      overviewContext.beginPath();
      overviewContext.moveTo(0, pixelY);
      overviewContext.lineTo(input.capture.pngWidth, pixelY);
      overviewContext.stroke();
      overviewContext.fillText(String(y), 4, pixelY + 4);
    }
    overviewContext.restore();

    for (const node of input.nodes) {
      const rect = node.box?.border;
      if (node.name === undefined || rect === undefined) continue;
      const visible = intersection(rect, capture);
      if (visible.width <= 0 || visible.height <= 0) continue;
      drawRect(
        overviewContext,
        rect,
        capture,
        "#2563eb",
        Math.max(2, 2 * Math.min(scaleX, scaleY)),
      );
      const x = (visible.x - capture.x) * scaleX;
      const y = (visible.y - capture.y) * scaleY;
      const fontSize = Math.max(10, Math.round(11 * Math.min(scaleX, scaleY)));
      overviewContext.font = `600 ${fontSize}px ui-monospace, monospace`;
      const labelWidth = overviewContext.measureText(node.name).width + 8;
      overviewContext.fillStyle = "#2563eb";
      overviewContext.fillRect(x, y, labelWidth, fontSize + 6);
      overviewContext.fillStyle = "#ffffff";
      overviewContext.textBaseline = "top";
      overviewContext.fillText(node.name, x + 4, y + 3);
    }

    for (const finding of input.findings) {
      const color = colorFor(finding.severity);
      const rects = [
        ...finding.evidence.rects,
        ...finding.evidence.nodeIds.flatMap((id) => {
          const rect = nodeById.get(id)?.box?.border;
          return rect === undefined ? [] : [rect];
        }),
      ];
      for (const rect of rects) {
        if (intersection(rect, capture).width <= 0) continue;
        drawRect(
          overviewContext,
          rect,
          capture,
          color,
          Math.max(3, 3 * Math.min(scaleX, scaleY)),
        );
      }
    }

    const overview = await toPng(overviewCanvas);
    const evidence: Array<RenderedInspectionEvidence> = [];
    for (const finding of input.findings) {
      const rects = [
        ...finding.evidence.rects,
        ...finding.evidence.nodeIds.flatMap((id) => {
          const rect = nodeById.get(id)?.box?.border;
          return rect === undefined ? [] : [rect];
        }),
      ];
      const bounds = union(rects);
      if (bounds === undefined) continue;
      if (
        !rects.some((rect) => {
          const visible = intersection(rect, capture);
          return visible.width > 0 && visible.height > 0;
        })
      ) {
        continue;
      }
      const padded = {
        x: bounds.x - 32,
        y: bounds.y - 32,
        width: bounds.width + 64,
        height: bounds.height + 64,
      };
      const visible = intersection(padded, capture);
      if (visible.width <= 0 || visible.height <= 0) continue;

      const sourceX = Math.max(0, Math.floor((visible.x - capture.x) * scaleX));
      const sourceY = Math.max(0, Math.floor((visible.y - capture.y) * scaleY));
      const sourceRight = Math.min(
        input.capture.pngWidth,
        Math.ceil((visible.x + visible.width - capture.x) * scaleX),
      );
      const sourceBottom = Math.min(
        input.capture.pngHeight,
        Math.ceil((visible.y + visible.height - capture.y) * scaleY),
      );
      const width = sourceRight - sourceX;
      const height = sourceBottom - sourceY;
      if (width <= 0 || height <= 0) continue;
      const actualCrop = {
        x: capture.x + sourceX / scaleX,
        y: capture.y + sourceY / scaleY,
        width: width / scaleX,
        height: height / scaleY,
      };
      const canvas = new OffscreenCanvas(width, height);
      const context = contextFor(canvas);
      context.drawImage(
        bitmap,
        sourceX,
        sourceY,
        width,
        height,
        0,
        0,
        width,
        height,
      );
      const color = colorFor(finding.severity);
      for (const rect of rects) {
        if (intersection(rect, actualCrop).width <= 0) continue;
        drawRect(
          context,
          rect,
          actualCrop,
          color,
          Math.max(3, 3 * Math.min(scaleX, scaleY)),
        );
      }
      evidence.push({
        findingId: finding.id,
        png: await toPng(canvas),
        crop: actualCrop,
        pngWidth: width,
        pngHeight: height,
      });
    }
    return { overview, evidence };
  } finally {
    bitmap.close();
  }
};

export const prepareForInspection = (
  options: InspectionPreparationOptions,
): void => {
  const stateKey = "__nmnmccPreviewInspectionState";
  const globalRecord = window as unknown as Record<string, unknown>;
  if (globalRecord[stateKey] !== undefined) return;

  const collectRoots = (
    root: Document | ShadowRoot,
    roots: Array<Document | ShadowRoot> = [],
  ): Array<Document | ShadowRoot> => {
    roots.push(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let current: Node | null = walker.currentNode;
    while (current !== null) {
      if (current instanceof Element && current.shadowRoot !== null) {
        collectRoots(current.shadowRoot, roots);
      }
      current = walker.nextNode();
    }
    return roots;
  };

  const roots = collectRoots(document);
  const cleanup: Array<() => void> = [];

  if (options.style !== undefined) {
    for (const root of roots) {
      const style = document.createElement("style");
      style.dataset.nmnmccPreviewInspection = "style";
      style.textContent = options.style;
      if (root === document) document.documentElement.append(style);
      else root.append(style);
      cleanup.push(() => style.remove());
    }
  }

  if (options.hideCaret) {
    const values = new Map<HTMLElement, readonly [string, string]>();
    for (const root of roots) {
      for (const element of root.querySelectorAll<HTMLElement>(
        "input,textarea,[contenteditable]",
      )) {
        values.set(element, [
          element.style.getPropertyValue("caret-color"),
          element.style.getPropertyPriority("caret-color"),
        ]);
        element.style.setProperty("caret-color", "transparent", "important");
      }
    }
    cleanup.push(() => {
      for (const [element, [value, priority]] of values) {
        if (value.length === 0) element.style.removeProperty("caret-color");
        else element.style.setProperty("caret-color", value, priority);
      }
    });
  }

  if (options.disableAnimations) {
    const infinite = new Set<Animation>();
    const finishAnimations = (root: Document | ShadowRoot) => {
      for (const animation of root.getAnimations()) {
        if (animation.effect === null || animation.playbackRate === 0) continue;
        const endTime = animation.effect.getComputedTiming().endTime;
        try {
          if (Number.isFinite(endTime)) animation.finish();
          else {
            animation.cancel();
            infinite.add(animation);
          }
        } catch {
          // The browser can refuse to finish an animation without a target.
        }
      }
    };
    for (const root of roots) {
      const listener = () => finishAnimations(root);
      listener();
      root.addEventListener("animationstart", listener);
      root.addEventListener("transitionrun", listener);
      cleanup.push(() => {
        root.removeEventListener("animationstart", listener);
        root.removeEventListener("transitionrun", listener);
      });
    }
    cleanup.push(() => {
      for (const animation of infinite) {
        try {
          animation.play();
        } catch {
          // A removed animation no longer needs to be restored.
        }
      }
    });
  }

  const mutationObserver = new MutationObserver(() => {
    const state = globalRecord[stateKey];
    if (typeof state === "object" && state !== null) {
      Reflect.set(state, "changed", true);
    }
  });
  mutationObserver.observe(document, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  let receivedInitialResize = false;
  const resizeObserver = new ResizeObserver(() => {
    if (!receivedInitialResize) {
      receivedInitialResize = true;
      return;
    }
    const state = globalRecord[stateKey];
    if (typeof state === "object" && state !== null) {
      Reflect.set(state, "changed", true);
    }
  });
  resizeObserver.observe(document.documentElement);
  cleanup.push(() => mutationObserver.disconnect());
  cleanup.push(() => resizeObserver.disconnect());

  globalRecord[stateKey] = { changed: false, cleanup };
};

export const inspectionPreparationChanged = (): boolean => {
  const value = (window as unknown as Record<string, unknown>)[
    "__nmnmccPreviewInspectionState"
  ];
  return typeof value === "object" && value !== null
    ? Reflect.get(value, "changed") === true
    : false;
};

export const cleanupInspectionPreparation = (): void => {
  const stateKey = "__nmnmccPreviewInspectionState";
  const globalRecord = window as unknown as Record<string, unknown>;
  const value = globalRecord[stateKey];
  if (typeof value !== "object" || value === null) return;
  const callbacks = Reflect.get(value, "cleanup");
  if (Array.isArray(callbacks)) {
    for (const callback of callbacks.toReversed()) {
      if (typeof callback === "function")
        Reflect.apply(callback, undefined, []);
    }
  }
  delete globalRecord[stateKey];
};

export const layoutFingerprint =
  async (): Promise<BrowserLayoutFingerprint> => {
    const measure = () => {
      const values: Array<number> = [];
      const roots: Array<Document | ShadowRoot> = [document];
      for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
        const root = roots[rootIndex];
        if (root === undefined) continue;
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot !== null) roots.push(element.shadowRoot);
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          values.push(rect.x, rect.y, rect.width, rect.height);
        }
      }
      return {
        width: Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth ?? 0,
        ),
        height: Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        ),
        values,
      };
    };

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const first = measure();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const second = measure();
    return { first, second };
  };

interface InspectionSelection {
  readonly selector: string;
  readonly elements: ReadonlyArray<Element>;
  readonly error?: string;
}

interface MeasuredProbe {
  readonly element: Element;
  readonly geometry: Omit<BrowserElementProbe, "selector" | "hitRatio">;
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export const collectInspectionProbes = (input: {
  readonly scope?: string;
  readonly elements?: Readonly<Record<string, string>>;
  readonly ignore?: ReadonlyArray<string>;
  readonly fullPage: boolean;
}): BrowserProbeResult => {
  const rootsInside = (
    container: Document | Element,
  ): Array<Document | ShadowRoot | Element> => {
    const roots: Array<Document | ShadowRoot | Element> = [container];
    if (container instanceof Element && container.shadowRoot !== null) {
      roots.push(container.shadowRoot);
    }
    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];
      if (root === undefined) continue;
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot !== null) roots.push(element.shadowRoot);
      }
    }
    return roots;
  };

  const allMatches = (
    containers: ReadonlyArray<Document | Element>,
    selector: string,
  ): ReadonlyArray<Element> => {
    const matches = new Set<Element>();
    for (const container of containers) {
      if (container instanceof Element && container.matches(selector)) {
        matches.add(container);
      }
      for (const root of rootsInside(container)) {
        for (const element of root.querySelectorAll(selector))
          matches.add(element);
      }
    }
    return [...matches];
  };

  const number = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const rect = (value: DOMRect | BrowserRect): BrowserRect => ({
    x: value.x,
    y: value.y,
    width: Math.max(0, value.width),
    height: Math.max(0, value.height),
  });
  const inset = (
    value: BrowserRect,
    top: number,
    right: number,
    bottom: number,
    left: number,
  ): BrowserRect => ({
    x: value.x + left,
    y: value.y + top,
    width: Math.max(0, value.width - left - right),
    height: Math.max(0, value.height - top - bottom),
  });
  const outset = (
    value: BrowserRect,
    top: number,
    right: number,
    bottom: number,
    left: number,
  ): BrowserRect => ({
    x: value.x - left,
    y: value.y - top,
    width: Math.max(0, value.width + left + right),
    height: Math.max(0, value.height + top + bottom),
  });
  const intersect = (first: BrowserRect, second: BrowserRect): BrowserRect => {
    const x = Math.max(first.x, second.x);
    const y = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const bottom = Math.min(first.y + first.height, second.y + second.height);
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  };
  const clientBox = (element: Element, border: BrowserRect): BrowserRect => ({
    x: border.x + element.clientLeft,
    y: border.y + element.clientTop,
    width: element.clientWidth,
    height: element.clientHeight,
  });
  const deepestAt = (x: number, y: number): Element | null => {
    let found = document.elementFromPoint(x, y);
    while (found?.shadowRoot !== null && found?.shadowRoot !== undefined) {
      const deeper = found.shadowRoot.elementFromPoint(x, y);
      if (deeper === null || deeper === found) break;
      found = deeper;
    }
    return found;
  };
  const composedParent = (value: Element): Element | null => {
    const root = value.getRootNode();
    return (
      value.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
    );
  };
  const composedContains = (
    element: Element,
    candidate: Element | null,
  ): boolean => {
    let current = candidate;
    while (current !== null) {
      if (current === element || element.contains(current)) return true;
      current = composedParent(current);
    }
    return false;
  };
  const measurements = new Map<Element, MeasuredProbe>();
  const elementIds = new Map<Element, number>();
  const elementIdFor = (element: Element): number => {
    const existing = elementIds.get(element);
    if (existing !== undefined) return existing;
    const next = elementIds.size;
    elementIds.set(element, next);
    return next;
  };
  const measure = (element: Element): MeasuredProbe => {
    const existing = measurements.get(element);
    if (existing !== undefined) return existing;
    const style = getComputedStyle(element);
    const border = rect(element.getBoundingClientRect());
    const borderTop = number(style.borderTopWidth);
    const borderRight = number(style.borderRightWidth);
    const borderBottom = number(style.borderBottomWidth);
    const borderLeft = number(style.borderLeftWidth);
    const paddingTop = number(style.paddingTop);
    const paddingRight = number(style.paddingRight);
    const paddingBottom = number(style.paddingBottom);
    const paddingLeft = number(style.paddingLeft);
    const padding = inset(
      border,
      borderTop,
      borderRight,
      borderBottom,
      borderLeft,
    );
    const content = inset(
      padding,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
    );
    const margin = outset(
      border,
      number(style.marginTop),
      number(style.marginRight),
      number(style.marginBottom),
      number(style.marginLeft),
    );
    const client = clientBox(element, border);
    const scroll = {
      x: client.x - element.scrollLeft,
      y: client.y - element.scrollTop,
      width: element.scrollWidth,
      height: element.scrollHeight,
    };
    let clip = border;
    let ancestor: Element | null = composedParent(element);
    while (ancestor !== null) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (
        ancestorStyle.overflowX !== "visible" ||
        ancestorStyle.overflowY !== "visible"
      ) {
        clip = intersect(
          clip,
          clientBox(ancestor, rect(ancestor.getBoundingClientRect())),
        );
      }
      ancestor = composedParent(ancestor);
    }
    const points = [0.2, 0.5, 0.8].flatMap((xRatio) =>
      [0.2, 0.5, 0.8].map((yRatio) => ({
        x: border.x + border.width * xRatio,
        y: border.y + border.height * yRatio,
      })),
    );
    const role = element.getAttribute("role") ?? undefined;
    const tag = element.tagName.toLowerCase();
    const className =
      typeof element.className === "string" && element.className.length > 0
        ? element.className
        : undefined;
    const interactive =
      ["a", "button", "input", "select", "textarea", "summary"].includes(tag) ||
      role === "button" ||
      role === "link" ||
      element.hasAttribute("tabindex") ||
      element.hasAttribute("contenteditable");
    let effectiveOpacity = 1;
    let visualAncestor: Element | null = element;
    while (visualAncestor !== null) {
      effectiveOpacity *= number(getComputedStyle(visualAncestor).opacity);
      visualAncestor = composedParent(visualAncestor);
    }
    const measured: MeasuredProbe = {
      element,
      points,
      geometry: {
        elementId: elementIdFor(element),
        tag,
        ...(element.id.length === 0 ? {} : { id: element.id }),
        ...(className === undefined ? {} : { className }),
        ...(role === undefined ? {} : { role }),
        rect: border,
        content,
        padding,
        margin,
        client,
        scroll,
        clip,
        styles: {
          display: style.display,
          position: style.position,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
          transform: style.transform,
          clipPath: style.clipPath,
          pointerEvents: style.pointerEvents,
        },
        hidden:
          style.display === "none" ||
          style.visibility === "hidden" ||
          effectiveOpacity <= 0.01 ||
          border.width <= 0 ||
          border.height <= 0,
        interactive,
      },
    };
    measurements.set(element, measured);
    return measured;
  };
  const hitTestPoint = (element: Element, x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < innerWidth &&
    y < innerHeight &&
    composedContains(element, deepestAt(x, y));
  const hitTestViewport = (measured: MeasuredProbe): number => {
    const hits = measured.points.filter(({ x, y }) =>
      hitTestPoint(measured.element, x, y),
    ).length;
    return measured.points.length === 0 ? 0 : hits / measured.points.length;
  };
  const hitTestFullPage = (measured: MeasuredProbe): number => {
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const documentWidth = Math.max(
      innerWidth,
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    );
    const documentHeight = Math.max(
      innerHeight,
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
    );
    const maxScrollX = Math.max(0, documentWidth - innerWidth);
    const maxScrollY = Math.max(0, documentHeight - innerHeight);
    let hits = 0;
    try {
      for (const point of measured.points) {
        const documentX = point.x + originalX;
        const documentY = point.y + originalY;
        if (
          documentX < 0 ||
          documentY < 0 ||
          documentX >= documentWidth ||
          documentY >= documentHeight
        ) {
          continue;
        }
        const scrollX = Math.min(
          maxScrollX,
          Math.max(0, documentX - innerWidth / 2),
        );
        const scrollY = Math.min(
          maxScrollY,
          Math.max(0, documentY - innerHeight / 2),
        );
        window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
        if (
          hitTestPoint(
            measured.element,
            documentX - window.scrollX,
            documentY - window.scrollY,
          )
        ) {
          hits += 1;
        }
      }
    } finally {
      window.scrollTo({
        left: originalX,
        top: originalY,
        behavior: "instant",
      });
    }
    return measured.points.length === 0 ? 0 : hits / measured.points.length;
  };
  const hitRatios = new Map<Element, number>();
  const probe = (selector: string, element: Element): BrowserElementProbe => {
    const measured = measure(element);
    return {
      selector,
      ...measured.geometry,
      hitRatio: hitRatios.get(element) ?? 0,
    };
  };
  const select = (
    selector: string,
    containers: ReadonlyArray<Document | Element>,
  ): InspectionSelection => {
    try {
      return {
        selector,
        elements: allMatches(containers, selector),
      };
    } catch (error) {
      return {
        selector,
        elements: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const scope =
    input.scope === undefined
      ? {
          selector: ":root",
          elements: [document.documentElement],
        }
      : select(input.scope, [document]);
  const containers: ReadonlyArray<Document | Element> =
    scope.elements.length === 1 && input.scope !== undefined
      ? allMatches([document], input.scope)
      : [document];
  const allElements = allMatches(containers, "*");
  for (let index = 0; index < allElements.length; index += 1) {
    const element = allElements[index];
    if (element !== undefined) elementIds.set(element, index);
  }
  const elements: Record<string, InspectionSelection> = {};
  for (const [name, selector] of Object.entries(input.elements ?? {})) {
    elements[name] = select(selector, containers);
  }
  const ignored = (input.ignore ?? []).map((selector) =>
    select(selector, containers),
  );
  const candidateElements = allElements.filter((element) => {
    const candidate = measure(element).geometry;
    return (
      candidate.rect.width > 0 ||
      candidate.rect.height > 0 ||
      candidate.interactive
    );
  });
  const hitTargets = new Set<Element>();
  for (const selection of Object.values(elements)) {
    for (const element of selection.elements) hitTargets.add(element);
  }
  for (const element of candidateElements) {
    if (measure(element).geometry.interactive) hitTargets.add(element);
  }
  for (const element of hitTargets) {
    const measured = measure(element);
    hitRatios.set(
      element,
      input.fullPage ? hitTestFullPage(measured) : hitTestViewport(measured),
    );
  }
  const toResult = (selection: InspectionSelection): BrowserSelectorResult => ({
    selector: selection.selector,
    ...(selection.error === undefined ? {} : { error: selection.error }),
    matches: selection.elements.map((element) =>
      probe(selection.selector, element),
    ),
  });
  return {
    scope: toResult(scope),
    elements: Object.fromEntries(
      Object.entries(elements).map(([name, selection]) => [
        name,
        toResult(selection),
      ]),
    ),
    ignored: ignored.map(toResult),
    candidates: candidateElements.map((element) => probe("*", element)),
  };
};
