import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Artifacts from "../src/internal/services/Artifacts";
import * as Config from "../src/internal/services/Config";
import * as Discovery from "../src/internal/services/Discovery";

const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

const artifactsLayer = Artifacts.layer.pipe(Layer.provide(platformLayer));

const discoveryLayer = Discovery.layer.pipe(
  Layer.provide(Layer.merge(platformLayer, artifactsLayer)),
);

const testLayer = Layer.mergeAll(
  platformLayer,
  artifactsLayer,
  discoveryLayer,
  Config.layer({
    capture: {
      viewports: { test: { width: 100, height: 100 } },
    },
  }),
);

describe("preview discovery", () => {
  it.effect("returns only preview source files", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Real.preview.tsx");
        const matchingDirectory = path.join(root, "Folder.preview.tsx");
        const outputSource = path.join(root, ".preview", "Stale.preview.tsx");

        yield* fs.writeFileString(source, "export default {}\n");
        yield* fs.makeDirectory(matchingDirectory, { recursive: true });
        yield* fs.makeDirectory(path.dirname(outputSource), {
          recursive: true,
        });
        yield* fs.writeFileString(outputSource, "export default {}\n");

        const config = yield* Config.Config;
        const generation = yield* config.resolveGeneration();
        const discovery = yield* Discovery.Discovery;

        deepStrictEqual(yield* discovery.discover(root, generation), [source]);
      }),
    ).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "keeps a source directory that has the configured output name",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const source = path.join(root, "src", "Card.preview.tsx");
          yield* fs.makeDirectory(path.dirname(source), { recursive: true });
          yield* fs.writeFileString(source, "export default {}\n");

          const artifacts = yield* Artifacts.Artifacts;
          yield* artifacts.write({
            source,
            output: "src",
            viewport: "test",
            png: Uint8Array.from([137, 80, 78, 71]),
          });

          const config = yield* Config.Config;
          const generation = yield* config.resolveGeneration("src");
          const discovery = yield* Discovery.Discovery;

          deepStrictEqual(yield* discovery.discover(root, generation), [
            source,
          ]);
        }),
      ).pipe(Effect.provide(testLayer)),
  );
});
