import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export class PreviewWriteError extends Schema.TaggedErrorClass<PreviewWriteError>(
  "@nmnmcc/preview/PreviewWriteError",
)("PreviewWriteError", {
  path: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not write ${this.path}`;
  }
}

export interface Interface {
  readonly write: (
    source: string,
    viewport: string,
    png: Uint8Array,
    variant?: string,
  ) => Effect.Effect<string, PreviewWriteError>;
}

export class Artifacts extends Context.Service<Artifacts, Interface>()(
  "@nmnmcc/preview/PreviewArtifacts",
) {}

export const layer = Layer.effect(
  Artifacts,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const writeError = (target: string) =>
      Effect.mapError(
        (cause) => new PreviewWriteError({ path: target, cause }),
      );

    const writeAtomic = Effect.fnUntraced(function* (
      destination: string,
      content: Uint8Array,
    ) {
      const directory = path.dirname(destination);
      yield* fs
        .makeDirectory(directory, { recursive: true })
        .pipe(writeError(directory));
      const temporary = yield* fs
        .makeTempFileScoped({
          directory,
          prefix: `.${path.basename(destination)}.`,
          suffix: ".tmp",
        })
        .pipe(writeError(directory));
      yield* fs.writeFile(temporary, content).pipe(writeError(temporary));
      yield* fs.rename(temporary, destination).pipe(writeError(destination));
    }, Effect.scoped);

    const write = Effect.fn("PreviewArtifacts.write")(function* (
      source: string,
      viewport: string,
      png: Uint8Array,
      variant?: string,
    ) {
      const directory = path.join(path.dirname(source), ".preview");
      const baseName = path
        .basename(source)
        .replace(/\.preview\.(?:[cm]?[jt]sx?)$/i, "");
      const stem =
        variant === undefined
          ? `${baseName}.${viewport}`
          : `${baseName}.${variant}.${viewport}`;
      const pngPath = path.join(directory, `${stem}.png`);

      yield* writeAtomic(pngPath, png);
      return pngPath;
    });

    return Artifacts.of({ write });
  }),
);
