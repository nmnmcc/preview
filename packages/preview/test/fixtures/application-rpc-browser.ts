import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ApplicationRpc from "../../src/internal/browser/services/ApplicationRpcClient";
import {
  ApplicationRpcTestGroup,
  ApplicationRpcTestState,
  ApplicationRpcTestStateKey,
} from "./application-rpc-contract";

const writeState = (
  state: ApplicationRpcTestState,
): Effect.Effect<void> =>
  Effect.sync(() => {
    Reflect.set(
      globalThis,
      Symbol.for(ApplicationRpcTestStateKey),
      state,
    );
  });

const run = Effect.gen(function* () {
  const applicationRpc = yield* ApplicationRpc.ApplicationRpcClient;
  const client = yield* applicationRpc.connect(ApplicationRpcTestGroup);
  const echo = yield* client.Echo({ value: "browser" });
  const events = yield* client.Events().pipe(
    Stream.runCollect,
    Effect.flatMap((values) =>
      Schema.decodeUnknownEffect(Schema.Array(Schema.String))(values),
    ),
  );
  const cancelled = yield* client.Cancelled().pipe(
    Stream.take(1),
    Stream.runCollect,
    Effect.flatMap((values) =>
      Schema.decodeUnknownEffect(Schema.Array(Schema.String))(values),
    ),
  );
  const screenshot = yield* client.Screenshot();
  return ApplicationRpcTestState.cases.Success.make({
    echo,
    events,
    cancelled,
    screenshotBytes: screenshot.byteLength,
  });
});

const program = run.pipe(
  Effect.matchCauseEffect({
    onFailure: (cause) =>
      writeState(
        ApplicationRpcTestState.cases.Failure.make({
          cause: Cause.pretty(cause),
        }),
      ),
    onSuccess: writeState,
  }),
  Effect.provide(ApplicationRpc.layer),
  Effect.scoped,
);

BrowserRuntime.runMain(program, { disableErrorReporting: true });
