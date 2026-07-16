import * as Layer from "effect/Layer";
import * as ApplicationRpcClient from "./services/ApplicationRpcClient";
import * as PreviewRunner from "./services/PreviewRunner";

/** Provides the services used by the browser preview process. */
export const layer = Layer.merge(
  ApplicationRpcClient.layer,
  PreviewRunner.layer,
);
