import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

export const PreviewRpcTestStateKey = "@nmnmcc/preview/test/preview-rpc";

export const PreviewRpcTestState = Schema.TaggedUnion({
  Success: {
    echo: Schema.String,
    events: Schema.Array(Schema.String),
    cancelled: Schema.Array(Schema.String),
    screenshotBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  },
  Failure: { cause: Schema.String },
});
export type PreviewRpcTestState = typeof PreviewRpcTestState.Type;

export const PreviewRpcTestGroup = RpcGroup.make(
  Rpc.make("Echo", {
    payload: { value: Schema.String },
    success: Schema.String,
  }),
  Rpc.make("Events", {
    success: Schema.String,
    error: Schema.Never,
    stream: true,
  }),
  Rpc.make("Cancelled", {
    success: Schema.String,
    error: Schema.Never,
    stream: true,
  }),
  Rpc.make("Screenshot", { success: Schema.Uint8Array }),
);
