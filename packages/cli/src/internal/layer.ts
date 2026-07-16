import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import * as NodeStdio from "@effect/platform-node-shared/NodeStdio";
import * as NodeTerminal from "@effect/platform-node-shared/NodeTerminal";
import * as Layer from "effect/Layer";
import * as ProjectRunner from "./services/ProjectRunner";

const nodeBaseLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  NodeStdio.layer,
  NodeTerminal.layer,
);

const nodeChildProcessLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provide(nodeBaseLayer),
);

export default Layer.mergeAll(
  nodeBaseLayer,
  nodeChildProcessLayer,
  ProjectRunner.layer,
);
