import process from "node:process";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Cli from "../cli";

export const outputFlag = Flag.string("output").pipe(
  Flag.optional,
  Flag.map(Option.getOrUndefined),
  Flag.withDescription(
    "PNG output directory relative to each preview source file",
  ),
);

export default Command.make(
  "generate",
  {
    paths: Argument.string("path").pipe(
      Argument.variadic(),
      Argument.withDescription("Preview file paths or glob patterns"),
    ),
    output: outputFlag,
    root: Flag.directory("root", { mustExist: true }).pipe(
      Flag.withDefault(Effect.sync(() => process.cwd())),
      Flag.withDescription("Vite project root"),
    ),
  },
  ({ output, paths, root }) =>
    Cli.generate({
      paths,
      root,
      ...(output === undefined ? {} : { output }),
    }),
).pipe(
  Command.withDescription("Generate PNG artifacts for matching .preview files"),
  Command.withExamples([
    { command: "preview generate" },
    { command: "preview generate src/Card.preview.tsx" },
    { command: "preview generate --output artifacts/previews" },
    { command: "preview generate --root ./examples/react" },
  ]),
);
