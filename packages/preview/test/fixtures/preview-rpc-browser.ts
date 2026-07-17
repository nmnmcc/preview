import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as PreviewRpc from "../../src/internal/browser/services/PreviewRpcClient";
import {
  PreviewRpcTestGroup,
  PreviewRpcTestState,
  PreviewRpcTestStateKey,
} from "./preview-rpc-contract";

const writeState = (state: PreviewRpcTestState): Effect.Effect<void> =>
  Effect.sync(() => {
    Reflect.set(globalThis, Symbol.for(PreviewRpcTestStateKey), state);
  });

const run = Effect.gen(function* () {
  const client = yield* RpcClient.make(PreviewRpcTestGroup);
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
  return PreviewRpcTestState.cases.Success.make({
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
        PreviewRpcTestState.cases.Failure.make({
          cause: Cause.pretty(cause),
        }),
      ),
    onSuccess: writeState,
  }),
  Effect.provide(PreviewRpc.protocol),
  Effect.scoped,
);

BrowserRuntime.runMain(program, { disableErrorReporting: true });
