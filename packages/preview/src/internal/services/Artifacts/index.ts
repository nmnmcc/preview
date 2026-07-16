import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const VersionTimestampPattern = /^\d{8}T\d{9}Z$/u;
export const OwnershipMarkerName = ".nmnmcc-preview-artifacts";
export const OwnershipMarkerContent =
  "@nmnmcc/preview artifacts v1\n";
const OwnershipMarkerBytes = new TextEncoder().encode(
  OwnershipMarkerContent,
);

const ArtifactOperation = Schema.Literals([
  "read",
  "write",
  "link",
  "retain",
]);

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

export interface VersionOptions {
  readonly retain: number;
}

export interface Target {
  readonly viewport: string;
  readonly variant?: string;
}

export interface WriteInput extends Target {
  readonly source: string;
  readonly output: string;
  readonly png: Uint8Array;
  readonly version?: VersionOptions;
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
  readonly isPathInDirectory: (
    file: string,
    directory: string,
  ) => boolean;
  readonly ownedDirectories: (
    root: string,
    outputs: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlySet<string>, PreviewCleanError>;
  readonly sourceDirectory: (source: string, output: string) => string;
  readonly write: (
    input: WriteInput,
  ) => Effect.Effect<string, PreviewWriteError>;
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
    ? target.viewport
    : `${target.variant}.${target.viewport}`;

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

const versionFile = (
  artifactIdentity: string,
  name: string,
): VersionFile | undefined => {
  const prefix = `${artifactIdentity}@`;
  if (!name.startsWith(prefix) || !name.endsWith(".png")) {
    return undefined;
  }
  const timestamp = name.slice(prefix.length, -4);
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

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

export const layer = Layer.effect(
  Artifacts,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const sourceDirectory = (source: string, output: string): string =>
      path.join(path.dirname(source), output, path.basename(source));

    const isPathInDirectory = (
      file: string,
      directory: string,
    ): boolean => {
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
        (cause) =>
          new PreviewWriteError({ operation, path: target, cause }),
      );
    const cleanError = (target: string) =>
      Effect.mapError(
        (cause) => new PreviewCleanError({ path: target, cause }),
      );

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
      return yield* fs.readDirectory(directory).pipe(
        Effect.catch((cause) =>
          isNotFound(cause)
            ? Effect.succeed([])
            : Effect.fail(
                new PreviewCleanError({ path: directory, cause }),
              ),
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
      const linkResult = yield* Effect.result(fs.readLink(alias));
      if (Result.isSuccess(linkResult)) {
        const match = versions.find(
          (version) => version.name === linkResult.success,
        );
        return {
          current: match,
          linkTarget: linkResult.success,
          legacyAlias: match === undefined,
        };
      }

      const aliasContent = yield* readOptionalFile(alias);
      if (aliasContent !== undefined) {
        return {
          current: undefined,
          linkTarget: undefined,
          legacyAlias: true,
        };
      }

      const current = versions[0];
      return {
        current,
        linkTarget: undefined,
        legacyAlias: false,
      };
    });

    const claimDirectory = Effect.fnUntraced(function* (
      directory: string,
    ) {
      const marker = path.join(directory, OwnershipMarkerName);
      const markerResult = yield* Effect.result(fs.readFileString(marker));
      if (Result.isSuccess(markerResult)) {
        if (markerResult.success === OwnershipMarkerContent) return;
        return yield* new PreviewWriteError({
          operation: "write",
          path: directory,
          cause: new Error(
            "The artifact directory has an invalid ownership marker.",
          ),
        });
      }
      if (!isNotFound(markerResult.failure)) {
        return yield* new PreviewWriteError({
          operation: "read",
          path: marker,
          cause: markerResult.failure,
        });
      }

      const names = yield* readDirectoryForWrite(directory);
      if (names.length > 0) {
        return yield* new PreviewWriteError({
          operation: "write",
          path: directory,
          cause: new Error(
            "The artifact directory is not empty and has no ownership marker.",
          ),
        });
      }
      yield* writeAtomic(marker, OwnershipMarkerBytes);
    });

    const currentVersionForClean = Effect.fnUntraced(function* (
      alias: string,
      versions: ReadonlyArray<VersionFile>,
    ) {
      const linkResult = yield* Effect.result(fs.readLink(alias));
      if (Result.isSuccess(linkResult)) {
        return versions.find(
          (version) => version.name === linkResult.success,
        )?.name;
      }

      const fileResult = yield* Effect.result(fs.readFile(alias));
      if (Result.isSuccess(fileResult) || isNotFound(fileResult.failure)) {
        return undefined;
      }
      return yield* new PreviewCleanError({
        path: alias,
        cause: fileResult.failure,
      });
    });

    const pruneForWrite = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
      retain: number,
      currentName: string,
    ) {
      const names = yield* readDirectoryForWrite(directory);
      const versions = versionsFor(artifactIdentity, names);
      const current = versions.find(
        (version) => version.name === currentName,
      );
      const eligible =
        current === undefined
          ? versions
          : versions.filter((version) => version.millis <= current.millis);
      const keep = new Set(
        eligible.slice(0, retain).map((version) => version.name),
      );
      yield* Effect.forEach(
        versions.filter((version) => !keep.has(version.name)),
        (version) =>
          fs
            .remove(path.join(directory, version.name))
            .pipe(writeError("retain", path.join(directory, version.name))),
        { concurrency: "unbounded", discard: true },
      );
    });

    const pruneForClean = Effect.fnUntraced(function* (
      directory: string,
      artifactIdentity: string,
      retain: number,
      currentName: string | undefined,
    ) {
      const names = yield* readDirectoryForClean(directory);
      const versions = versionsFor(artifactIdentity, names);
      const current = versions.find(
        (version) => version.name === currentName,
      );
      const eligible =
        current === undefined
          ? versions
          : versions.filter((version) => version.millis <= current.millis);
      const keep = new Set(
        eligible.slice(0, retain).map((version) => version.name),
      );
      yield* Effect.forEach(
        versions.filter((version) => !keep.has(version.name)),
        (version) => {
          const target = path.join(directory, version.name);
          return fs.remove(target).pipe(cleanError(target));
        },
        { concurrency: "unbounded", discard: true },
      );
    });

    const write = Effect.fn("PreviewArtifacts.write")(function* (
      input: WriteInput,
    ) {
      const directory = sourceDirectory(input.source, input.output);
      const artifactIdentity = identity(input);
      const alias = path.join(directory, `${artifactIdentity}.png`);

      yield* claimDirectory(directory);

      if (input.version === undefined) {
        yield* writeAtomic(alias, input.png);
        return alias;
      }

      const names = yield* readDirectoryForWrite(directory);
      const versions = versionsFor(artifactIdentity, names);
      const state = yield* currentVersionForWrite(
        alias,
        versions,
      );
      if (state.current !== undefined && !state.legacyAlias) {
        const currentPath = path.join(directory, state.current.name);
        const currentPng = yield* fs
          .readFile(currentPath)
          .pipe(writeError("read", currentPath));
        if (sameBytes(currentPng, input.png)) {
          if (state.linkTarget !== state.current.name) {
            yield* linkAtomic(alias, state.current.name);
          }
          yield* pruneForWrite(
            directory,
            artifactIdentity,
            input.version.retain,
            state.current.name,
          );
          return currentPath;
        }
      }

      const newestMillis = versions[0]?.millis ?? -1;
      const now = Math.trunc(yield* Clock.currentTimeMillis);
      const versionMillis = Math.max(now, newestMillis + 1);
      const timestamp = yield* Effect.try({
        try: () => timestampFromMillis(versionMillis),
        catch: (cause) =>
          new PreviewWriteError({
            operation: "write",
            path: alias,
            cause,
          }),
      });
      const versionName = `${artifactIdentity}@${timestamp}.png`;
      const versionPath = path.join(directory, versionName);

      yield* writeAtomic(versionPath, input.png);
      yield* linkAtomic(alias, versionName);
      yield* pruneForWrite(
        directory,
        artifactIdentity,
        input.version.retain,
        versionName,
      );
      return versionPath;
    });

    const cleanSource = Effect.fn("PreviewArtifacts.cleanSource")(
      function* (input: CleanSourceInput) {
        const directory = sourceDirectory(input.source, input.output);
        const marker = path.join(directory, OwnershipMarkerName);
        const markerContent = yield* fs.readFileString(marker).pipe(
          Effect.catch((cause) =>
            isNotFound(cause)
              ? Effect.void
              : Effect.fail(
                  new PreviewCleanError({ path: marker, cause }),
                ),
          ),
        );
        if (markerContent !== OwnershipMarkerContent) return;
        const names = yield* readDirectoryForClean(directory);
        const identities = [...new Set(input.targets.map(identity))];
        const aliases = new Set(
          identities.map((artifactIdentity) => `${artifactIdentity}.png`),
        );
        const currentVersions = new Map<string, string | undefined>();

        for (const artifactIdentity of identities) {
          const versions = versionsFor(artifactIdentity, names);
          currentVersions.set(
            artifactIdentity,
            yield* currentVersionForClean(
              path.join(directory, `${artifactIdentity}.png`),
              versions,
            ),
          );
        }

        const keepPng = (name: string): boolean => {
          if (aliases.has(name)) return true;
          for (const artifactIdentity of identities) {
            const version = versionFile(artifactIdentity, name);
            if (version === undefined) continue;
            if (input.version !== undefined) return true;
            return currentVersions.get(artifactIdentity) === name;
          }
          return false;
        };

        yield* Effect.forEach(
          names.filter(
            (name) => name.endsWith(".png") && !keepPng(name),
          ),
          (name) => {
            const target = path.join(directory, name);
            return fs.remove(target).pipe(cleanError(target));
          },
          { concurrency: "unbounded", discard: true },
        );

        const version = input.version;
        if (version !== undefined) {
          yield* Effect.forEach(
            identities,
            (artifactIdentity) =>
              pruneForClean(
                directory,
                artifactIdentity,
                version.retain,
                currentVersions.get(artifactIdentity),
              ),
            { concurrency: 1, discard: true },
          );
        }
      },
    );

    const ownedDirectories = Effect.fn(
      "PreviewArtifacts.ownedDirectories",
    )(function* (root: string, outputs: ReadonlyArray<string>) {
      const markerGroups = yield* Effect.forEach(
        [...new Set(outputs)],
        (output) =>
          fs
            .glob(`**/${output}/*/${OwnershipMarkerName}`, {
              root,
              exclude: ["**/node_modules/**"],
            })
            .pipe(cleanError(path.resolve(root, output))),
        { concurrency: "unbounded" },
      );
      const directories = new Set<string>();

      for (const candidate of new Set(markerGroups.flat())) {
        const marker = path.resolve(root, candidate);
        const content = yield* fs.readFileString(marker).pipe(
          Effect.catch((cause) =>
            isNotFound(cause)
              ? Effect.void
              : Effect.fail(
                  new PreviewCleanError({ path: marker, cause }),
                ),
          ),
        );
        if (content === OwnershipMarkerContent) {
          directories.add(path.dirname(marker));
        }
      }

      return directories;
    });

    const cleanProject = Effect.fn("PreviewArtifacts.cleanProject")(
      function* (input: CleanProjectInput) {
        const activeDirectories = new Set(
          input.activeSources.map(({ source, output }) =>
            path.resolve(sourceDirectory(source, output)),
          ),
        );
        const directories = yield* ownedDirectories(
          input.root,
          input.outputs,
        );
        const stale = [...directories].filter(
          (directory) => !activeDirectories.has(directory),
        );
        yield* Effect.forEach(
          stale,
          (directory) =>
            readDirectoryForClean(directory).pipe(
              Effect.flatMap((names) =>
                Effect.forEach(
                  names.filter((name) => name.endsWith(".png")),
                  (name) => {
                    const file = path.join(directory, name);
                    return fs.remove(file).pipe(cleanError(file));
                  },
                  { concurrency: "unbounded", discard: true },
                ),
              ),
            ),
          { concurrency: "unbounded", discard: true },
        );
      },
    );

    return Artifacts.of({
      cleanProject,
      cleanSource,
      isPathInDirectory,
      ownedDirectories,
      sourceDirectory,
      write,
    });
  }),
);
