import process from "node:process";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Cli from "../cli";

export default Command.make(
  "generate",
  {
    paths: Argument.string("path").pipe(
      Argument.variadic(),
      Argument.withDescription("Preview file paths or glob patterns"),
    ),
    root: Flag.directory("root", { mustExist: true }).pipe(
      Flag.withDefault(Effect.sync(() => process.cwd())),
      Flag.withDescription("Vite project root"),
    ),
  },
  (options) => Cli.generate(options),
).pipe(
  Command.withDescription("Generate PNG artifacts for matching .preview files"),
  Command.withExamples([
    { command: "preview generate" },
    { command: "preview generate src/Card.preview.tsx" },
    { command: "preview generate --root ./examples/react" },
  ]),
);
