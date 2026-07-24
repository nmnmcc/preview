import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Inspection from "../../inspection";
import * as PreviewSchema from "../../schema";

const VersionTimestampPattern = /^\d{8}T\d{9}Z$/u;
const GeneratedArtifactIdentityPattern =
  "(?:[a-z0-9][a-z0-9_,=-]*,)?viewport=[a-z0-9][a-z0-9_-]*";
const GeneratedArtifactNamePattern = new RegExp(
  `^${GeneratedArtifactIdentityPattern}(?:\\.png|@\\d{8}T\\d{9}Z\\.png)$`,
  "iu",
);
const GeneratedLegacySourceDirectoryPattern = /\.[cm]?[jt]sx?$/iu;
const GeneratedLegacyArtifactNamePattern = new RegExp(
  `^(?:[a-z0-9][a-z0-9_,=-]*\\.)?[a-z0-9][a-z0-9_-]*(?:@\\d{8}T\\d{9}Z)?\\.png$`,
  "iu",
);

const ArtifactOperation = Schema.Literals(["read", "write", "link", "retain"]);

export class PreviewWriteError extends Schema.TaggedErrorClass<PreviewWriteError>(
  "@nmnmcc/preview/PreviewWriteError",
)("PreviewWriteError", {
  operation: ArtifactOperation,
  path: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not ${this.operation} preview artifact ${this.path}`;
  }
}

export class PreviewCleanError extends Schema.TaggedErrorClass<PreviewCleanError>(
  "@nmnmcc/preview/PreviewCleanError",
)("PreviewCleanError", {
  path: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not clean stale preview artifacts at ${this.path}`;
  }
}

class InvalidInspectionFiles extends Schema.TaggedErrorClass<InvalidInspectionFiles>(
  "@nmnmcc/preview/InvalidInspectionFiles",
)("InvalidInspectionFiles", {
  detail: Schema.String,
}) {}

export interface VersionOptions {
  readonly retain: number;
}

export interface Target {
  readonly state: string;
  readonly viewport: string;
  readonly variant?: string;
  readonly inspect?: boolean;
}

export interface WriteInput extends Target {
  readonly source: string;
  readonly output: string;
  readonly png: Uint8Array;
  readonly version?: VersionOptions;
}

export type InspectionArtifactFile = Inspection.ArtifactFile;

export interface InspectionWriteInput {
  readonly files: ReadonlyArray<InspectionArtifactFile>;
}

export interface WriteBundleInput extends WriteInput {
  readonly inspection: InspectionWriteInput;
}

export interface WrittenInspection {
  readonly directoryPath: string;
  readonly readmePath: string;
  readonly manifestPath: string;
  readonly overviewPath: string;
}

export interface WriteBundleResult {
  readonly pngPath: string;
  readonly inspection: WrittenInspection;
}

export interface CleanSourceInput {
  readonly source: string;
  readonly output: string;
  readonly targets: ReadonlyArray<Target>;
  readonly version?: VersionOptions;
}

export interface ActiveSource {
  readonly source: string;
  readonly output: string;
}

export interface CleanProjectInput {
  readonly root: string;
  readonly outputs: ReadonlyArray<string>;
  readonly activeSources: ReadonlyArray<ActiveSource>;
}

export interface Interface {
  readonly cleanProject: (
    input: CleanProjectInput,
  ) => Effect.Effect<void, PreviewCleanError>;
  readonly cleanSource: (
    input: CleanSourceInput,
  ) => Effect.Effect<void, PreviewCleanError>;
  readonly isPathInDirectory: (file: string, directory: string) => boolean;
  readonly outputDirectories: (
    root: string,
    outputs: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlySet<string>, PreviewCleanError>;
  readonly outputDirectory: (source: string, output: string) => string;
  readonly sourceDirectory: (source: string, output: string) => string;
  readonly write: (
    input: WriteInput,
  ) => Effect.Effect<string, PreviewWriteError>;
  readonly writeBundle: (
    input: WriteBundleInput,
  ) => Effect.Effect<WriteBundleResult, PreviewWriteError>;
}

export class Artifacts extends Context.Service<Artifacts, Interface>()(
  "@nmnmcc/preview/PreviewArtifacts",
) {}

interface VersionFile {
  readonly millis: number;
  readonly name: string;
  readonly timestamp: string;
}

const identity = (target: Target): string =>
  target.variant === undefined
    ? `viewport=${target.viewport}`
    : `${target.variant},viewport=${target.viewport}`;

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const timestampFromMillis = (millis: number): string =>
  new Date(millis)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "");

const millisFromTimestamp = (timestamp: string): number | undefined => {
  if (!VersionTimestampPattern.test(timestamp)) return undefined;
  const iso = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.${timestamp.slice(15, 18)}Z`;
  const millis = Date.parse(iso);
  return Number.isFinite(millis) && timestampFromMillis(millis) === timestamp
    ? millis
    : undefined;
};

const escapePattern = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const versionFile = (
  artifactIdentity: string,
  name: string,
): VersionFile | undefined => {
  const match = new RegExp(
    `^${escapePattern(artifactIdentity)}@(\\d{8}T\\d{9}Z)\\.png$`,
    "u",
  ).exec(name);
  const timestamp = match?.[1];
  if (timestamp === undefined) return undefined;
  const millis = millisFromTimestamp(timestamp);
  return millis === undefined ? undefined : { millis, name, timestamp };
};

const inspectionVersion = (
  artifactIdentity: string,
  name: string,
): VersionFile | undefined => {
  const match = new RegExp(
    `^${escapePattern(artifactIdentity)}\\.inspect@(\\d{8}T\\d{9}Z)$`,
    "u",
  ).exec(name);
  const timestamp = match?.[1];
  if (timestamp === undefined) return undefined;
  const millis = millisFromTimestamp(timestamp);
  return millis === undefined ? undefined : { millis, name, timestamp };
};

const versionsFor = (
  artifactIdentity: string,
  names: ReadonlyArray<string>,
): ReadonlyArray<VersionFile> =>
  names
    .flatMap((name) => {
      const version = versionFile(artifactIdentity, name);
      return version === undefined ? [] : [version];
    })
    .toSorted((left, right) => right.timestamp.localeCompare(left.timestamp));

const bundleTimestamps = (
  artifactIdentity: string,
  names: ReadonlyArray<string>,
): ReadonlyArray<{ readonly millis: number; readonly timestamp: string }> => {
  const clean = new Set(
    names.flatMap((name) => {
      const version = versionFile(artifactIdentity, name);
      return version === undefined ? [] : [version.timestamp];
    }),
  );
  const inspection = new Set(
    names.flatMap((name) => {
      const version = inspectionVersion(artifactIdentity, name);
      return version === undefined ? [] : [version.timestamp];
    }),
  );
  return [...clean]
    .filter((timestamp) => inspection.has(timestamp))
    .flatMap((timestamp) => {
      const millis = millisFromTimestamp(timestamp);
      return millis === undefined ? [] : [{ millis, timestamp }];
    })
    .toSorted((left, right) => right.timestamp.localeCompare(left.timestamp));
};

const allVersionMillis = (
  artifactIdentity: string,
  names: ReadonlyArray<string>,
): ReadonlyArray<number> =>
  names.flatMap((name) => {
    const version =
      versionFile(artifactIdentity, name) ??
      inspectionVersion(artifactIdentity, name);
    return version === undefined ? [] : [version.millis];
  });

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

const validateInspectionFiles = Effect.fnUntraced(function* (input: unknown) {
  const files = yield* Schema.decodeUnknownEffect(Inspection.ArtifactFiles)(
    input,
  );
  const required = new Set([
    "README.md",
    "manifest.json",
    "capture.json",
    "nodes.json",
    "checks.json",
    "overview.png",
  ]);
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) {
      return yield* new InvalidInspectionFiles({
        detail: `Inspection file path is repeated: ${file.path}`,
      });
    }
    seen.add(file.path);
    required.delete(file.path);
  }
  if (required.size > 0) {
    return yield* new InvalidInspectionFiles({
      detail: `Inspection files are missing: ${[...required].join(", ")}`,
    });
  }
  return files.toSorted((left, right) => left.path.localeCompare(right.path));
});

export const layer = Layer.effect(
  Artifacts,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const outputDirectory = (source: string, output: string): string =>
      path.join(path.dirname(source), output);
    const sourceDirectory = (source: string, output: string): string =>
      path.join(outputDirectory(source, output), path.basename(source));
    const stateDirectory = (
      source: string,
      output: string,
      state: string,
    ): string => path.join(sourceDirectory(source, output), state);
    const isPathInDirectory = (file: string, directory: string): boolean => {
      const resolvedFile = path.resolve(file);
      const resolvedDirectory = path.resolve(directory);
      return (
        resolvedFile === resolvedDirectory ||
        resolvedFile.startsWith(`${resolvedDirectory}${path.sep}`)
      );
    };

    const writeError = (
      operation: typeof ArtifactOperation.Type,
      target: string,
    ) =>
      Effect.mapError(
        (cause) => new PreviewWriteError({ operation, path: target, cause }),
      );
    const cleanError = (target: string) =>
      Effect.mapError(
        (cause) => new PreviewCleanError({ path: target, cause }),
      );
    const removeForWrite = (
      target: string,
      operation: typeof ArtifactOperation.Type = "write",
    ): Effect.Effect<void, PreviewWriteError> =>
      fs
        .remove(target, { force: true, recursive: true })
        .pipe(writeError(operation, target));
    const removeForClean = (target: string) =>
      fs
        .remove(target, { force: true, recursive: true })
        .pipe(cleanError(target));

    const readDirectoryForWrite = Effect.fnUntraced(function* (
      directory: string,
    ) {
      return yield* fs.readDirectory(directory).pipe(
        Effect.catch((cause) =>
          isNotFound(cause)
            ? Effect.succeed([])
            : Effect.fail(
                new PreviewWriteError({
                  operation: "read",
                  path: directory,
                  cause,
                }),
              ),
        ),
      );
    });
    const readDirectoryForClean = Effect.fnUntraced(function* (
      directory: string,
    ) {
      return yield* fs
        .readDirectory(directory)
        .pipe(
          Effect.catch((cause) =>
            isNotFound(cause)
              ? Effect.succeed([])
              : Effect.fail(new PreviewCleanError({ path: directory, cause })),
          ),
        );
    });

    const writeAtomic = Effect.fnUntraced(function* (
      destination: string,
      content: Uint8Array,
    ) {
      const directory = path.dirname(destination);
      yield* fs
        .makeDirectory(directory, { recursive: true })
        .pipe(writeError("write", directory));
      const temporary = yield* fs
        .makeTempFileScoped({
          directory,
          prefix: `.${path.basename(destination)}.`,
          suffix: ".tmp",
        })
        .pipe(writeError("write", directory));
      yield* fs
        .writeFile(temporary, content)
        .pipe(writeError("write", temporary));
      yield* fs
        .rename(temporary, destination)
        .pipe(writeError("write", destination));
    }, Effect.scoped);

    const linkAtomic = Effect.fnUntraced(function* (
      destination: string,
      relativeTarget: string,
    ) {
      const directory = path.dirname(destination);
      yield* fs
        .makeDirectory(directory, { recursive: true })
        .pipe(writeError("link", directory));
      const temporary = yield* fs
        .makeTempFileScoped({
          directory,
          prefix: `.${path.basename(destination)}.`,
          suffix: ".tmp",
        })
        .pipe(writeError("link", directory));
      yield* fs.remove(temporary).pipe(writeError("link", temporary));
      yield* fs
        .symlink(relativeTarget, temporary)
        .pipe(writeError("link", destination));
      yield* fs
        .rename(temporary, destination)
        .pipe(writeError("link", destination));
    }, Effect.scoped);

    const readOptionalFile = Effect.fnUntraced(function* (target: string) {
      return yield* fs.readFile(target).pipe(
        Effect.map((content): Uint8Array | undefined => content),
        Effect.catch((cause) =>
          isNotFound(cause)
            ? Effect.void
            : Effect.fail(
                new PreviewWriteError({
                  operation: "read",
                  path: target,
                  cause,
                }),
              ),
        ),
      );
    });

    const currentVersionForWrite = Effect.fnUntraced(function* (
      alias: string,
      versions: ReadonlyArray<VersionFile>,
    ) {
      const link = yield* Effect.result(fs.readLink(alias));
      if (Result.isSuccess(link)) {
        return versions.find(({ name }) => name === link.success);
      }
      const content = yield* readOptionalFile(alias);
      return content === undefined ? versions[0] : undefined;
    });

    const currentVersionForClean = Effect.fnUntraced(function* (
      alias: string,
      versions: ReadonlyArray<VersionFile>,
    ) {
      const link = yield* Effect.result(fs.readLink(alias));
      if (Result.isSuccess(link)) {
        return versions.find(({ name }) => name === link.success)?.name;
      }
      const file = yield* Effect.result(fs.readFile(alias));
      if (Result.isSuccess(file) || isNotFound(file.failure)) return undefined;
      return yield* new PreviewCleanError({ path: alias, cause: file.failure });
    });

    const removeLegacyInspection = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
    ) {
      const names = yield* readDirectoryForWrite(directory);
      const pattern = new RegExp(
        `^${escapePattern(artifactIdentity)}\\.inspect(?:-\\d+)?(?:@\\d{8}T\\d{9}Z)?\\.(?:html|json|png)$`,
        "u",
      );
      yield* Effect.forEach(
        names.filter((name) => pattern.test(name)),
        (name) => removeForWrite(path.join(directory, name)),
        { concurrency: "unbounded", discard: true },
      );
    });

    const pruneRegularForWrite = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
      retain: number,
      currentName: string,
    ) {
      const names = yield* readDirectoryForWrite(directory);
      const versions = versionsFor(artifactIdentity, names);
      const current = versions.find(({ name }) => name === currentName);
      const eligible =
        current === undefined
          ? versions
          : versions.filter(({ millis }) => millis <= current.millis);
      const keep = new Set(eligible.slice(0, retain).map(({ name }) => name));
      yield* Effect.forEach(
        versions.filter(({ name }) => !keep.has(name)),
        ({ name }) => removeForWrite(path.join(directory, name), "retain"),
        { concurrency: "unbounded", discard: true },
      );
    });

    const clearInspectionForRegular = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
    ) {
      const names = yield* readDirectoryForWrite(directory);
      yield* Effect.forEach(
        names.filter(
          (name) =>
            name === `${artifactIdentity}.inspect` ||
            inspectionVersion(artifactIdentity, name) !== undefined,
        ),
        (name) => removeForWrite(path.join(directory, name)),
        { concurrency: "unbounded", discard: true },
      );
      yield* removeLegacyInspection(directory, artifactIdentity);
    });

    const write = Effect.fn("PreviewArtifacts.write")(function* (
      input: WriteInput,
    ) {
      const directory = stateDirectory(input.source, input.output, input.state);
      const artifactIdentity = identity(input);
      const alias = path.join(directory, `${artifactIdentity}.png`);
      if (input.version === undefined) {
        yield* writeAtomic(alias, input.png);
        yield* clearInspectionForRegular(directory, artifactIdentity);
        const names = yield* readDirectoryForWrite(directory);
        yield* Effect.forEach(
          versionsFor(artifactIdentity, names),
          ({ name }) => removeForWrite(path.join(directory, name)),
          { concurrency: "unbounded", discard: true },
        );
        return alias;
      }

      const names = yield* readDirectoryForWrite(directory);
      const versions = versionsFor(artifactIdentity, names);
      const current = yield* currentVersionForWrite(alias, versions);
      if (current !== undefined) {
        const currentPath = path.join(directory, current.name);
        const currentPng = yield* fs
          .readFile(currentPath)
          .pipe(writeError("read", currentPath));
        if (sameBytes(currentPng, input.png)) {
          yield* linkAtomic(alias, current.name);
          yield* clearInspectionForRegular(directory, artifactIdentity);
          yield* pruneRegularForWrite(
            directory,
            artifactIdentity,
            input.version.retain,
            current.name,
          );
          return currentPath;
        }
      }
      const newestMillis = Math.max(
        -1,
        ...allVersionMillis(artifactIdentity, names),
      );
      const now = Math.trunc(yield* Clock.currentTimeMillis);
      const timestamp = yield* Effect.try({
        try: () => timestampFromMillis(Math.max(now, newestMillis + 1)),
        catch: (cause) =>
          new PreviewWriteError({ operation: "write", path: alias, cause }),
      });
      const versionName = `${artifactIdentity}@${timestamp}.png`;
      const versionPath = path.join(directory, versionName);
      yield* writeAtomic(versionPath, input.png);
      yield* linkAtomic(alias, versionName);
      yield* clearInspectionForRegular(directory, artifactIdentity);
      yield* pruneRegularForWrite(
        directory,
        artifactIdentity,
        input.version.retain,
        versionName,
      );
      return versionPath;
    });

    const stageTree = Effect.fnUntraced(function* (
      directory: string,
      files: ReadonlyArray<InspectionArtifactFile>,
    ) {
      yield* fs
        .makeDirectory(directory, { recursive: true })
        .pipe(writeError("write", directory));
      yield* Effect.forEach(
        files,
        (file) => {
          const target = path.join(directory, ...file.path.split("/"));
          return fs
            .makeDirectory(path.dirname(target), { recursive: true })
            .pipe(
              writeError("write", path.dirname(target)),
              Effect.andThen(
                fs
                  .writeFile(target, file.content)
                  .pipe(writeError("write", target)),
              ),
            );
        },
        { concurrency: 1, discard: true },
      );
    });

    const moveIfExists = Effect.fnUntraced(function* (
      source: string,
      destination: string,
      operation: typeof ArtifactOperation.Type,
    ) {
      return yield* fs.rename(source, destination).pipe(
        Effect.as(true),
        Effect.catch((cause) =>
          isNotFound(cause)
            ? Effect.succeed(false)
            : Effect.fail(
                new PreviewWriteError({
                  operation,
                  path: source,
                  cause,
                }),
              ),
        ),
      );
    });

    const swapStaged = Effect.fnUntraced(function* (
      temporaryRoot: string,
      entries: ReadonlyArray<{
        readonly staged: string;
        readonly destination: string;
      }>,
      operation: typeof ArtifactOperation.Type,
    ) {
      const backups: Array<{ destination: string; backup: string }> = [];
      const committed: Array<string> = [];
      const result = yield* Effect.result(
        Effect.gen(function* () {
          for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            if (entry === undefined) continue;
            const backup = path.join(temporaryRoot, `backup-${index}`);
            if (yield* moveIfExists(entry.destination, backup, operation)) {
              backups.push({ destination: entry.destination, backup });
            }
          }
          for (const entry of entries) {
            yield* fs
              .rename(entry.staged, entry.destination)
              .pipe(writeError(operation, entry.destination));
            committed.push(entry.destination);
          }
        }),
      );
      if (Result.isSuccess(result)) return;
      yield* Effect.forEach(
        committed.toReversed(),
        (target) => removeForWrite(target, operation).pipe(Effect.ignore),
        { concurrency: 1, discard: true },
      );
      yield* Effect.forEach(
        backups.toReversed(),
        ({ backup, destination }) =>
          fs.rename(backup, destination).pipe(Effect.ignore),
        { concurrency: 1, discard: true },
      );
      return yield* result.failure;
    }, Effect.uninterruptible);

    const directoryMatches = Effect.fnUntraced(function* (
      directory: string,
      files: ReadonlyArray<InspectionArtifactFile>,
    ) {
      const entries = yield* fs
        .readDirectory(directory, { recursive: true })
        .pipe(writeError("read", directory));
      const actualFiles = yield* Effect.forEach(
        entries,
        (entry) => {
          const target = path.join(directory, entry);
          return fs.stat(target).pipe(
            Effect.map((info) =>
              info.type === "File" ? entry.replaceAll("\\", "/") : undefined,
            ),
            writeError("read", target),
          );
        },
        { concurrency: "unbounded" },
      );
      const actual = actualFiles
        .filter((entry): entry is string => entry !== undefined)
        .toSorted();
      const expected = files.map(({ path: filePath }) => filePath).toSorted();
      if (
        actual.length !== expected.length ||
        actual.some((entry, index) => entry !== expected[index])
      ) {
        return false;
      }
      for (const file of files) {
        const current = yield* fs
          .readFile(path.join(directory, ...file.path.split("/")))
          .pipe(writeError("read", directory));
        if (!sameBytes(current, file.content)) return false;
      }
      return true;
    });

    const removeIncompleteBundles = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
    ) {
      const names = yield* readDirectoryForWrite(directory);
      const complete = new Set(
        bundleTimestamps(artifactIdentity, names).map(
          ({ timestamp }) => timestamp,
        ),
      );
      yield* Effect.forEach(
        names.filter((name) => {
          const version =
            versionFile(artifactIdentity, name) ??
            inspectionVersion(artifactIdentity, name);
          return version !== undefined && !complete.has(version.timestamp);
        }),
        (name) => removeForWrite(path.join(directory, name)),
        { concurrency: "unbounded", discard: true },
      );
    });

    const pruneBundleForWrite = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
      retain: number,
      currentTimestamp: string,
    ) {
      yield* removeIncompleteBundles(directory, artifactIdentity);
      const names = yield* readDirectoryForWrite(directory);
      const versions = bundleTimestamps(artifactIdentity, names);
      const current = versions.find(
        ({ timestamp }) => timestamp === currentTimestamp,
      );
      const eligible =
        current === undefined
          ? versions
          : versions.filter(({ millis }) => millis <= current.millis);
      const keep = new Set(
        eligible.slice(0, retain).map(({ timestamp }) => timestamp),
      );
      yield* Effect.forEach(
        versions.filter(({ timestamp }) => !keep.has(timestamp)),
        ({ timestamp }) =>
          Effect.all(
            [
              removeForWrite(
                path.join(directory, `${artifactIdentity}@${timestamp}.png`),
                "retain",
              ),
              removeForWrite(
                path.join(
                  directory,
                  `${artifactIdentity}.inspect@${timestamp}`,
                ),
                "retain",
              ),
            ],
            { discard: true },
          ),
        { concurrency: 1, discard: true },
      );
    });

    const writtenInspection = (directoryPath: string): WrittenInspection => ({
      directoryPath,
      readmePath: path.join(directoryPath, "README.md"),
      manifestPath: path.join(directoryPath, "manifest.json"),
      overviewPath: path.join(directoryPath, "overview.png"),
    });

    const writeBundle = Effect.fn("PreviewArtifacts.writeBundle")(function* (
      input: WriteBundleInput,
    ) {
      const files = yield* validateInspectionFiles(input.inspection.files).pipe(
        Effect.mapError(
          (cause) =>
            new PreviewWriteError({
              operation: "write",
              path: input.output,
              cause,
            }),
        ),
      );
      const directory = stateDirectory(input.source, input.output, input.state);
      const artifactIdentity = identity(input);
      const cleanAlias = path.join(directory, `${artifactIdentity}.png`);
      const inspectionAlias = path.join(
        directory,
        `${artifactIdentity}.inspect`,
      );
      yield* fs
        .makeDirectory(directory, { recursive: true })
        .pipe(writeError("write", directory));

      if (input.version === undefined) {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const temporaryRoot = yield* fs
              .makeTempDirectoryScoped({
                directory,
                prefix: `.${artifactIdentity}.`,
              })
              .pipe(writeError("write", directory));
            const stagedPng = path.join(temporaryRoot, "capture.png");
            const stagedInspection = path.join(temporaryRoot, "inspection");
            yield* fs
              .writeFile(stagedPng, input.png)
              .pipe(writeError("write", stagedPng));
            yield* stageTree(stagedInspection, files);
            yield* swapStaged(
              temporaryRoot,
              [
                { staged: stagedPng, destination: cleanAlias },
                { staged: stagedInspection, destination: inspectionAlias },
              ],
              "write",
            );
          }),
        );
        const names = yield* readDirectoryForWrite(directory);
        yield* Effect.forEach(
          names.filter(
            (name) =>
              versionFile(artifactIdentity, name) !== undefined ||
              inspectionVersion(artifactIdentity, name) !== undefined,
          ),
          (name) => removeForWrite(path.join(directory, name)),
          { concurrency: "unbounded", discard: true },
        );
        yield* removeLegacyInspection(directory, artifactIdentity);
        return {
          pngPath: cleanAlias,
          inspection: writtenInspection(inspectionAlias),
        };
      }

      const names = yield* readDirectoryForWrite(directory);
      const cleanLink = yield* Effect.result(fs.readLink(cleanAlias));
      const inspectionLink = yield* Effect.result(fs.readLink(inspectionAlias));
      const currentClean = Result.isSuccess(cleanLink)
        ? versionFile(artifactIdentity, cleanLink.success)
        : undefined;
      const currentInspection = Result.isSuccess(inspectionLink)
        ? inspectionVersion(artifactIdentity, inspectionLink.success)
        : undefined;
      let timestamp =
        currentClean?.timestamp === currentInspection?.timestamp
          ? currentClean?.timestamp
          : undefined;
      let reuse = false;
      if (timestamp !== undefined && currentClean !== undefined) {
        const cleanPath = path.join(directory, currentClean.name);
        const currentPng = yield* fs
          .readFile(cleanPath)
          .pipe(writeError("read", cleanPath));
        reuse =
          sameBytes(currentPng, input.png) &&
          (yield* directoryMatches(
            path.join(directory, `${artifactIdentity}.inspect@${timestamp}`),
            files,
          ));
      }

      let cleanVersionName: string;
      let inspectionVersionName: string;
      if (reuse && timestamp !== undefined) {
        cleanVersionName = `${artifactIdentity}@${timestamp}.png`;
        inspectionVersionName = `${artifactIdentity}.inspect@${timestamp}`;
      } else {
        const newestMillis = Math.max(
          -1,
          ...allVersionMillis(artifactIdentity, names),
        );
        const now = Math.trunc(yield* Clock.currentTimeMillis);
        timestamp = yield* Effect.try({
          try: () => timestampFromMillis(Math.max(now, newestMillis + 1)),
          catch: (cause) =>
            new PreviewWriteError({
              operation: "write",
              path: cleanAlias,
              cause,
            }),
        });
        cleanVersionName = `${artifactIdentity}@${timestamp}.png`;
        inspectionVersionName = `${artifactIdentity}.inspect@${timestamp}`;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const temporaryRoot = yield* fs
              .makeTempDirectoryScoped({
                directory,
                prefix: `.${artifactIdentity}.`,
              })
              .pipe(writeError("write", directory));
            const stagedPng = path.join(temporaryRoot, "capture.png");
            const stagedInspection = path.join(temporaryRoot, "inspection");
            yield* fs
              .writeFile(stagedPng, input.png)
              .pipe(writeError("write", stagedPng));
            yield* stageTree(stagedInspection, files);
            yield* swapStaged(
              temporaryRoot,
              [
                {
                  staged: stagedPng,
                  destination: path.join(directory, cleanVersionName),
                },
                {
                  staged: stagedInspection,
                  destination: path.join(directory, inspectionVersionName),
                },
              ],
              "write",
            );
          }),
        );
      }

      const linkResult = yield* Effect.result(
        Effect.scoped(
          Effect.gen(function* () {
            const temporaryRoot = yield* fs
              .makeTempDirectoryScoped({
                directory,
                prefix: `.${artifactIdentity}.links.`,
              })
              .pipe(writeError("link", directory));
            const cleanStage = path.join(temporaryRoot, "clean");
            const inspectionStage = path.join(temporaryRoot, "inspection");
            yield* fs
              .symlink(cleanVersionName, cleanStage)
              .pipe(writeError("link", cleanAlias));
            yield* fs
              .symlink(inspectionVersionName, inspectionStage)
              .pipe(writeError("link", inspectionAlias));
            yield* swapStaged(
              temporaryRoot,
              [
                { staged: cleanStage, destination: cleanAlias },
                { staged: inspectionStage, destination: inspectionAlias },
              ],
              "link",
            );
          }),
        ),
      );
      if (Result.isFailure(linkResult)) {
        if (!reuse) {
          yield* Effect.all(
            [
              removeForWrite(path.join(directory, cleanVersionName)),
              removeForWrite(path.join(directory, inspectionVersionName)),
            ],
            { discard: true },
          ).pipe(Effect.ignore);
        }
        return yield* linkResult.failure;
      }
      yield* removeLegacyInspection(directory, artifactIdentity);
      yield* pruneBundleForWrite(
        directory,
        artifactIdentity,
        input.version.retain,
        timestamp,
      );
      const inspectionPath = path.join(directory, inspectionVersionName);
      return {
        pngPath: path.join(directory, cleanVersionName),
        inspection: writtenInspection(inspectionPath),
      };
    });

    const cleanState = Effect.fnUntraced(function* (
      directory: string,
      targets: ReadonlyArray<Target>,
      version: VersionOptions | undefined,
    ) {
      const names = yield* readDirectoryForClean(directory);
      const keep = new Set<string>();
      for (const target of targets) {
        const artifactIdentity = identity(target);
        keep.add(`${artifactIdentity}.png`);
        if (target.inspect === true) keep.add(`${artifactIdentity}.inspect`);
        if (version === undefined) continue;

        if (target.inspect === true) {
          const complete = bundleTimestamps(artifactIdentity, names);
          const link = yield* Effect.result(
            fs.readLink(path.join(directory, `${artifactIdentity}.png`)),
          );
          const current = Result.isSuccess(link)
            ? versionFile(artifactIdentity, link.success)
            : undefined;
          const eligible =
            current === undefined
              ? complete
              : complete.filter(({ millis }) => millis <= current.millis);
          for (const { timestamp } of eligible.slice(0, version.retain)) {
            keep.add(`${artifactIdentity}@${timestamp}.png`);
            keep.add(`${artifactIdentity}.inspect@${timestamp}`);
          }
        } else {
          const versions = versionsFor(artifactIdentity, names);
          const currentName = yield* currentVersionForClean(
            path.join(directory, `${artifactIdentity}.png`),
            versions,
          );
          const current = versions.find(({ name }) => name === currentName);
          const eligible =
            current === undefined
              ? versions
              : versions.filter(({ millis }) => millis <= current.millis);
          for (const { name } of eligible.slice(0, version.retain))
            keep.add(name);
        }
      }
      yield* Effect.forEach(
        names.filter((name) => !keep.has(name)),
        (name) => removeForClean(path.join(directory, name)),
        { concurrency: "unbounded", discard: true },
      );
    });

    const cleanSource = Effect.fn("PreviewArtifacts.cleanSource")(function* (
      input: CleanSourceInput,
    ) {
      const directory = sourceDirectory(input.source, input.output);
      const targetsByState = new Map<string, Array<Target>>();
      for (const target of input.targets) {
        const targets = targetsByState.get(target.state) ?? [];
        targets.push(target);
        targetsByState.set(target.state, targets);
      }
      yield* Effect.forEach(
        targetsByState,
        ([state, targets]) =>
          cleanState(
            stateDirectory(input.source, input.output, state),
            targets,
            input.version,
          ),
        { concurrency: 1, discard: true },
      );
      const activeStates = new Set(targetsByState.keys());
      const names = yield* readDirectoryForClean(directory);
      yield* Effect.forEach(
        names.filter((name) => !activeStates.has(name)),
        (name) => removeForClean(path.join(directory, name)),
        { concurrency: "unbounded", discard: true },
      );
    });

    const outputDirectories = Effect.fn("PreviewArtifacts.outputDirectories")(
      function* (root: string, outputs: ReadonlyArray<string>) {
        const uniqueOutputs = [...new Set(outputs)];
        const entries = yield* Effect.forEach(
          uniqueOutputs,
          (output) => {
            const normalizedOutput = output.replaceAll("\\", "/");
            return fs
              .glob(`**/${normalizedOutput}/**/*`, {
                root,
                exclude: ["**/node_modules/**"],
              })
              .pipe(cleanError(path.resolve(root, normalizedOutput)));
          },
          { concurrency: "unbounded" },
        );
        const resolvedRoot = path.resolve(root);
        const outputPartsFor = (output: string): ReadonlyArray<string> =>
          output.replaceAll("\\", "/").split("/").filter(Boolean);
        const outputDirectoryFor = (
          file: string,
          output: string,
        ): string | undefined => {
          const resolvedFile = path.resolve(root, file);
          if (!isPathInDirectory(resolvedFile, resolvedRoot)) return undefined;
          const outputParts = outputPartsFor(output);
          const isConfiguredOutput = (directory: string): boolean => {
            if (!isPathInDirectory(directory, resolvedRoot)) return false;
            const relativeOutput = path
              .relative(resolvedRoot, directory)
              .split(path.sep)
              .filter(Boolean);
            return (
              relativeOutput.length >= outputParts.length &&
              outputParts.every(
                (part, index) =>
                  relativeOutput[
                    relativeOutput.length - outputParts.length + index
                  ] === part,
              )
            );
          };
          const artifactName = path.basename(resolvedFile);
          if (GeneratedArtifactNamePattern.test(artifactName)) {
            const state = path.dirname(resolvedFile);
            if (
              !PreviewSchema.PreviewStateNamePattern.test(path.basename(state))
            ) {
              return undefined;
            }
            const source = path.dirname(state);
            const outputDirectory = path.dirname(source);
            const relative = path
              .relative(outputDirectory, resolvedFile)
              .split(path.sep)
              .filter(Boolean);
            return relative.length === 3 && isConfiguredOutput(outputDirectory)
              ? outputDirectory
              : undefined;
          }
          if (!GeneratedLegacyArtifactNamePattern.test(artifactName)) {
            return undefined;
          }
          const source = path.dirname(resolvedFile);
          const outputDirectory = path.dirname(source);
          return GeneratedLegacySourceDirectoryPattern.test(
            path.basename(source),
          ) && isConfiguredOutput(outputDirectory)
            ? outputDirectory
            : undefined;
        };
        const candidates = entries.flatMap((group, index) => {
          const output = uniqueOutputs[index];
          return output === undefined
            ? []
            : group.map((file) => ({ file, output }));
        });
        const files = yield* Effect.forEach(
          [
            ...new Map(
              candidates.map(({ file, output }) => [
                `${output}\u0000${file}`,
                { file, output },
              ]),
            ).values(),
          ],
          ({ file, output }) =>
            fs.stat(path.resolve(root, file)).pipe(
              Effect.map((info) =>
                info.type === "File" ? { file, output } : undefined,
              ),
              cleanError(path.resolve(root, file)),
            ),
          { concurrency: "unbounded" },
        );
        const directories = new Set<string>();
        for (const file of files) {
          if (file === undefined) continue;
          const directory = outputDirectoryFor(file.file, file.output);
          if (directory !== undefined) directories.add(directory);
        }
        return new Set(
          [...directories].toSorted(
            (left, right) => left.length - right.length,
          ),
        );
      },
    );

    const cleanProject = Effect.fn("PreviewArtifacts.cleanProject")(function* (
      input: CleanProjectInput,
    ) {
      const activeDirectories = input.activeSources.map(({ source, output }) =>
        path.resolve(sourceDirectory(source, output)),
      );
      const directories = yield* outputDirectories(input.root, input.outputs);
      yield* Effect.forEach(
        directories,
        (directory) =>
          Effect.gen(function* () {
            const names = yield* readDirectoryForClean(directory);
            yield* Effect.forEach(
              names,
              (name) => {
                const target = path.join(directory, name);
                return activeDirectories.some((activeDirectory) =>
                  isPathInDirectory(activeDirectory, target),
                )
                  ? Effect.void
                  : removeForClean(target);
              },
              { concurrency: "unbounded", discard: true },
            );
          }),
        { concurrency: 1, discard: true },
      );
    });

    return Artifacts.of({
      cleanProject,
      cleanSource,
      isPathInDirectory,
      outputDirectories,
      outputDirectory,
      sourceDirectory,
      write,
      writeBundle,
    });
  }),
);
