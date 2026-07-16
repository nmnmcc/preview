import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";
import metadata from "../../package.json";
import preview from "./commands/preview";
import { withFailureReporting } from "./failure-reporting";
import layer from "./layer";

const version = Result.match(
  Schema.decodeUnknownResult(Schema.Struct({ version: Schema.String }))(
    metadata,
  ),
  {
    onFailure: () => "unknown",
    onSuccess: (metadata) => metadata.version,
  },
);

export const program = Command.run(preview, { version }).pipe(
  Effect.provide(layer),
  withFailureReporting,
);
