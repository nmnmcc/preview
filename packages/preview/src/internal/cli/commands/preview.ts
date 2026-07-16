import process from "node:process";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import * as Cli from "../cli";
import generateCommand, { outputFlag } from "./generate";

export default Command.make("preview", { output: outputFlag }, ({ output }) =>
  Effect.gen(function* () {
    const root = yield* Effect.sync(() => process.cwd());
    yield* Cli.generate({
      root,
      paths: [],
      ...(output === undefined ? {} : { output }),
    });
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
    {
      command: "preview --output artifacts/previews",
      description: "Override the output directory for this run",
    },
  ]),
  Command.withSubcommands([generateCommand]),
);
