import process from "node:process";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import * as Cli from "../cli";
import generateCommand from "./generate";

export default Command.make("preview", {}, () =>
  Effect.gen(function* () {
    const root = yield* Effect.sync(() => process.cwd());
    yield* Cli.generate({ root, paths: [] });
  }),
).pipe(
  Command.withDescription(
    "Render Vite preview modules to PNG files. Run without a subcommand to generate all previews.",
  ),
  Command.withExamples([
    {
      command: "preview",
      description: "Generate all previews in the current project",
    },
    {
      command: "preview generate",
      description: "Use the explicit generate command",
    },
  ]),
  Command.withSubcommands([generateCommand]),
);
