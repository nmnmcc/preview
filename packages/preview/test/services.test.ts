import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Artifacts from "../src/internal/services/Artifacts";
import * as Browser from "../src/internal/services/Browser";
import * as Config from "../src/internal/services/Config";
import * as Discovery from "../src/internal/services/Discovery";
import * as Renderer from "../src/internal/services/Renderer";

const configLayer = (clean = false, version?: Artifacts.VersionOptions) =>
  Config.layer({
    artifacts: {
      clean,
      ...(version === undefined ? {} : { version }),
    },
    capture: {
      viewports: {
        mobile: { width: 390, height: 844 },
      },
    },
    files: { include: "**/*.preview.tsx" },
  });

const source = "/project/Card.preview.tsx";
const capturedPng = Uint8Array.from([1, 2, 3]);

const browserSession: Browser.Session = {
  probe: Effect.fnUntraced(function* () {
    return [{ metadata: {}, target: { type: "sandbox" } }];
  }),
  capture: Effect.fnUntraced(function* () {
    return capturedPng;
  }),
};

const browserLayer = Layer.succeed(
  Browser.Browser,
  Browser.Browser.of({
    session: Effect.fnUntraced(function* () {
      return browserSession;
    }),
  }),
);

const unusedBrowserLayer = Layer.succeed(
  Browser.Browser,
  Browser.Browser.of({
    session: Effect.fnUntraced(function* () {
      return yield* Effect.die(
        new Error("The empty discovery path opened a browser session."),
      );
    }),
  }),
);

const unusedArtifactsLayer = Layer.succeed(
  Artifacts.Artifacts,
  Artifacts.Artifacts.of({
    cleanProject: Effect.fnUntraced(function* () {
      return yield* Effect.die(
        new Error("The empty path cleaned the project."),
      );
    }),
    cleanSource: Effect.fnUntraced(function* () {
      return yield* Effect.die(new Error("The empty path cleaned a source."));
    }),
    isPathInDirectory: () => false,
    outputDirectories: Effect.fnUntraced(function* () {
      return new Set<string>();
    }),
    outputDirectory: (writtenSource, output) => `${writtenSource}/${output}`,
    sourceDirectory: (writtenSource, output) => `${writtenSource}/${output}`,
    write: Effect.fnUntraced(function* () {
      return yield* Effect.die(new Error("The empty path wrote an artifact."));
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

const rendererLayer = (
  discovery: Layer.Layer<Discovery.Discovery>,
  artifacts: Layer.Layer<Artifacts.Artifacts>,
  browser: Layer.Layer<Browser.Browser>,
  configuration = configLayer(),
) =>
  Renderer.layer.pipe(
    Layer.provide(Layer.mergeAll(discovery, artifacts, browser, configuration)),
  );

describe("preview services", () => {
  it.effect("does not use the browser when discovery is empty", () =>
    Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
      });

      deepStrictEqual(summary, { artifacts: [], failures: [] });
    }).pipe(
      Effect.provide(
        rendererLayer(
          emptyDiscoveryLayer,
          unusedArtifactsLayer,
          unusedBrowserLayer,
        ),
      ),
    ),
  );

  it.effect("full clean runs when every source was deleted", () => {
    const cleaned: Array<Artifacts.CleanProjectInput> = [];
    const artifactsLayer = Layer.succeed(
      Artifacts.Artifacts,
      Artifacts.Artifacts.of({
        cleanProject: Effect.fnUntraced(function* (input) {
          cleaned.push(input);
        }),
        cleanSource: Effect.fnUntraced(function* () {
          return yield* Effect.die(
            new Error("An empty project cleaned a source."),
          );
        }),
        isPathInDirectory: () => false,
        outputDirectories: Effect.fnUntraced(function* () {
          return new Set<string>();
        }),
        outputDirectory: (writtenSource, output) =>
          `${writtenSource}/${output}`,
        sourceDirectory: (writtenSource, output) =>
          `${writtenSource}/${output}`,
        write: Effect.fnUntraced(function* () {
          return yield* Effect.die(
            new Error("An empty project wrote an artifact."),
          );
        }),
      }),
    );

    return Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
      });

      deepStrictEqual(summary, { artifacts: [], failures: [] });
      deepStrictEqual(cleaned, [
        {
          root: "/project",
          outputs: [".preview"],
          activeSources: [],
        },
      ]);
    }).pipe(
      Effect.provide(
        rendererLayer(
          emptyDiscoveryLayer,
          artifactsLayer,
          unusedBrowserLayer,
          configLayer(true),
        ),
      ),
    );
  });

  it.effect("renders and cleans a complete full run", () => {
    const events: Array<string> = [];
    const artifactsLayer = Layer.succeed(
      Artifacts.Artifacts,
      Artifacts.Artifacts.of({
        cleanProject: Effect.fnUntraced(function* (input) {
          events.push("project");
          deepStrictEqual(input, {
            root: "/project",
            outputs: [".preview", "images"],
            activeSources: [{ source, output: "images" }],
          });
        }),
        cleanSource: Effect.fnUntraced(function* (input) {
          events.push("source");
          deepStrictEqual(input, {
            source,
            output: "images",
            targets: [{ viewport: "mobile" }],
            version: { retain: 2 },
          });
        }),
        isPathInDirectory: () => false,
        outputDirectories: Effect.fnUntraced(function* () {
          return new Set<string>();
        }),
        outputDirectory: (writtenSource, output) =>
          `${writtenSource}/${output}`,
        sourceDirectory: (writtenSource, output) =>
          `${writtenSource}/${output}`,
        write: Effect.fnUntraced(function* (input) {
          events.push("write");
          deepStrictEqual(input, {
            source,
            output: "images",
            viewport: "mobile",
            png: capturedPng,
            version: { retain: 2 },
          });
          return "/project/images/Card.preview.tsx/mobile.png";
        }),
      }),
    );

    return Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        output: "images",
      });

      deepStrictEqual(events, ["write", "source", "project"]);
      deepStrictEqual(summary, {
        artifacts: [
          {
            source,
            viewport: "mobile",
            pngPath: "/project/images/Card.preview.tsx/mobile.png",
          },
        ],
        failures: [],
      });
    }).pipe(
      Effect.provide(
        rendererLayer(
          oneFileDiscoveryLayer,
          artifactsLayer,
          browserLayer,
          configLayer(true, { retain: 2 }),
        ),
      ),
    );
  });

  it.effect("cleans a partial source and protects known failed targets", () => {
    const cleaned: Array<Artifacts.CleanSourceInput> = [];
    const partialBrowserLayer = Layer.succeed(
      Browser.Browser,
      Browser.Browser.of({
        session: Effect.fnUntraced(function* () {
          return {
            probe: Effect.fnUntraced(function* () {
              return [
                {
                  variant: "state=ready",
                  metadata: {},
                  target: { type: "sandbox" },
                },
                {
                  variant: "state=error",
                  metadata: {},
                  target: { type: "sandbox" },
                },
              ];
            }),
            capture: Effect.fnUntraced(function* (input) {
              if (input.variant === "state=error") {
                return yield* new Browser.PreviewBrowserError({
                  source,
                  variant: input.variant,
                  viewport: input.viewport.name,
                  detail: "Capture failed.",
                  cause: new Error("capture"),
                });
              }
              return capturedPng;
            }),
          } satisfies Browser.Session;
        }),
      }),
    );
    const artifactsLayer = Layer.succeed(
      Artifacts.Artifacts,
      Artifacts.Artifacts.of({
        cleanProject: Effect.fnUntraced(function* () {
          return yield* Effect.die(
            new Error("A partial run cleaned the project."),
          );
        }),
        cleanSource: Effect.fnUntraced(function* (input) {
          cleaned.push(input);
        }),
        isPathInDirectory: () => false,
        outputDirectories: Effect.fnUntraced(function* () {
          return new Set<string>();
        }),
        outputDirectory: (writtenSource, output) =>
          `${writtenSource}/${output}`,
        sourceDirectory: (writtenSource, output) =>
          `${writtenSource}/${output}`,
        write: Effect.fnUntraced(function* (input) {
          strictEqual(input.variant, "state=ready");
          return "/project/.preview/Card.preview.tsx/state=ready.mobile.png";
        }),
      }),
    );

    return Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        filters: [source],
      });

      deepStrictEqual(cleaned, [
        {
          source,
          output: ".preview",
          targets: [
            { viewport: "mobile", variant: "state=ready" },
            { viewport: "mobile", variant: "state=error" },
          ],
        },
      ]);
      strictEqual(summary.artifacts.length, 1);
      strictEqual(summary.failures.length, 1);
      assertInclude(summary.failures[0]?.message ?? "", "Capture failed");
    }).pipe(
      Effect.provide(
        rendererLayer(
          oneFileDiscoveryLayer,
          artifactsLayer,
          partialBrowserLayer,
          configLayer(true),
        ),
      ),
    );
  });

  it.effect("skips source clean when target metadata is incomplete", () => {
    const incompleteBrowserLayer = Layer.succeed(
      Browser.Browser,
      Browser.Browser.of({
        session: Effect.fnUntraced(function* () {
          return {
            probe: Effect.fnUntraced(function* () {
              return [
                {
                  variant: "state=invalid",
                  metadata: {
                    viewports: { mobile: { height: "invalid" } },
                  },
                  target: { type: "sandbox" },
                },
              ];
            }),
            capture: Effect.fnUntraced(function* () {
              return yield* Effect.die(
                new Error("Invalid metadata reached capture."),
              );
            }),
          } satisfies Browser.Session;
        }),
      }),
    );

    return Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        filters: [source],
      });

      strictEqual(summary.artifacts.length, 0);
      strictEqual(summary.failures.length, 1);
      assertInclude(summary.failures[0]?.message ?? "", "height");
    }).pipe(
      Effect.provide(
        rendererLayer(
          oneFileDiscoveryLayer,
          unusedArtifactsLayer,
          incompleteBrowserLayer,
          configLayer(true),
        ),
      ),
    );
  });

  it.effect("skips source clean when the probe fails", () => {
    const failedProbeBrowserLayer = Layer.succeed(
      Browser.Browser,
      Browser.Browser.of({
        session: Effect.fnUntraced(function* () {
          return {
            probe: Effect.fnUntraced(function* () {
              return yield* new Browser.PreviewBrowserError({
                source,
                detail: "Probe failed.",
                cause: new Error("probe"),
              });
            }),
            capture: Effect.fnUntraced(function* () {
              return yield* Effect.die(
                new Error("A failed probe reached capture."),
              );
            }),
          } satisfies Browser.Session;
        }),
      }),
    );

    return Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        filters: [source],
      });

      strictEqual(summary.artifacts.length, 0);
      strictEqual(summary.failures.length, 1);
      assertInclude(summary.failures[0]?.message ?? "", "Probe failed");
    }).pipe(
      Effect.provide(
        rendererLayer(
          oneFileDiscoveryLayer,
          unusedArtifactsLayer,
          failedProbeBrowserLayer,
          configLayer(true),
        ),
      ),
    );
  });

  it.effect("does not clean after a partial run with no match", () =>
    Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      const summary = yield* renderer.renderProject({
        root: "/project",
        baseUrl: "http://preview.test",
        filters: [source],
      });

      deepStrictEqual(summary, { artifacts: [], failures: [] });
    }).pipe(
      Effect.provide(
        rendererLayer(
          emptyDiscoveryLayer,
          unusedArtifactsLayer,
          unusedBrowserLayer,
          configLayer(true),
        ),
      ),
    ),
  );

  it.effect(
    "limits all nested page tasks and keeps artifact order stable",
    () =>
      Effect.gen(function* () {
        const sources = [
          "/project/First.preview.tsx",
          "/project/Second.preview.tsx",
        ] as const;
        interface StartedTask {
          readonly key: string;
          readonly release: Deferred.Deferred<void>;
        }
        const started = yield* Queue.unbounded<StartedTask>();
        const active = yield* Ref.make(0);
        const maxActive = yield* Ref.make(0);

        const pageTask = <A>(key: string, value: A) =>
          Effect.gen(function* () {
            const activeCount = yield* Ref.updateAndGet(
              active,
              (count) => count + 1,
            );
            yield* Ref.update(maxActive, (count) =>
              Math.max(count, activeCount),
            );
            const release = yield* Deferred.make<void>();
            yield* Queue.offer(started, { key, release });
            return yield* Deferred.await(release).pipe(
              Effect.as(value),
              Effect.ensuring(Ref.update(active, (count) => count - 1)),
            );
          });

        const concurrentBrowserLayer = Layer.succeed(
          Browser.Browser,
          Browser.Browser.of({
            session: Effect.fnUntraced(function* () {
              return {
                probe: Effect.fnUntraced(function* (input) {
                  return yield* pageTask(`probe:${input.source}`, [
                    { metadata: {}, target: { type: "sandbox" } },
                  ] satisfies ReadonlyArray<Browser.Target>);
                }),
                capture: Effect.fnUntraced(function* (input) {
                  return yield* pageTask(
                    `capture:${input.source}:${input.viewport.name}`,
                    capturedPng,
                  );
                }),
              } satisfies Browser.Session;
            }),
          }),
        );
        const concurrentDiscoveryLayer = Layer.succeed(
          Discovery.Discovery,
          Discovery.Discovery.of({
            discover: Effect.fnUntraced(function* () {
              return sources;
            }),
          }),
        );
        const concurrentArtifactsLayer = Layer.succeed(
          Artifacts.Artifacts,
          Artifacts.Artifacts.of({
            cleanProject: Effect.fnUntraced(function* () {
              return yield* Effect.die("Unexpected project clean");
            }),
            cleanSource: Effect.fnUntraced(function* () {
              return yield* Effect.die("Unexpected source clean");
            }),
            isPathInDirectory: () => false,
            outputDirectories: Effect.fnUntraced(function* () {
              return new Set<string>();
            }),
            outputDirectory: (writtenSource, output) =>
              `${writtenSource}/${output}`,
            sourceDirectory: (writtenSource, output) =>
              `${writtenSource}/${output}`,
            write: Effect.fnUntraced(function* (input) {
              return `${input.source}/${input.viewport}.png`;
            }),
          }),
        );
        const concurrentConfigLayer = Config.layer({
          capture: {
            concurrency: 2,
            viewports: {
              mobile: { width: 390, height: 844 },
              desktop: { width: 1280, height: 720 },
            },
          },
          files: { include: "**/*.preview.tsx" },
        });

        const summary = yield* Effect.gen(function* () {
          const renderer = yield* Renderer.Renderer;
          const renderFiber = yield* Effect.forkChild(
            renderer.renderProject({
              root: "/project",
              baseUrl: "http://preview.test",
            }),
          );

          const first = yield* Queue.take(started);
          const second = yield* Queue.take(started);
          assertTrue(first.key.startsWith("probe:"));
          assertTrue(second.key.startsWith("probe:"));
          strictEqual(yield* Ref.get(active), 2);
          strictEqual(yield* Ref.get(maxActive), 2);

          yield* Deferred.succeed(first.release, undefined);
          const third = yield* Queue.take(started);
          assertTrue(third.key.startsWith("capture:"));

          const fourthFiber = yield* Effect.forkChild(Queue.take(started));
          yield* Effect.yieldNow;
          strictEqual(fourthFiber.pollUnsafe(), undefined);
          strictEqual(yield* Ref.get(active), 2);

          yield* Deferred.succeed(second.release, undefined);
          const fourth = yield* Fiber.join(fourthFiber);
          yield* Deferred.succeed(fourth.release, undefined);
          const fifth = yield* Queue.take(started);
          yield* Deferred.succeed(fifth.release, undefined);
          const sixth = yield* Queue.take(started);
          yield* Deferred.succeed(sixth.release, undefined);
          yield* Deferred.succeed(third.release, undefined);

          return yield* Fiber.join(renderFiber);
        }).pipe(
          Effect.provide(
            rendererLayer(
              concurrentDiscoveryLayer,
              concurrentArtifactsLayer,
              concurrentBrowserLayer,
              concurrentConfigLayer,
            ),
          ),
        );

        strictEqual(yield* Ref.get(maxActive), 2);
        deepStrictEqual(
          summary.artifacts.map(({ source: artifactSource, viewport }) => ({
            source: artifactSource,
            viewport,
          })),
          [
            { source: sources[0], viewport: "mobile" },
            { source: sources[0], viewport: "desktop" },
            { source: sources[1], viewport: "mobile" },
            { source: sources[1], viewport: "desktop" },
          ],
        );
        deepStrictEqual(summary.failures, []);
      }),
  );
});
