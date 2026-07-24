# Layout inspection

Use layout inspection when a clean screenshot is not enough to explain a UI.
It records coordinates, element bounds, overlap evidence, layout facts, and
repeatable checks. It puts human notes, machine data, and image evidence in one
file tree.

## Contents

- Enable inspection
- Understand the inspection tree
- Name important elements
- Add exact checks
- Use automatic hints
- Read and act on an inspection
- Know the limits

## Enable inspection

Enable the capture work once in the Vite config:

```ts
preview({
  capture: {
    inspection: true,
    viewports: {
      desktop: { width: 1440, height: 900 },
    },
  },
});
```

This inspects every preview by default. Set `inspection: false` on one preview
to keep only its clean screenshot.

Inspection is an explicit project setting. A preview cannot add an inspection
definition unless the Vite config has `capture.inspection: true`.

## Understand the inspection tree

One `desktop` target can write this tree:

```text
viewport=desktop.png
viewport=desktop.inspect/
├── README.md
├── manifest.json
├── capture.json
├── nodes.json
├── checks.json
├── overview.png
└── findings/
    ├── errors/
    │   └── 0001-card-visible/
    │       ├── README.md
    │       ├── finding.json
    │       └── evidence.png
    └── warnings/
        └── 0002-possible-overlap/
            ├── README.md
            ├── finding.json
            └── evidence.png
```

`viewport=desktop.png` is the clean capture. It has no inspection marks.

Start with `viewport=desktop.inspect/README.md`. It lists every check and
finding. It links to the exact files that hold more evidence.

`manifest.json` identifies the target and the fixed domain files. It also maps
each finding ID to its directory. Its `schemaVersion` is `1`.

`capture.json` records capture, document, and viewport coordinates. It also
records the PNG size, scale, device scale factor, and full-page state.

`nodes.json` records measured layout nodes, box data, paint order, selected
computed styles, and named elements. `checks.json` records passed, failed, and
unresolved checks. Passing checks do not make finding directories.

`overview.png` has the same size and scale as the clean PNG. It adds a
coordinate grid, named element bounds, and finding evidence. It does not add a
report header, sidebar, card, or other report UI.

Each finding directory has a short `README.md` and an exact `finding.json`.
It also has an annotated `evidence.png` crop when its geometry meets the
capture. A selector error or geometry outside the capture has no evidence PNG.

## Name important elements

Use `Inspection.define()` in the preview definition. Names make evidence stable
and let checks refer to elements without repeating selectors:

```ts
import { Inspection, preview } from "@nmnmcc/preview";

const inspection = Inspection.define({
  scope: "#card-demo",
  ignore: ["[data-inspection-ignore]"],
  elements: {
    card: "#card",
    badge: "#status-badge",
  },
  checks: ({ badge, card }) => ({
    "card-visible": Inspection.visible(card),
    "card-in-view": Inspection.inside(card, Inspection.viewport),
    separate: Inspection.noOverlap(card, badge),
  }),
});
```

`scope` must match one element. Each named element must also match one element.
An invalid selector, no match, or more than one match is a declaration error.
An `ignore` selector may match any number of elements. It removes those regions
from automatic hint analysis.

Inspection searches the document and open shadow roots. Keep names and check
names to ASCII letters, digits, `.`, `_`, and `-`, with a letter or digit first.

## Add exact checks

Use checks for product rules that must fail generation when they are false:

| Check | Rule |
| --- | --- |
| `visible(element)` | The element has visible area in the capture. |
| `inside(element, container)` | The border box stays inside an element padding box or the viewport. |
| `noOverlap(first, second)` | The two border boxes do not overlap. |
| `minSize(element, size)` | The border box has the required width or height. |
| `contentFits(element)` | Scroll size fits the client box on the chosen axes. |
| `notClipped(element)` | An ancestor or the viewport does not clip the border box. |
| `unobscured(element)` | Hit testing reaches the element at the required share of nine sample points. |

`inside`, `noOverlap`, `contentFits`, and `notClipped` accept a CSS pixel
tolerance. `unobscured` accepts a ratio from `0` to `1`. A check that depends on
an unresolved named element has the `unresolved` status and fails generation.
For a full-page capture, `unobscured` scrolls each sample into the layout
viewport for its hit test and then restores the original scroll position.

Preview writes the complete inspection tree before it reports a declaration or
check failure. This lets an agent inspect the evidence for a failed target.
Other targets still run.

## Use automatic hints

Inspection also reports likely problems without a declaration:

- document content wider than the layout viewport
- content clipped by `overflow: hidden` or `overflow: clip`
- a named or interactive target that is hidden or outside the capture
- a named or interactive target blocked at most hit-test samples
- overlap between named or interactive elements
- layout or DOM changes after `emit()` during the capture transaction

Hints are warnings. They do not fail generation. Treat a possible overlap as
evidence to inspect, not as proof of a product fault. Add an exact check when
the relationship is a product rule.

## Read and act on an inspection

Follow this order:

1. Open the clean PNG and confirm that it shows the wanted state.
2. Open `README.md` in the sibling `.inspect/` directory.
3. Open `overview.png` and compare its coordinates and bounds with the clean PNG.
4. Open each relevant finding `README.md` and `evidence.png`.
5. Read the domain JSON when exact coordinates or programmatic checks matter.
6. Decide whether the cause is product layout, preview setup, a selector, or an early `emit()` point.
7. Fix the cause and generate again. Confirm that the clean image is right and that required checks pass.

The capture waits for document fonts, applies the configured screenshot style,
caret, and animation rules, and compares layout over two animation frames. It
records a warning if the document changes during the inspection transaction.

## Know the limits

- Bounds and overlap are geometric evidence. They do not know the design's meaning.
- Hit tests use nine points. A complex shape may need human review.
- Closed shadow roots cannot be inspected.
- Browser extensions and another browser engine are outside this capture.
- An inspection describes one emitted state, preview variant, and viewport. Compare separate trees for responsive or state differences.

Versioning treats the clean PNG and the complete inspection directory as one
unit. Both real paths get the same UTC timestamp. Equal trees reuse one version.
Retention removes old pairs as units. Cleaning removes stale files and finding
directories with their target.
