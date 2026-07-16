import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as Config from "../src/internal/config";
import * as Artifacts from "../src/internal/services/Artifacts";
import * as Discovery from "../src/internal/services/Discovery";

const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

const infrastructureLayer = Layer.mergeAll(
  platformLayer,
  Artifacts.layer.pipe(Layer.provide(platformLayer)),
  Discovery.layer.pipe(Layer.provide(platformLayer)),
);

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
  include: ["**/*.preview.{ts,tsx}"],
  timeoutMs: 30_000,
};

describe("preview infrastructure", () => {
  it.effect("writes a PNG artifact", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.tsx");
        const png = Uint8Array.from([137, 80, 78, 71]);

        const pngPath = yield* artifacts.write(source, "mobile", png);

        strictEqual(pngPath, path.join(root, ".preview", "Card.mobile.png"));
        const writtenPng = yield* fs.readFile(pngPath);
        deepStrictEqual(Array.from(writtenPng), Array.from(png));
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("adds the variant to a collection artifact name", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.tsx");
        const png = Uint8Array.from([137, 80, 78, 71]);

        const pngPath = yield* artifacts.write(
          source,
          "mobile",
          png,
          "locale=zh,state=error",
        );

        strictEqual(
          pngPath,
          path.join(
            root,
            ".preview",
            "Card.locale=zh,state=error.mobile.png",
          ),
        );
        const writtenPng = yield* fs.readFile(pngPath);
        deepStrictEqual(Array.from(writtenPng), Array.from(png));
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("discovers, filters, and sorts preview files", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const discovery = yield* Discovery.Discovery;
        const root = yield* fs.makeTempDirectoryScoped();
        const sourceDirectory = path.join(root, "src");
        const otherDirectory = path.join(root, "other");
        const outputDirectory = path.join(root, ".preview");
        const dependencyDirectory = path.join(root, "node_modules", "fixture");

        yield* Effect.forEach(
          [
            sourceDirectory,
            otherDirectory,
            outputDirectory,
            dependencyDirectory,
          ],
          (directory) => fs.makeDirectory(directory, { recursive: true }),
          { discard: true },
        );

        const sourceA = path.join(sourceDirectory, "a.preview.tsx");
        const sourceB = path.join(sourceDirectory, "b.preview.tsx");
        const sourceC = path.join(otherDirectory, "c.preview.ts");
        yield* Effect.forEach(
          [
            sourceB,
            sourceC,
            sourceA,
            path.join(outputDirectory, "generated.preview.tsx"),
            path.join(dependencyDirectory, "dependency.preview.tsx"),
          ],
          (file) => fs.writeFileString(file, "export default undefined"),
          { discard: true },
        );

        const discovered = yield* discovery.discover(root, config);
        const filteredByDirectory = yield* discovery.discover(root, config, [
          "src",
        ]);
        const filteredByGlob = yield* discovery.discover(root, config, [
          "other/*.preview.ts",
        ]);

        deepStrictEqual(discovered, [sourceC, sourceA, sourceB]);
        deepStrictEqual(filteredByDirectory, [sourceA, sourceB]);
        deepStrictEqual(filteredByGlob, [sourceC]);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );
});
