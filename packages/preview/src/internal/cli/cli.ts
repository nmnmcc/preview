import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ProjectRunner from "./services/ProjectRunner";

export class PreviewCliError extends Schema.TaggedErrorClass<PreviewCliError>(
  "@nmnmcc/preview/PreviewCliError",
)("PreviewCliError", { detail: Schema.String }) {
  override get message(): string {
    return this.detail;
  }
}

export const generate = Effect.fn("PreviewCli.generate")(function* ({
  output,
  paths,
  root,
}: ProjectRunner.GenerateOptions) {
  const path = yield* Path.Path;
  const projectRunner = yield* ProjectRunner.ProjectRunner;
  const summary = yield* projectRunner.generate({
    paths,
    root,
    ...(output === undefined ? {} : { output }),
  });

  for (const artifact of summary.artifacts) {
    yield* Console.log(`generated ${path.relative(root, artifact.pngPath)}`);
  }
  for (const failure of summary.failures) {
    yield* Console.error(failure.message);
  }
  if (summary.failures.length > 0) {
    return yield* new PreviewCliError({
      detail: `${summary.failures.length} preview target(s) failed.`,
    });
  }
  if (summary.artifacts.length === 0) {
    yield* Console.warn("No matching preview files were found.");
  }
});
