import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import {
  assertInclude,
  assertTrue,
  deepStrictEqual,
  strictEqual,
} from "@effect/vitest/utils";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import * as Artifacts from "../src/internal/services/Artifacts";
import type * as Config from "../src/internal/services/Config";
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

const failingInspectionSymlinkLayer = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return FileSystem.FileSystem.of({
      ...fs,
      symlink: (target, linkPath) =>
        target.includes(".inspect@")
          ? Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "symlink",
                pathOrDescriptor: linkPath,
                description: `Could not link to ${target}`,
              }),
            )
          : fs.symlink(target, linkPath),
    });
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

const failingInspectionArtifactsLayer = Layer.fresh(Artifacts.layer).pipe(
  Layer.provide(Layer.merge(failingInspectionSymlinkLayer, NodePath.layer)),
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
  concurrency: 1,
  inspection: false,
  timeoutMs: 30_000,
};

const png = (value: number): Uint8Array =>
  Uint8Array.from([137, 80, 78, 71, value]);

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const inspectionFiles = (
  value: number,
  extra: ReadonlyArray<{
    readonly path: string;
    readonly content: Uint8Array;
  }> = [],
) => [
  { path: "README.md", content: text(`inspection ${value}`) },
  { path: "manifest.json", content: text(`manifest ${value}`) },
  { path: "capture.json", content: text(`capture ${value}`) },
  { path: "nodes.json", content: text(`nodes ${value}`) },
  { path: "checks.json", content: text(`checks ${value}`) },
  { path: "overview.png", content: png(value) },
  ...extra,
];

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
          state: "default",
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
            "default",
            "viewport=mobile.png",
          ),
        );
        deepStrictEqual(
          Array.from(yield* fs.readFile(pngPath)),
          Array.from(png(1)),
        );
        strictEqual(
          Result.isFailure(yield* Effect.result(fs.readLink(pngPath))),
          true,
        );
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
          state: "error",
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
            "error",
            "locale=zh,state=error,viewport=mobile.png",
          ),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("keeps active state directories and removes stale states", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.tsx");

        const loading = yield* artifacts.write({
          source,
          output: ".preview",
          state: "loading",
          viewport: "mobile",
          png: png(1),
        });
        const loaded = yield* artifacts.write({
          source,
          output: ".preview",
          state: "loaded",
          viewport: "mobile",
          png: png(2),
        });
        const stale = yield* artifacts.write({
          source,
          output: ".preview",
          state: "error",
          viewport: "mobile",
          png: png(3),
        });

        yield* artifacts.cleanSource({
          source,
          output: ".preview",
          targets: [
            { state: "loading", viewport: "mobile" },
            { state: "loaded", viewport: "mobile" },
          ],
        });

        strictEqual(yield* fs.exists(loading), true);
        strictEqual(yield* fs.exists(loaded), true);
        strictEqual(yield* fs.exists(stale), false);
        deepStrictEqual(
          (yield* fs.readDirectory(
            artifacts.sourceDirectory(source, ".preview"),
          )).toSorted(),
          ["loaded", "loading"],
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("keeps canonical viewport artifacts unambiguous", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const inspected = yield* artifacts.writeBundle({
          source,
          output: ".preview",
          state: "default",
          viewport: "desktop",
          png: png(1),
          inspection: {
            files: inspectionFiles(2),
          },
        });
        const regular = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "desktop-inspect",
          png: png(3),
        });
        const inspection = inspected.inspection;

        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(regular))).toSorted(),
          [
            "viewport=desktop-inspect.png",
            "viewport=desktop.inspect",
            "viewport=desktop.png",
          ],
        );
        deepStrictEqual(
          Array.from(yield* fs.readFile(regular)),
          Array.from(png(3)),
        );
        deepStrictEqual(
          Array.from(yield* fs.readFile(inspection.overviewPath)),
          Array.from(png(2)),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("writes and replaces one unversioned inspection bundle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const first = yield* artifacts.writeBundle({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          inspection: {
            files: inspectionFiles(2, [
              {
                path: "findings/errors/0001-old/README.md",
                content: text("old finding"),
              },
              {
                path: "findings/errors/0001-old/finding.json",
                content: text("old data"),
              },
              {
                path: "findings/errors/0001-old/evidence.png",
                content: png(3),
              },
            ]),
          },
        });
        const firstInspection = first.inspection;
        strictEqual(
          yield* fs.exists(
            path.join(
              firstInspection.directoryPath,
              "findings",
              "errors",
              "0001-old",
              "evidence.png",
            ),
          ),
          true,
        );

        const second = yield* artifacts.writeBundle({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(4),
          inspection: {
            files: inspectionFiles(5),
          },
        });
        const secondInspection = second.inspection;
        const directory = path.dirname(second.pngPath);
        deepStrictEqual((yield* fs.readDirectory(directory)).toSorted(), [
          "viewport=mobile.inspect",
          "viewport=mobile.png",
        ]);
        deepStrictEqual(
          (yield* fs.readDirectory(secondInspection.directoryPath)).toSorted(),
          [
            "README.md",
            "capture.json",
            "checks.json",
            "manifest.json",
            "nodes.json",
            "overview.png",
          ],
        );
        deepStrictEqual(
          Array.from(
            yield* fs.readFile(path.join(directory, "viewport=mobile.png")),
          ),
          Array.from(png(4)),
        );

        yield* artifacts.cleanSource({
          source,
          output: ".preview",
          targets: [{ state: "default", viewport: "mobile" }],
        });
        deepStrictEqual(yield* fs.readDirectory(directory), [
          "viewport=mobile.png",
        ]);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("finishes an artifact swap before honoring interruption", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const first = yield* artifacts.writeBundle({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          inspection: { files: inspectionFiles(2) },
        });
        const backupMoved = yield* Deferred.make<void>();
        const continueSwap = yield* Deferred.make<void>();
        const interruptingFileSystem = FileSystem.FileSystem.of({
          ...fs,
          rename: (from, to) => {
            const renamed = fs.rename(from, to);
            return from === first.pngPath && path.basename(to) === "backup-0"
              ? renamed.pipe(
                  Effect.tap(() => Deferred.succeed(backupMoved, undefined)),
                  Effect.andThen(Deferred.await(continueSwap)),
                )
              : renamed;
          },
        });
        const interruptingArtifactsLayer = Layer.fresh(Artifacts.layer).pipe(
          Layer.provide(
            Layer.merge(
              Layer.succeed(FileSystem.FileSystem, interruptingFileSystem),
              NodePath.layer,
            ),
          ),
        );
        const writeFiber = yield* Effect.gen(function* () {
          const interruptingArtifacts = yield* Artifacts.Artifacts;
          return yield* interruptingArtifacts.writeBundle({
            source,
            output: ".preview",
            state: "default",
            viewport: "mobile",
            png: png(3),
            inspection: { files: inspectionFiles(4) },
          });
        }).pipe(Effect.provide(interruptingArtifactsLayer), Effect.forkChild);

        yield* Deferred.await(backupMoved);
        const interruptFiber = yield* Fiber.interrupt(writeFiber).pipe(
          Effect.forkChild,
        );
        yield* Deferred.succeed(continueSwap, undefined);
        const exit = yield* Fiber.await(writeFiber);
        yield* Fiber.join(interruptFiber);

        assertTrue(Exit.isFailure(exit));
        deepStrictEqual(
          Array.from(yield* fs.readFile(first.pngPath)),
          Array.from(png(3)),
        );
        deepStrictEqual(
          Array.from(yield* fs.readFile(first.inspection.overviewPath)),
          Array.from(png(4)),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("versions and retains an inspection bundle as one unit", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));
        const input = {
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          inspection: {
            files: inspectionFiles(2, [
              {
                path: "findings/errors/0001-test/finding.json",
                content: text("first nested finding"),
              },
            ]),
          },
          version: { retain: 1 },
        };
        const first = yield* artifacts.writeBundle(input);
        const same = yield* artifacts.writeBundle(input);
        strictEqual(first.pngPath, same.pngPath);

        const current = yield* artifacts.writeBundle({
          ...input,
          png: png(1),
          inspection: {
            files: inspectionFiles(2, [
              {
                path: "findings/errors/0001-test/finding.json",
                content: text("changed nested finding"),
              },
            ]),
          },
        });
        const directory = path.dirname(current.pngPath);
        const timestamp = "20260717T000000001Z";
        deepStrictEqual((yield* fs.readDirectory(directory)).toSorted(), [
          "viewport=mobile.inspect",
          `viewport=mobile.inspect@${timestamp}`,
          "viewport=mobile.png",
          `viewport=mobile@${timestamp}.png`,
        ]);
        for (const alias of [
          "viewport=mobile.png",
          "viewport=mobile.inspect",
        ]) {
          assertInclude(
            yield* fs.readLink(path.join(directory, alias)),
            timestamp,
          );
        }
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("rolls back both aliases when the inspection link fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const { writeBundle } = artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));
        const first = yield* writeBundle({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          inspection: { files: inspectionFiles(2) },
          version: { retain: 2 },
        });
        const directory = path.dirname(first.pngPath);
        const before = (yield* fs.readDirectory(directory)).toSorted();

        const error = yield* Effect.gen(function* () {
          const failing = yield* Artifacts.Artifacts;
          const { writeBundle: failingWriteBundle } = failing;
          return yield* Effect.flip(
            failingWriteBundle({
              source,
              output: ".preview",
              state: "default",
              viewport: "mobile",
              png: png(3),
              inspection: { files: inspectionFiles(4) },
              version: { retain: 2 },
            }),
          );
        }).pipe(Effect.provide(failingInspectionArtifactsLayer));

        strictEqual(error._tag, "PreviewWriteError");
        strictEqual(error.operation, "link");
        deepStrictEqual(
          (yield* fs.readDirectory(directory)).toSorted(),
          before,
        );
        strictEqual(
          yield* fs.readLink(path.join(directory, "viewport=mobile.png")),
          path.basename(first.pngPath),
        );
        strictEqual(
          yield* fs.readLink(path.join(directory, "viewport=mobile.inspect")),
          path.basename(first.inspection.directoryPath),
        );
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("moves inspection trees between regular and versioned output", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const { writeBundle } = artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        yield* TestClock.setTime(Date.UTC(2026, 6, 17));
        const input = {
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          inspection: { files: inspectionFiles(2) },
        };
        const regular = yield* writeBundle(input);
        const versioned = yield* writeBundle({
          ...input,
          version: { retain: 2 },
        });
        const directory = path.dirname(versioned.pngPath);
        strictEqual(
          yield* fs.readLink(path.join(directory, "viewport=mobile.inspect")),
          path.basename(versioned.inspection.directoryPath),
        );
        const disabled = yield* writeBundle({
          ...input,
          png: png(3),
          inspection: { files: inspectionFiles(4) },
        });
        strictEqual(disabled.pngPath, regular.pngPath);
        strictEqual(
          Result.isFailure(
            yield* Effect.result(
              fs.readLink(path.join(directory, "viewport=mobile.inspect")),
            ),
          ),
          true,
        );
        deepStrictEqual((yield* fs.readDirectory(directory)).toSorted(), [
          "viewport=mobile.inspect",
          "viewport=mobile.png",
        ]);

        yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(5),
        });
        deepStrictEqual(yield* fs.readDirectory(directory), [
          "viewport=mobile.png",
        ]);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect(
    "rejects unsafe inspection paths and removes legacy flat files",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const artifacts = yield* Artifacts.Artifacts;
          const { writeBundle } = artifacts;
          const root = yield* fs.makeTempDirectoryScoped();
          const source = path.join(root, "Card.preview.ts");
          const directory = path.join(
            artifacts.sourceDirectory(source, ".preview"),
            "default",
          );
          const outside = path.join(root, "escape.txt");
          const error = yield* Effect.flip(
            writeBundle({
              source,
              output: ".preview",
              state: "default",
              viewport: "mobile",
              png: png(1),
              inspection: {
                files: [
                  ...inspectionFiles(2),
                  { path: "../escape.txt", content: text("escape") },
                ],
              },
            }),
          );
          strictEqual(error._tag, "PreviewWriteError");
          strictEqual(yield* fs.exists(outside), false);

          yield* fs.makeDirectory(directory, { recursive: true });
          for (const name of [
            "viewport=mobile.inspect.html",
            "viewport=mobile.inspect.json",
            "viewport=mobile.inspect.png",
            "viewport=mobile.inspect-2.png",
            "viewport=mobile.inspect@20260717T000000000Z.html",
          ]) {
            yield* fs.writeFileString(path.join(directory, name), "legacy");
          }
          yield* writeBundle({
            source,
            output: ".preview",
            state: "default",
            viewport: "mobile",
            png: png(3),
            inspection: { files: inspectionFiles(4) },
          });
          deepStrictEqual((yield* fs.readDirectory(directory)).toSorted(), [
            "viewport=mobile.inspect",
            "viewport=mobile.png",
          ]);
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
          state: "default",
          viewport: "mobile",
          png: png(1),
          version: { retain: 10 },
        });
        const same = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          version: { retain: 10 },
        });
        const second = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(2),
          version: { retain: 10 },
        });
        yield* TestClock.setTime(time - 60_000);
        const third = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(3),
          version: { retain: 10 },
        });
        const reverted = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          version: { retain: 10 },
        });

        strictEqual(first, same);
        strictEqual(
          path.basename(first),
          "viewport=mobile@20260717T103045123Z.png",
        );
        strictEqual(
          path.basename(second),
          "viewport=mobile@20260717T103045124Z.png",
        );
        strictEqual(
          path.basename(third),
          "viewport=mobile@20260717T103045125Z.png",
        );
        strictEqual(
          path.basename(reverted),
          "viewport=mobile@20260717T103045126Z.png",
        );
        const alias = path.join(path.dirname(reverted), "viewport=mobile.png");
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
            state: "default",
            viewport: "mobile",
            png: png(value),
            version: { retain: 2 },
          });
        }

        const directory = path.join(
          artifacts.sourceDirectory(source, ".preview"),
          "default",
        );
        const names = (yield* fs.readDirectory(directory)).toSorted();
        deepStrictEqual(names, [
          "viewport=mobile.png",
          "viewport=mobile@20260717T000000001Z.png",
          "viewport=mobile@20260717T000000002Z.png",
        ]);
        strictEqual(
          yield* fs.readLink(path.join(directory, "viewport=mobile.png")),
          "viewport=mobile@20260717T000000002Z.png",
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
          state: "default",
          viewport: "mobile",
          png: png(1),
          version: { retain: 1 },
        });
        const alias = path.join(path.dirname(current), "viewport=mobile.png");

        const error = yield* Effect.gen(function* () {
          const failingArtifacts = yield* Artifacts.Artifacts;
          return yield* Effect.flip(
            failingArtifacts.write({
              source,
              output: ".preview",
              state: "default",
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
            "viewport=mobile.png",
            path.basename(current),
            "viewport=mobile@20260717T000000001Z.png",
          ].toSorted(),
        );

        yield* artifacts.cleanSource({
          source,
          output: ".preview",
          targets: [{ state: "default", viewport: "mobile" }],
          version: { retain: 1 },
        });
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(current))).toSorted(),
          ["viewport=mobile.png", path.basename(current)].toSorted(),
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
          state: "default",
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
              state: "default",
              viewport: "mobile",
              png: png(2),
              version: { retain: 1 },
            }),
          );
        }).pipe(Effect.provide(retentionFailureArtifactsLayer));

        strictEqual(error._tag, "PreviewWriteError");
        strictEqual(error.operation, "retain");
        const alias = path.join(path.dirname(first), "viewport=mobile.png");
        strictEqual(
          yield* fs.readLink(alias),
          "viewport=mobile@20260717T000000001Z.png",
        );
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(first))).toSorted(),
          [
            "viewport=mobile.png",
            "viewport=mobile@20260717T000000000Z.png",
            "viewport=mobile@20260717T000000001Z.png",
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
          state: "default",
          viewport: "mobile",
          png: png(1),
        });
        const versioned = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
          version: { retain: 2 },
        });
        strictEqual(yield* fs.readLink(regular), path.basename(versioned));

        const disabled = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(2),
        });
        strictEqual(disabled, regular);
        strictEqual(
          Result.isFailure(yield* Effect.result(fs.readLink(disabled))),
          true,
        );

        yield* artifacts.cleanSource({
          source,
          output: ".preview",
          targets: [{ state: "default", viewport: "mobile" }],
        });
        deepStrictEqual(
          (yield* fs.readDirectory(path.dirname(disabled))).toSorted(),
          ["viewport=mobile.png"],
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
          state: "default",
          viewport: "mobile",
          png: png(1),
        });
        const desktop = yield* artifacts.write({
          source: sourceA,
          output: ".preview",
          state: "default",
          viewport: "desktop",
          png: png(2),
          version: { retain: 2 },
        });
        const desktopAlias = path.join(
          path.dirname(desktop),
          "viewport=desktop.png",
        );
        const otherSource = yield* artifacts.write({
          source: sourceB,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(3),
        });
        const note = path.join(path.dirname(mobile), "notes.inspect.html");
        const nested = path.join(path.dirname(mobile), "notes", "keep.txt");
        yield* fs.writeFileString(note, "keep");
        yield* fs.makeDirectory(path.dirname(nested), { recursive: true });
        yield* fs.writeFileString(nested, "keep");

        yield* artifacts.cleanSource({
          source: sourceA,
          output: ".preview",
          targets: [{ state: "default", viewport: "mobile" }],
        });

        strictEqual(yield* fs.exists(mobile), true);
        strictEqual(yield* fs.exists(desktop), false);
        strictEqual(yield* fs.exists(desktopAlias), false);
        strictEqual(yield* fs.exists(otherSource), true);
        strictEqual(yield* fs.exists(note), false);
        strictEqual(yield* fs.exists(nested), false);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("cleans every stale entry from a source output directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "Card.preview.ts");
        const directory = artifacts.sourceDirectory(source, "src");
        const ordinaryPng = path.join(directory, "photo.png");
        const ordinaryHtml = path.join(directory, "notes.inspect.html");
        const nested = path.join(directory, "notes", "keep.txt");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFile(ordinaryPng, png(1));
        yield* fs.writeFileString(ordinaryHtml, "keep");
        yield* fs.makeDirectory(path.dirname(nested), { recursive: true });
        yield* fs.writeFileString(nested, "keep");

        yield* artifacts.cleanSource({
          source,
          output: "src",
          targets: [{ state: "default", viewport: "mobile" }],
        });

        strictEqual(yield* fs.exists(ordinaryPng), false);
        strictEqual(yield* fs.exists(ordinaryHtml), false);
        strictEqual(yield* fs.exists(nested), false);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("writes into a non-empty output directory without metadata", () =>
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

        const generated = yield* artifacts.write({
          source,
          output: "src",
          state: "default",
          viewport: "mobile",
          png: png(2),
        });

        strictEqual(yield* fs.exists(generated), true);
        strictEqual(yield* fs.exists(ordinaryPng), true);
        deepStrictEqual((yield* fs.readDirectory(directory)).toSorted(), [
          "default",
          "photo.png",
        ]);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("full clean removes stale output artifact files", () =>
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
          state: "default",
          viewport: "mobile",
          png: png(1),
        });
        const deletedBundle = yield* artifacts.writeBundle({
          source: deletedSource,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(2),
          inspection: {
            files: inspectionFiles(5),
          },
        });
        const deleted = deletedBundle.pngPath;
        const deletedInspection = deletedBundle.inspection;
        const oldOutput = yield* artifacts.write({
          source: activeSource,
          output: "old/previews",
          state: "default",
          viewport: "mobile",
          png: png(3),
        });
        const flat = path.join(
          path.dirname(activeSource),
          ".preview",
          "Legacy.mobile.png",
        );
        const note = path.join(path.dirname(deleted), "notes.inspect.json");
        const nested = path.join(path.dirname(deleted), "notes", "keep.txt");
        yield* fs.writeFile(flat, png(4));
        yield* fs.writeFileString(note, "keep");
        yield* fs.makeDirectory(path.dirname(nested), { recursive: true });
        yield* fs.writeFileString(nested, "keep");

        yield* artifacts.cleanProject({
          root,
          outputs: [".preview", "old/previews"],
          activeSources: [{ source: activeSource, output: ".preview" }],
        });

        strictEqual(yield* fs.exists(active), true);
        strictEqual(yield* fs.exists(deleted), false);
        strictEqual(yield* fs.exists(deletedInspection.directoryPath), false);
        strictEqual(yield* fs.exists(deletedInspection.readmePath), false);
        strictEqual(yield* fs.exists(deletedInspection.overviewPath), false);
        strictEqual(yield* fs.exists(oldOutput), false);
        strictEqual(yield* fs.exists(flat), false);
        strictEqual(yield* fs.exists(note), false);
        strictEqual(yield* fs.exists(nested), false);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("full clean removes output for a custom source suffix", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "src", "Card.story.tsx");
        const generated = yield* artifacts.write({
          source,
          output: ".preview",
          state: "default",
          viewport: "mobile",
          png: png(1),
        });

        yield* artifacts.cleanProject({
          root,
          outputs: [".preview"],
          activeSources: [],
        });

        strictEqual(yield* fs.exists(generated), false);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("full clean removes legacy output without a state directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const artifacts = yield* Artifacts.Artifacts;
        const root = yield* fs.makeTempDirectoryScoped();
        const output = path.join(root, "src", ".preview");
        const legacy = path.join(output, "Card.preview.ts", "mobile.png");
        yield* fs.makeDirectory(path.dirname(legacy), { recursive: true });
        yield* fs.writeFile(legacy, png(1));

        deepStrictEqual(
          [...(yield* artifacts.outputDirectories(root, [".preview"]))],
          [output],
        );
        yield* artifacts.cleanProject({
          root,
          outputs: [".preview"],
          activeSources: [],
        });

        strictEqual(yield* fs.exists(legacy), false);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect("cleans every entry throughout an inactive output directory", () =>
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
          state: "default",
          viewport: "mobile",
          png: png(2),
        });

        yield* artifacts.cleanProject({
          root,
          outputs: ["src"],
          activeSources: [],
        });

        strictEqual(yield* fs.exists(generated), false);
        strictEqual(yield* fs.exists(ordinarySource), false);
        strictEqual(yield* fs.exists(ordinaryPng), false);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );

  it.effect(
    "does not clean a custom output name until it has Preview artifact structure",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const artifacts = yield* Artifacts.Artifacts;
          const root = yield* fs.makeTempDirectoryScoped();
          const ordinarySource = path.join(root, "src", "Keep.ts", "source.ts");
          const ordinaryPng = path.join(root, "src", "logo.png");
          yield* fs.makeDirectory(path.dirname(ordinarySource), {
            recursive: true,
          });
          yield* fs.writeFileString(ordinarySource, "export default undefined");
          yield* fs.writeFile(ordinaryPng, png(1));

          yield* artifacts.cleanProject({
            root,
            outputs: ["src"],
            activeSources: [],
          });

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
        const ignoredSource = path.join(sourceDirectory, "ignored.preview.tsx");
        const defaultOutputSource = path.join(
          outputDirectory,
          "real.preview.tsx",
        );
        const customOutputSource = path.join(
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
          state: "default",
          viewport: "mobile",
          png: png(1),
        });
        yield* artifacts.write({
          source: path.join(sourceDirectory, "Generated.preview.tsx"),
          output: "artifacts/previews",
          state: "default",
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
            defaultOutputSource,
            customOutputSource,
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
        const filteredByGlob = yield* discovery.discover(root, customConfig, [
          "other/*.preview.ts",
        ]);

        deepStrictEqual(discovered, [
          sourceC,
          sourceA,
          sourceB,
          sourceJavaScript,
          sourceJsx,
        ]);
        deepStrictEqual(filteredByDirectory, [
          sourceA,
          sourceB,
          sourceJavaScript,
          sourceJsx,
        ]);
        deepStrictEqual(filteredByGlob, [sourceC]);
      }),
    ).pipe(Effect.provide(infrastructureLayer)),
  );
});
