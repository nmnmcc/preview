import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Config from "../src/internal/config";
import * as Artifacts from "../src/internal/services/Artifacts";
import * as Browser from "../src/internal/services/Browser";
import * as Discovery from "../src/internal/services/Discovery";
import * as Renderer from "../src/internal/services/Renderer";

const config: Config.ResolvedPreviewOptions = {
  viewports: {
    mobile: {
      name: "mobile",
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
    },
  },
  capture: "viewport",
  include: ["**/*.preview.tsx"],
  timeoutMs: 30_000,
};

const source = "/project/Card.preview.tsx";
const capturedPng = Uint8Array.from([1, 2, 3]);

const browserSession: Browser.Session = {
  probe: Effect.fnUntraced(function* () {
    return [{ metadata: {} }];
  }),
  capture: Effect.fnUntraced(function* () {
    return capturedPng;
  }),
};

const browserLayer = Layer.succeed(
  Browser.Browser,
  Browser.Browser.of({
    launch: Effect.fnUntraced(function* () {
      return browserSession;
    }),
  }),
);

const unusedBrowserLayer = Layer.succeed(
  Browser.Browser,
  Browser.Browser.of({
    launch: Effect.fnUntraced(function* () {
      return yield* Effect.die(
        new Error("The empty discovery path launched the browser."),
      );
    }),
  }),
);

const noWriteArtifactsLayer = Layer.succeed(
  Artifacts.Artifacts,
  Artifacts.Artifacts.of({
    write: Effect.fnUntraced(function* () {
      return "unused.png";
    }),
  }),
);

const emptyDiscoveryLayer = Layer.succeed(
  Discovery.Discovery,
  Discovery.Discovery.of({
    discover: Effect.fnUntraced(function* () {
      return [];
    }),
  }),
);

const oneFileDiscoveryLayer = Layer.succeed(
  Discovery.Discovery,
  Discovery.Discovery.of({
    discover: Effect.fnUntraced(function* () {
      return [source];
    }),
  }),
);

const recordingArtifactsLayer = Layer.succeed(
  Artifacts.Artifacts,
  Artifacts.Artifacts.of({
    write: Effect.fnUntraced(function* (
      writtenSource,
      viewport,
      png,
      variant,
    ) {
      deepStrictEqual(
        { writtenSource, viewport, png, variant },
        {
          writtenSource: source,
          viewport: "mobile",
          png: capturedPng,
          variant: undefined,
        },
      );
      return "/project/.preview/Card.mobile.png";
    }),
  }),
);

const rendererLayer = (
  discovery: Layer.Layer<Discovery.Discovery>,
  artifacts: Layer.Layer<Artifacts.Artifacts>,
  browser: Layer.Layer<Browser.Browser>,
) =>
  Renderer.layer.pipe(
    Layer.provide(Layer.mergeAll(discovery, artifacts, browser)),
  );

describe("preview services", () => {
  it.effect("does not use the browser when discovery is empty", () =>
    Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        config,
      });

      deepStrictEqual(summary, { artifacts: [], failures: [] });
    }).pipe(
      Effect.provide(
        rendererLayer(
          emptyDiscoveryLayer,
          noWriteArtifactsLayer,
          unusedBrowserLayer,
        ),
      ),
    ),
  );

  it.effect("renders a discovered file through the browser service", () =>
    Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        config,
      });

      deepStrictEqual(summary, {
        artifacts: [
          {
            source,
            viewport: "mobile",
            pngPath: "/project/.preview/Card.mobile.png",
          },
        ],
        failures: [],
      });
    }).pipe(
      Effect.provide(
        rendererLayer(
          oneFileDiscoveryLayer,
          recordingArtifactsLayer,
          browserLayer,
        ),
      ),
    ),
  );

  it.effect("keeps one failed variant from blocking the other variants", () => {
    const captures: Array<string | undefined> = [];
    const variantBrowserLayer = Layer.succeed(
      Browser.Browser,
      Browser.Browser.of({
        launch: Effect.fnUntraced(function* () {
          return {
            probe: Effect.fnUntraced(function* () {
              return [
                {
                  variant: "state=invalid",
                  metadata: { capture: "invalid" },
                },
                { variant: "state=ready", metadata: {} },
              ];
            }),
            capture: Effect.fnUntraced(function* (request) {
              captures.push(request.variant);
              return capturedPng;
            }),
          } satisfies Browser.Session;
        }),
      }),
    );
    const variantArtifactsLayer = Layer.succeed(
      Artifacts.Artifacts,
      Artifacts.Artifacts.of({
        write: Effect.fnUntraced(function* (
          writtenSource,
          viewport,
          png,
          variant,
        ) {
          deepStrictEqual(
            { writtenSource, viewport, png, variant },
            {
              writtenSource: source,
              viewport: "mobile",
              png: capturedPng,
              variant: "state=ready",
            },
          );
          return "/project/.preview/Card.state=ready.mobile.png";
        }),
      }),
    );

    return Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        config,
      });

      deepStrictEqual(captures, ["state=ready"]);
      deepStrictEqual(summary.artifacts, [
        {
          source,
          variant: "state=ready",
          viewport: "mobile",
          pngPath: "/project/.preview/Card.state=ready.mobile.png",
        },
      ]);
      strictEqual(summary.failures.length, 1);
      const failure = summary.failures[0];
      if (failure === undefined) throw new Error("The failure is missing.");
      strictEqual(failure.source, source);
      strictEqual(failure.variant, "state=invalid");
      strictEqual(failure.viewport, undefined);
      assertInclude(failure.message, "capture");
    }).pipe(
      Effect.provide(
        rendererLayer(
          oneFileDiscoveryLayer,
          variantArtifactsLayer,
          variantBrowserLayer,
        ),
      ),
    );
  });
});
