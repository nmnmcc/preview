import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import {
  normalizePath,
  type ModuleNode,
  type Plugin,
  type ViteDevServer,
} from "vite";
import type { PreviewPluginOptions } from "../PreviewPlugin";
import {
  findProductionPreviewCode,
  formatProductionCodeError,
  PreviewLabel,
} from "./check";
import type * as Generation from "./generation";
import { layer } from "./layer";
import * as Logging from "./logging";
import * as PluginControl from "./plugin-control";
import * as RunnerEntry from "./runner-entry";
import * as Config from "./services/Config";
import * as PluginController from "./services/PluginController";

const localBaseUrl = (server: ViteDevServer): string | undefined =>
  server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];

const formatUnknownError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const preview = (options: PreviewPluginOptions): Plugin => {
  const check = options.build?.check ?? true;
  const makeRuntime = () => ManagedRuntime.make(layer(options));
  type PreviewRuntime = ReturnType<typeof makeRuntime>;
  let runtime: PreviewRuntime | undefined;
  let closePromise: Promise<void> | undefined;
  let closed = false;
  let command: "build" | "serve" | undefined;

  const getRuntime = (): PreviewRuntime => {
    runtime ??= makeRuntime();
    return runtime;
  };

  const generate = (
    request: PluginControl.GenerateRequest = {},
  ): Promise<Generation.GenerationSummary> => {
    if (closed) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail: "The preview plugin is closed.",
        }),
      );
    }
    const activeRuntime = runtime;
    if (activeRuntime === undefined) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail:
            "The preview plugin is not attached to a running Vite server.",
        }),
      );
    }
    return activeRuntime.runPromise(
      Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        return yield* controller.generate(request);
      }),
    );
  };

  const prepareCli = (): Promise<void> => {
    if (closed) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail: "The preview plugin is closed.",
        }),
      );
    }
    const activeRuntime = runtime;
    if (activeRuntime === undefined) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail:
            "The preview plugin is not attached to a running Vite server.",
        }),
      );
    }
    return activeRuntime.runPromise(
      Effect.gen(function* () {
        const controller = yield* PluginController.PluginController;
        yield* controller.prepareCli;
      }),
    );
  };

  const scheduleGeneration = (
    viteServer: ViteDevServer,
    paths?: ReadonlyArray<string>,
  ): void => {
    const activeRuntime = runtime;
    if (activeRuntime === undefined) return;
    void activeRuntime
      .runPromise(
        Effect.gen(function* () {
          const controller = yield* PluginController.PluginController;
          yield* controller.schedule(paths);
        }),
      )
      .catch((error: unknown) => {
        viteServer.config.logger.error(
          Logging.formatMessage("error", formatUnknownError(error), Date.now()),
        );
      });
  };

  const closePlugin = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise;
    const activeRuntime = runtime;
    if (activeRuntime === undefined) return Promise.resolve();
    closed = true;
    closePromise = activeRuntime
      .runPromise(
        Effect.gen(function* () {
          const controller = yield* PluginController.PluginController;
          yield* controller.shutdown;
        }),
      )
      .finally(() => activeRuntime.dispose());
    return closePromise;
  };

  const affectedPreviewFiles = (
    modules: ReadonlyArray<ModuleNode>,
  ): ReadonlyArray<string> => {
    const affected = new Set<string>();
    const visited = new Set<ModuleNode>();
    const queue = [...modules];
    while (queue.length > 0) {
      const module = queue.shift();
      if (module === undefined || visited.has(module)) continue;
      visited.add(module);
      const moduleFile = module.file;
      if (moduleFile !== null && /\.preview\.[cm]?[jt]sx?$/i.test(moduleFile)) {
        affected.add(moduleFile);
      }
      queue.push(...module.importers);
    }
    return [...affected];
  };

  const plugin: Plugin = {
    name: PluginControl.PluginName,
    enforce: "post",
    config(_config, environment) {
      command = environment.command;
      if (environment.command !== "serve") return undefined;
      return {
        optimizeDeps: {
          exclude: ["@effect/platform-browser", "@nmnmcc/preview", "effect"],
        },
      };
    },
    options: {
      order: "post",
      handler(inputOptions) {
        if (command !== "build") return null;
        const dropLabels = inputOptions.transform?.dropLabels ?? [];
        if (dropLabels.includes(PreviewLabel)) return null;
        return {
          ...inputOptions,
          transform: {
            ...inputOptions.transform,
            dropLabels: [...dropLabels, PreviewLabel],
          },
        };
      },
    },
    configResolved(resolved) {
      if (resolved.command !== "serve") return undefined;
      const runnerPackagePath = normalizePath(RunnerEntry.RunnerPackagePath);
      if (!resolved.server.fs.allow.includes(runnerPackagePath)) {
        resolved.server.fs.allow.push(runnerPackagePath);
      }
      return getRuntime().runPromise(
        Effect.gen(function* () {
          const controller = yield* PluginController.PluginController;
          yield* controller.configure({
            root: resolved.root,
            mode: resolved.mode,
            info: (message) => resolved.logger.info(message),
            error: (message) => resolved.logger.error(message),
          });
        }),
      );
    },
    generateBundle: {
      order: "post",
      handler(_outputOptions, bundle) {
        if (!check) return;
        const matches = findProductionPreviewCode(bundle, (code) =>
          this.parse(code),
        );
        if (matches.length > 0) {
          this.error(formatProductionCodeError(this.environment.name, matches));
        }
      },
    },
    resolveId(id) {
      if (id !== RunnerEntry.RunnerModuleId) return undefined;
      return RunnerEntry.RunnerModulePath;
    },
    async configureServer(viteServer) {
      const activeRuntime = getRuntime();
      await activeRuntime.runPromise(
        Effect.gen(function* () {
          const controller = yield* PluginController.PluginController;
          yield* controller.attach({
            baseUrl: () => localBaseUrl(viteServer),
            unwatch: (glob) => {
              viteServer.watcher.unwatch(glob);
            },
          });
        }),
      );
      if (viteServer.httpServer !== null) {
        viteServer.httpServer.once("listening", () => {
          scheduleGeneration(viteServer);
        });
      }
    },
    async handleHotUpdate(context) {
      const activeRuntime = runtime;
      if (activeRuntime === undefined) return undefined;
      return activeRuntime.runPromise(
        Effect.gen(function* () {
          const controller = yield* PluginController.PluginController;
          if (yield* controller.isOutputPath(context.file)) {
            const noModules: Array<ModuleNode> = [];
            return noModules;
          }
          const affected = affectedPreviewFiles(context.modules);
          yield* controller.schedule(
            affected.length === 0 ? undefined : affected,
          );
          return undefined;
        }),
      );
    },
    closeBundle() {
      return closePlugin();
    },
  };

  return PluginControl.attach(plugin, { generate, prepareCli });
};
