import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Runtime from "effect/Runtime";
import { CliError, CliOutput } from "effect/unstable/cli";

const formatUnknownError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportError = (error: unknown): Effect.Effect<void> => {
  if (!Runtime.getErrorReported(error)) return Effect.void;
  if (CliError.isCliError(error)) {
    return CliOutput.Formatter.use((formatter) =>
      Console.error(formatter.formatError(error)),
    );
  }
  return Console.error(`Error: ${formatUnknownError(error)}`);
};

const reportReason = <E>(reason: Cause.Reason<E>): Effect.Effect<void> => {
  switch (reason._tag) {
    case "Fail":
      return reportError(reason.error);
    case "Die":
      return Runtime.getErrorReported(reason.defect)
        ? Console.error(Cause.pretty(Cause.fromReasons([reason])))
        : Effect.void;
    case "Interrupt":
      return Effect.void;
  }
};

const reportCause = <E>(cause: Cause.Cause<E>): Effect.Effect<void> =>
  Effect.forEach(cause.reasons, reportReason, { discard: true });

export const withFailureReporting = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => Effect.tapCause(effect, reportCause);
