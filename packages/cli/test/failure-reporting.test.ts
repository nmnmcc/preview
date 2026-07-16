import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Runtime from "effect/Runtime";
import * as TestConsole from "effect/testing/TestConsole";
import { CliError } from "effect/unstable/cli";
import { withFailureReporting } from "../src/internal/failure-reporting";

class ReportedDefect extends Error {
  override readonly [Runtime.errorReported] = false;
}

describe("CLI failure reporting", () => {
  it.effect("reports every error and defect", () => {
    const defect = new Error("Unexpected defect.");
    const cause = Cause.combine(
      Cause.combine(
        Cause.fail(new Error("First failure.")),
        Cause.fail("Second failure."),
      ),
      Cause.combine(Cause.die(defect), Cause.interrupt(1)),
    );

    return Effect.gen(function* () {
      const exit = yield* Effect.failCause(cause).pipe(
        withFailureReporting,
        Effect.exit,
      );
      const errors = yield* TestConsole.errorLines;

      strictEqual(Exit.isFailure(exit), true);
      strictEqual(errors.length, 3);
      deepStrictEqual(errors.slice(0, 2), [
        "Error: First failure.",
        "Error: Second failure.",
      ]);
      strictEqual(String(errors[2]).includes("Unexpected defect."), true);
    });
  });

  it.effect("reports defects from layer setup", () => {
    const defect = new Error("Layer setup failed.");
    const failingLayer = Layer.effectDiscard(Effect.die(defect));

    return Effect.gen(function* () {
      const exit = yield* Effect.void.pipe(
        Effect.provide(failingLayer),
        withFailureReporting,
        Effect.exit,
      );
      const errors = yield* TestConsole.errorLines;

      strictEqual(Exit.isFailure(exit), true);
      strictEqual(errors.length, 1);
      strictEqual(String(errors[0]).includes("Layer setup failed."), true);
    });
  });

  it.effect("does not report interruption", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.interrupt.pipe(
        withFailureReporting,
        Effect.exit,
      );

      strictEqual(Exit.isFailure(exit), true);
      deepStrictEqual(yield* TestConsole.errorLines, []);
    }),
  );

  it.effect("does not repeat reported errors or defects", () => {
    const showHelp = new CliError.ShowHelp({
      commandPath: ["preview"],
      errors: [],
    });
    const defect = new ReportedDefect("Already reported.");
    const cause = Cause.combine(Cause.fail(showHelp), Cause.die(defect));

    return Effect.gen(function* () {
      const exit = yield* Effect.failCause(cause).pipe(
        withFailureReporting,
        Effect.exit,
      );

      strictEqual(Exit.isFailure(exit), true);
      deepStrictEqual(yield* TestConsole.errorLines, []);
    });
  });
});
