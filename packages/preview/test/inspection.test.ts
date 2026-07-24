import { strict as assert } from "node:assert";
import { describe, it } from "@effect/vitest";
import { assertTrue, deepStrictEqual } from "@effect/vitest/utils";
import { Inspection } from "@nmnmcc/preview";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as InternalInspection from "../src/internal/inspection";

describe("preview inspection", () => {
  it("makes named references and checked layout rules", () => {
    const definition = Inspection.define({
      scope: "#canvas",
      ignore: ["[data-inspection-ignore]"],
      elements: {
        card: "#card",
        badge: "#badge",
      },
      checks: ({ badge, card }) => ({
        visible: Inspection.visible(card),
        inside: Inspection.inside(card, Inspection.viewport, { tolerance: 1 }),
        separate: Inspection.noOverlap(card, badge),
        size: Inspection.minSize(card, { width: 44, height: 44 }),
        fits: Inspection.contentFits(card, { axis: "both", tolerance: 1 }),
        unclipped: Inspection.notClipped(badge),
        clear: Inspection.unobscured(card, { minimumRatio: 0.8 }),
      }),
    });

    deepStrictEqual(definition, {
      scope: "#canvas",
      ignore: ["[data-inspection-ignore]"],
      elements: { card: "#card", badge: "#badge" },
      checks: {
        visible: {
          type: "visible",
          element: { type: "element", name: "card" },
        },
        inside: {
          type: "inside",
          element: { type: "element", name: "card" },
          container: { type: "viewport" },
          tolerance: 1,
        },
        separate: {
          type: "no-overlap",
          first: { type: "element", name: "card" },
          second: { type: "element", name: "badge" },
        },
        size: {
          type: "min-size",
          element: { type: "element", name: "card" },
          width: 44,
          height: 44,
        },
        fits: {
          type: "content-fits",
          element: { type: "element", name: "card" },
          axis: "both",
          tolerance: 1,
        },
        unclipped: {
          type: "not-clipped",
          element: { type: "element", name: "badge" },
        },
        clear: {
          type: "unobscured",
          element: { type: "element", name: "card" },
          minimumRatio: 0.8,
        },
      },
    });
  });

  it("rejects invalid declaration values at construction time", () => {
    assert.throws(
      () =>
        Inspection.define({
          elements: { "bad name": "#card" },
        }),
      /RegExp/iu,
    );
    const element = { type: "element", name: "card" } as const;
    assert.throws(() => Inspection.minSize(element, {}), /width or height/iu);
    assert.throws(
      () => Inspection.unobscured(element, { minimumRatio: 1.1 }),
      /less than or equal to 1/iu,
    );
  });

  it.effect("rejects malformed browser inspection values at runtime", () =>
    Effect.gen(function* () {
      const probes = yield* Effect.result(
        Schema.decodeUnknownEffect(InternalInspection.BrowserProbeResult)({
          scope: { selector: ":root", matches: [] },
          elements: {},
          ignored: [],
          candidates: [
            {
              elementId: 0,
              selector: "*",
              tag: "button",
              rect: { x: 0, y: 0, width: 10, height: 10 },
              content: { x: 0, y: 0, width: 10, height: 10 },
              padding: { x: 0, y: 0, width: 10, height: 10 },
              margin: { x: 0, y: 0, width: 10, height: 10 },
              client: { x: 0, y: 0, width: 10, height: 10 },
              scroll: { x: 0, y: 0, width: 10, height: 10 },
              clip: { x: 0, y: 0, width: 10, height: 10 },
              styles: {},
              hidden: false,
              interactive: true,
              hitRatio: 2,
            },
          ],
        }),
      );
      const rendered = yield* Effect.result(
        Schema.decodeUnknownEffect(
          InternalInspection.RenderedInspectionArtifacts,
        )({ overview: [137, 80, 78, 71], evidence: [] }),
      );

      assertTrue(Result.isFailure(probes));
      assertTrue(Result.isFailure(rendered));
    }),
  );
});
