import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { ResolvedPreviewOptions } from "../../config";

export class PreviewDiscoveryError extends Schema.TaggedErrorClass<PreviewDiscoveryError>(
  "@nmnmcc/preview/PreviewDiscoveryError",
)("PreviewDiscoveryError", {
  detail: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return this.detail;
  }
}

const hasGlobMagic = (value: string): boolean => /[*?{}[\]]/.test(value);

export interface Interface {
  readonly discover: (
    root: string,
    config: ResolvedPreviewOptions,
    filters?: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<string>, PreviewDiscoveryError>;
}

export class Discovery extends Context.Service<Discovery, Interface>()(
  "@nmnmcc/preview/PreviewDiscovery",
) {}

export const layer = Layer.effect(
  Discovery,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const discover = Effect.fn("PreviewDiscovery.discover")(function* (
      root: string,
      config: ResolvedPreviewOptions,
      filters: ReadonlyArray<string> = [],
    ) {
      const files = yield* Effect.forEach(
        config.include,
        (pattern) =>
          fs.glob(pattern, {
            root,
            exclude: ["**/.preview/**", "**/node_modules/**"],
          }),
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map((groups) => [
          ...new Set(groups.flat().map((file) => path.resolve(root, file))),
        ]),
        Effect.mapError(
          (cause) =>
            new PreviewDiscoveryError({
              detail: `Could not discover preview files below ${root}.`,
              cause,
            }),
        ),
      );

      if (filters.length === 0) {
        return files.toSorted();
      }

      const globFilters = filters.filter(hasGlobMagic);
      const matchedByGlob =
        globFilters.length === 0
          ? new Set<string>()
          : new Set(
              yield* Effect.forEach(
                globFilters,
                (pattern) => fs.glob(pattern, { root }),
                { concurrency: "unbounded" },
              ).pipe(
                Effect.map((groups) =>
                  groups.flat().map((file) => path.resolve(root, file)),
                ),
                Effect.mapError(
                  (cause) =>
                    new PreviewDiscoveryError({
                      detail: "Could not resolve CLI preview globs.",
                      cause,
                    }),
                ),
              ),
            );
      const literalFilters = filters
        .filter((filter) => !hasGlobMagic(filter))
        .map((filter) => path.resolve(root, filter));

      return files
        .filter(
          (file) =>
            matchedByGlob.has(file) ||
            literalFilters.some(
              (filter) =>
                file === filter || file.startsWith(`${filter}${path.sep}`),
            ),
        )
        .toSorted();
    });

    return Discovery.of({ discover });
  }),
);
