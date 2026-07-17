import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Logging from "../logging";
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
    const timestampMillis = yield* Clock.currentTimeMillis;
    yield* Console.log(
      Logging.formatGeneratedArtifact(path, artifact, timestampMillis),
    );
  }
  for (const failure of summary.failures) {
    const timestampMillis = yield* Clock.currentTimeMillis;
    yield* Console.error(
      Logging.formatGenerationFailure(path, failure, timestampMillis),
    );
  }
  if (summary.failures.length > 0) {
    return yield* new PreviewCliError({
      detail: `${summary.failures.length} preview target(s) failed.`,
    });
  }
  if (summary.artifacts.length === 0) {
    const timestampMillis = yield* Clock.currentTimeMillis;
    yield* Console.warn(
      Logging.formatMessage(
        "warn",
        "No matching preview files were found.",
        timestampMillis,
      ),
    );
  }
});
