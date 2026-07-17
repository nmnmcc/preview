import * as Layer from "effect/Layer";
import * as PreviewRpcClient from "./services/PreviewRpcClient";
import * as PreviewRunner from "./services/PreviewRunner";

/** Provides the services used by the browser preview process. */
export const layer = Layer.merge(PreviewRpcClient.layer, PreviewRunner.layer);
