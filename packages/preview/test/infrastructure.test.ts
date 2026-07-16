import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import {
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import type * as Config from "../src/internal/services/Config";
import * as Artifacts from "../src/internal/services/Artifacts";
import * as Discovery from "../src/internal/services/Discovery";

const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const artifactsLayer = Artifacts.layer.pipe(Layer.provide(platformLayer));
const discoveryLayer = Discovery.layer.pipe(
  Layer.provide(Layer.merge(platformLayer, artifactsLayer)),
);

const infrastructureLayer = Layer.mergeAll(
  platformLayer,
  artifactsLayer,
  discoveryLayer,
);

const failingSymlinkLayer = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return FileSystem.FileSystem.of({
      ...fs,
      symlink: (target, linkPath) =>
        Effect.fail(
          PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method: "symlink",
            pathOrDescriptor: linkPath,
            description: `Could not link to ${target}`,
          }),
        ),
    });
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

const failingArtifactsLayer = Layer.fresh(Artifacts.layer).pipe(
  Layer.provide(Layer.merge(failingSymlinkLayer, NodePath.layer)),
);

const failingRetentionLayer = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return FileSystem.FileSystem.of({
      ...fs,
      remove: (target, options) =>
        /mobile@\d{8}T\d{9}Z\.png$/u.test(target)
          ? Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "remove",
                pathOrDescriptor: target,
              }),
            )
          : fs.remove(target, options),
    });
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

const retentionFailureArtifactsLayer = Layer.fresh(Artifacts.layer).pipe(
  Layer.provide(Layer.merge(failingRetentionLayer, NodePath.layer)),
);

const generationConfig: Config.ResolvedGenerationOptions = {
  viewports: {
    mobile: {
      name: "mobile",
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
    },
  },
  clean: false,
  include: ["**/*.preview.{js,jsx,ts,tsx}"],
  exclude: ["**/ignored.preview.tsx"],
  output: ".preview",
  cleanOutputs: [".preview"],
  timeoutMs: 30_000,
};

const png = (value: number): Uint8Array =>
  Uint8Array.from([137, 80, 78, 71, value]);

describe("preview infrastructure", () => {
  it.effect("writes a regular PNG in the source file directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "src", "ui", "Card.preview.tsx");

        const pngPath = yield* artifacts.write({
          source,
          output: "artifacts/previews",
          viewport: "mobile",
          png: png(1),
        });

        strictEqual(
          pngPath,
          path.join(
            root,
            "src",
            "ui",
            "artifacts",
            "previews",
            "Card.preview.tsx",
            "mobile.png",
          ),
        );
        deepStrictEqual(
          Array.from(yield* fs.readFile(pngPath)),
          Array.from(png(1)),
        );
        strictEqual(Result.isFailure(yield* Effect.result(fs.readLink(pngPath))), true);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("uses the variant and viewport as the collection identity", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.tsx");

        const pngPath = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          variant: "locale=zh,state=error",
          png: png(2),
        });

        strictEqual(
          pngPath,
          path.join(
            root,
            ".preview",
            "Card.preview.tsx",
            "locale=zh,state=error.mobile.png",
          ),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("reuses exact bytes and makes monotonic UTC versions", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const time = Date.UTC(2026, 6, 17, 10, 30, 45, 123);
        yield* TestClock.setTime(time);

        const first = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
          version: { retain: 10 },
        });
        const same = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
          version: { retain: 10 },
        });
        const second = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(2),
          version: { retain: 10 },
        });
        yield* TestClock.setTime(time - 60_000);
        const third = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(3),
          version: { retain: 10 },
        });
        const reverted = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
          version: { retain: 10 },
        });

        strictEqual(first, same);
        strictEqual(path.basename(first), "mobile@20260717T103045123Z.png");
        strictEqual(path.basename(second), "mobile@20260717T103045124Z.png");
        strictEqual(path.basename(third), "mobile@20260717T103045125Z.png");
        strictEqual(path.basename(reverted), "mobile@20260717T103045126Z.png");
        const alias = path.join(path.dirname(reverted), "mobile.png");
        strictEqual(yield* fs.readLink(alias), path.basename(reverted));
        deepStrictEqual(
          Array.from(yield* fs.readFile(alias)),
          Array.from(png(1)),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("keeps the configured number of real versions", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));

        for (const value of [1, 2, 3]) {
          yield* artifacts.write({
            source,
            output: ".preview",
            viewport: "mobile",
            png: png(value),
            version: { retain: 2 },
          });
        }

        const directory = artifacts.sourceDirectory(source, ".preview");
        const names = (yield* fs.readDirectory(directory)).toSorted();
        deepStrictEqual(names, [
          Artifacts.OwnershipMarkerName,
          "mobile.png",
          "mobile@20260717T000000001Z.png",
          "mobile@20260717T000000002Z.png",
        ]);
        strictEqual(
          yield* fs.readLink(path.join(directory, "mobile.png")),
          "mobile@20260717T000000002Z.png",
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("keeps the current link when a new link cannot be made", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));
        const current = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
          version: { retain: 1 },
        });
        const alias = path.join(path.dirname(current), "mobile.png");

        const error = yield* Effect.gen(function* () {
          const failingArtifacts = yield* Artifacts.Artifacts;
          return yield* Effect.flip(
            failingArtifacts.write({
              source,
              output: ".preview",
              viewport: "mobile",
              png: png(2),
              version: { retain: 1 },
            }),
          );
        }).pipe(Effect.provide(failingArtifactsLayer));

        strictEqual(error._tag, "PreviewWriteError");
        strictEqual(error.operation, "link");
        strictEqual(yield* fs.readLink(alias), path.basename(current));
        deepStrictEqual(
          Array.from(yield* fs.readFile(alias)),
          Array.from(png(1)),
        );
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(current))).toSorted(),
          [
            Artifacts.OwnershipMarkerName,
            "mobile.png",
            path.basename(current),
            "mobile@20260717T000000001Z.png",
          ].toSorted(),
        );

        yield* artifacts.cleanSource({
          source,
          output: ".preview",
          targets: [{ viewport: "mobile" }],
          version: { retain: 1 },
        });
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(current))).toSorted(),
          [
            Artifacts.OwnershipMarkerName,
            "mobile.png",
            path.basename(current),
          ].toSorted(),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("reports retention failure after switching the current link", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));
        const first = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
          version: { retain: 2 },
        });

        const error = yield* Effect.gen(function* () {
          const failingArtifacts = yield* Artifacts.Artifacts;
          return yield* Effect.flip(
            failingArtifacts.write({
              source,
              output: ".preview",
              viewport: "mobile",
              png: png(2),
              version: { retain: 1 },
            }),
          );
        }).pipe(Effect.provide(retentionFailureArtifactsLayer));

        strictEqual(error._tag, "PreviewWriteError");
        strictEqual(error.operation, "retain");
        const alias = path.join(path.dirname(first), "mobile.png");
        strictEqual(
          yield* fs.readLink(alias),
          "mobile@20260717T000000001Z.png",
        );
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(first))).toSorted(),
          [
            Artifacts.OwnershipMarkerName,
            "mobile.png",
            "mobile@20260717T000000000Z.png",
            "mobile@20260717T000000001Z.png",
          ],
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("moves between regular and versioned output", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));

        const regular = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
        });
        const versioned = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
          version: { retain: 2 },
        });
        strictEqual(yield* fs.readLink(regular), path.basename(versioned));

        const disabled = yield* artifacts.write({
          source,
          output: ".preview",
          viewport: "mobile",
          png: png(2),
        });
        strictEqual(disabled, regular);
        strictEqual(Result.isFailure(yield* Effect.result(fs.readLink(disabled))), true);

        yield* artifacts.cleanSource({
          source,
          output: ".preview",
          targets: [{ viewport: "mobile" }],
        });
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(disabled))).toSorted(),
          [Artifacts.OwnershipMarkerName, "mobile.png"].toSorted(),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("cleans only the selected source directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const sourceA = path.join(root, "A.preview.ts");
        const sourceB = path.join(root, "B.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));
        const mobile = yield* artifacts.write({
          source: sourceA,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
        });
        const desktop = yield* artifacts.write({
          source: sourceA,
          output: ".preview",
          viewport: "desktop",
          png: png(2),
          version: { retain: 2 },
        });
        const desktopAlias = path.join(path.dirname(desktop), "desktop.png");
        const otherSource = yield* artifacts.write({
          source: sourceB,
          output: ".preview",
          viewport: "mobile",
          png: png(3),
        });
        const note = path.join(path.dirname(mobile), "notes.txt");
        yield* fs.writeFileString(note, "keep");

        yield* artifacts.cleanSource({
          source: sourceA,
          output: ".preview",
          targets: [{ viewport: "mobile" }],
        });

        strictEqual(yield* fs.exists(mobile), true);
        strictEqual(yield* fs.exists(desktop), false);
        strictEqual(yield* fs.exists(desktopAlias), false);
        strictEqual(yield* fs.exists(otherSource), true);
        strictEqual(yield* fs.exists(note), true);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("does not clean an unowned source output directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const directory = artifacts.sourceDirectory(source, "src");
        const ordinaryPng = path.join(directory, "photo.png");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFile(ordinaryPng, png(1));

        yield* artifacts.cleanSource({
          source,
          output: "src",
          targets: [{ viewport: "mobile" }],
        });

        strictEqual(yield* fs.exists(ordinaryPng), true);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("refuses to claim a non-empty unowned output directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const directory = artifacts.sourceDirectory(source, "src");
        const ordinaryPng = path.join(directory, "photo.png");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFile(ordinaryPng, png(1));

        const error = yield* Effect.flip(
          artifacts.write({
            source,
            output: "src",
            viewport: "mobile",
            png: png(2),
          }),
        );

        strictEqual(error._tag, "PreviewWriteError");
        strictEqual(error.operation, "write");
        strictEqual(yield* fs.exists(ordinaryPng), true);
        strictEqual(
          yield* fs.exists(
            path.join(directory, Artifacts.OwnershipMarkerName),
          ),
          false,
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("full clean removes owned stale output and keeps unowned files", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const activeSource = path.join(root, "src", "Active.preview.ts");
        const deletedSource = path.join(root, "src", "Deleted.preview.ts");
        const active = yield* artifacts.write({
          source: activeSource,
          output: ".preview",
          viewport: "mobile",
          png: png(1),
        });
        const deleted = yield* artifacts.write({
          source: deletedSource,
          output: ".preview",
          viewport: "mobile",
          png: png(2),
        });
        const oldOutput = yield* artifacts.write({
          source: activeSource,
          output: "old/previews",
          viewport: "mobile",
          png: png(3),
        });
        const flat = path.join(
          path.dirname(activeSource),
          ".preview",
          "Legacy.mobile.png",
        );
        const note = path.join(path.dirname(deleted), "notes.txt");
        yield* fs.writeFile(flat, png(4));
        yield* fs.writeFileString(note, "keep");

        yield* artifacts.cleanProject({
          root,
          outputs: [".preview", "old/previews"],
          activeSources: [{ source: activeSource, output: ".preview" }],
        });

        strictEqual(yield* fs.exists(active), true);
        strictEqual(yield* fs.exists(deleted), false);
        strictEqual(yield* fs.exists(oldOutput), false);
        strictEqual(yield* fs.exists(flat), true);
        strictEqual(yield* fs.exists(note), true);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("keeps ordinary source and PNG files when output is src", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const ordinarySource = path.join(root, "src", "Keep.preview.ts");
        const ordinaryPng = path.join(root, "src", "logo.png");
        yield* fs.makeDirectory(path.dirname(ordinarySource), {
          recursive: true,
        });
        yield* fs.writeFileString(ordinarySource, "export default undefined");
        yield* fs.writeFile(ordinaryPng, png(1));
        const generated = yield* artifacts.write({
          source,
          output: "src",
          viewport: "mobile",
          png: png(2),
        });

        yield* artifacts.cleanProject({
          root,
          outputs: ["src"],
          activeSources: [],
        });

        strictEqual(yield* fs.exists(generated), false);
        strictEqual(yield* fs.exists(ordinarySource), true);
        strictEqual(yield* fs.exists(ordinaryPng), true);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("discovers, filters, and sorts preview files", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const discovery = yield* Discovery.Discovery;
        const root = yield* fs.makeTempDirectoryScoped();
        const sourceDirectory = path.join(root, "src");
        const otherDirectory = path.join(root, "other");
        const outputDirectory = path.join(root, ".preview");
        const customOutputDirectory = path.join(
          sourceDirectory,
          "artifacts",
          "previews",
        );
        const dependencyDirectory = path.join(root, "node_modules", "fixture");

        yield* Effect.forEach(
          [
            sourceDirectory,
            otherDirectory,
            outputDirectory,
            customOutputDirectory,
            dependencyDirectory,
          ],
          (directory) => fs.makeDirectory(directory, { recursive: true }),
          { discard: true },
        );

        const sourceA = path.join(sourceDirectory, "a.preview.tsx");
        const sourceB = path.join(sourceDirectory, "b.preview.tsx");
        const sourceC = path.join(otherDirectory, "c.preview.ts");
        const sourceJavaScript = path.join(sourceDirectory, "c.preview.js");
        const sourceJsx = path.join(sourceDirectory, "d.preview.jsx");
        const ignoredSource = path.join(
          sourceDirectory,
          "ignored.preview.tsx",
        );
        const unownedDefaultOutputSource = path.join(
          outputDirectory,
          "real.preview.tsx",
        );
        const unownedCustomOutputSource = path.join(
          customOutputDirectory,
          "real.preview.tsx",
        );
        const generatedDefaultDirectory = artifacts.sourceDirectory(
          path.join(root, "Generated.preview.tsx"),
          ".preview",
        );
        const generatedCustomDirectory = artifacts.sourceDirectory(
          path.join(sourceDirectory, "Generated.preview.tsx"),
          "artifacts/previews",
        );
        yield* artifacts.write({
          source: path.join(root, "Generated.preview.tsx"),
          output: ".preview",
          viewport: "mobile",
          png: png(1),
        });
        yield* artifacts.write({
          source: path.join(sourceDirectory, "Generated.preview.tsx"),
          output: "artifacts/previews",
          viewport: "mobile",
          png: png(2),
        });
        yield* Effect.forEach(
          [
            sourceB,
            sourceC,
            sourceA,
            sourceJavaScript,
            sourceJsx,
            ignoredSource,
            unownedDefaultOutputSource,
            unownedCustomOutputSource,
            path.join(generatedDefaultDirectory, "generated.preview.tsx"),
            path.join(generatedCustomDirectory, "generated.preview.tsx"),
            path.join(dependencyDirectory, "dependency.preview.tsx"),
          ],
          (file) => fs.writeFileString(file, "export default undefined"),
          { discard: true },
        );

        const customConfig: Config.ResolvedGenerationOptions = {
          ...generationConfig,
          output: "artifacts/previews",
          cleanOutputs: [".preview", "artifacts/previews"],
        };
        const discovered = yield* discovery.discover(root, customConfig);
        const filteredByDirectory = yield* discovery.discover(
          root,
          customConfig,
          ["src"],
        );
        const filteredByGlob = yield* discovery.discover(
          root,
          customConfig,
          ["other/*.preview.ts"],
        );

        deepStrictEqual(discovered, [
          sourceC,
          sourceA,
          unownedCustomOutputSource,
          sourceB,
          sourceJavaScript,
          sourceJsx,
        ]);
        deepStrictEqual(filteredByDirectory, [
          sourceA,
          unownedCustomOutputSource,
          sourceB,
          sourceJavaScript,
          sourceJsx,
        ]);
        deepStrictEqual(filteredByGlob, [sourceC]);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );
});
