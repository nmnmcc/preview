import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import * as Layer from "effect/Layer";
import * as Artifacts from "./services/Artifacts";
import * as Browser from "./services/Browser";
import * as Discovery from "./services/Discovery";
import * as Renderer from "./services/Renderer";
import { pipe } from "effect";

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

const services = Layer.mergeAll(
  Artifacts.layer,
  Browser.layer,
  Discovery.layer,
).pipe(Layer.provide(platform));

export default pipe(Renderer.layer, Layer.provide(services));
