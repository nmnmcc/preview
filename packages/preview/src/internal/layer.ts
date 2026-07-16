import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import * as Layer from "effect/Layer";
import type { PreviewPluginOptions } from "../PreviewPlugin";
import * as Artifacts from "./services/Artifacts";
import * as Browser from "./services/Browser";
import * as Config from "./services/Config";
import * as Discovery from "./services/Discovery";
import * as PluginController from "./services/PluginController";
import * as Renderer from "./services/Renderer";

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

export const layer = (options: PreviewPluginOptions) => {
  const { playwright, ...capture } = options.capture;
  const config = Config.layer({
    capture,
    ...(options.files === undefined ? {} : { files: options.files }),
    ...(options.artifacts === undefined
      ? {}
      : { artifacts: options.artifacts }),
  });
  const artifacts = Artifacts.layer.pipe(Layer.provide(platform));
  const browser = Browser.layer(playwright).pipe(Layer.provide(platform));
  const discovery = Discovery.layer.pipe(
    Layer.provide(Layer.merge(platform, artifacts)),
  );
  const services = Layer.mergeAll(artifacts, browser, discovery);
  const renderer = Renderer.layer.pipe(
    Layer.provide(Layer.merge(services, config)),
  );

  return PluginController.layer.pipe(
    Layer.provide(Layer.mergeAll(artifacts, config, renderer)),
  );
};
