import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Semaphore from "effect/Semaphore";
import type {
  ModuleNode,
  Plugin,
  ResolvedConfig,
  ViteDevServer,
} from "vite";
import * as Config from "./config";
import type * as Generation from "./generation";
import layer from "./layer";
import * as Protocol from "./protocol";
import * as Renderer from "./services/Renderer";

export interface GenerateRequest {
  readonly paths?: ReadonlyArray<string>;
}

export interface PreviewPluginApi {
  readonly generate: (
    request?: GenerateRequest,
  ) => Promise<Generation.GenerationSummary>;
}

export interface PreviewVitePlugin extends Plugin {
  readonly previewApi: PreviewPluginApi;
}

const runnerModuleId = "@nmnmcc/preview/internal/runner";
const runnerModulePath = fileURLToPath(
  new URL(
    "./src/runner.ts",
    import.meta.resolve("@nmnmcc/preview/package.json"),
  ),
);

const htmlTemplate = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="preview-root"></div>
    <script type="module">
      import { runPreview } from "@nmnmcc/preview/internal/runner"
      runPreview()
    </script>
  </body>
</html>`;

const localBaseUrl = (server: ViteDevServer): string | undefined =>
  server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];

const formatUnknownError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const preview = (
  options: Config.PreviewPluginOptions,
): PreviewVitePlugin => {
  const runtime = ManagedRuntime.make(layer);
  let server: ViteDevServer | undefined;
  let viteConfig: ResolvedConfig | undefined;
  let config: Config.ResolvedPreviewOptions | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const generationSemaphore = Semaphore.makeUnsafe(1);
  let closePromise: Promise<void> | undefined;
  let closed = false;
  let generateAllPending = false;
  const pendingPaths = new Set<string>();

  const generate = (
    request: GenerateRequest = {},
  ): Promise<Generation.GenerationSummary> => {
    if (closed) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail: "The preview plugin is closed.",
        }),
      );
    }
    const currentServer = server;
    const currentViteConfig = viteConfig;
    const currentConfig = config;
    if (
      currentServer === undefined ||
      currentViteConfig === undefined ||
      currentConfig === undefined
    ) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail:
            "The preview plugin is not attached to a running Vite server.",
        }),
      );
    }
    const baseUrl = localBaseUrl(currentServer);
    if (baseUrl === undefined) {
      return Promise.reject(
        new Config.PreviewConfigError({
          detail: "The Vite server has no reachable local URL.",
        }),
      );
    }

    const filters =
      request.paths === undefined ? undefined : [...request.paths];
    const program = Effect.gen(function* () {
      const renderer = yield* Renderer.Renderer;
      return yield* renderer.renderProject({
        root: currentViteConfig.root,
        baseUrl,
        config: currentConfig,
        ...(filters === undefined ? {} : { filters }),
      });
    });
    return runtime.runPromise(generationSemaphore.withPermit(program));
  };

  const reportSummary = (
    summary: Generation.GenerationSummary,
  ): void => {
    for (const artifact of summary.artifacts) {
      viteConfig?.logger.info(`[preview] generated ${artifact.pngPath}`);
    }
    for (const failure of summary.failures) {
      viteConfig?.logger.error(`[preview] ${failure.message}`);
    }
  };

  const scheduleGeneration = (paths?: ReadonlyArray<string>): void => {
    if (closed || viteConfig?.mode === "preview-cli") return;
    if (paths === undefined) {
      generateAllPending = true;
      pendingPaths.clear();
    } else if (!generateAllPending) {
      for (const path of paths) pendingPaths.add(path);
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const request =
        generateAllPending || pendingPaths.size === 0
          ? {}
          : { paths: [...pendingPaths] };
      generateAllPending = false;
      pendingPaths.clear();
      void generate(request)
        .then(reportSummary)
        .catch((error: unknown) => {
          viteConfig?.logger.error(`[preview] ${formatUnknownError(error)}`);
        });
    }, 100);
  };

  const closePlugin = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise;
    closed = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    closePromise = runtime
      .runPromise(generationSemaphore.withPermit(Effect.void))
      .then(() => runtime.dispose());
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

  const plugin: PreviewVitePlugin = {
    name: "@nmnmcc/preview",
    enforce: "post",
    previewApi: { generate },
    config() {
      return {
        optimizeDeps: {
          exclude: ["@nmnmcc/preview"],
        },
      };
    },
    configResolved(resolved) {
      viteConfig = resolved;
      return runtime.runPromise(
        Effect.gen(function* () {
          config = yield* Config.resolvePreviewOptions(options);
        }),
      );
    },
    resolveId(id) {
      if (id !== runnerModuleId) return undefined;
      return runnerModulePath;
    },
    configureServer(viteServer) {
      server = viteServer;
      viteServer.watcher.unwatch("**/.preview/**");
      viteServer.middlewares.use((request, response, next) => {
        const requestUrl =
          request.url === undefined
            ? undefined
            : new URL(request.url, "http://preview.local");
        if (requestUrl?.pathname !== Protocol.previewRoute) {
          next();
          return;
        }
        void viteServer
          .transformIndexHtml(
            request.url ?? Protocol.previewRoute,
            htmlTemplate,
          )
          .then((html) => {
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(html);
          })
          .catch((error: unknown) => next(error));
      });

      if (viteServer.httpServer !== null) {
        viteServer.httpServer.once("listening", scheduleGeneration);
      }
    },
    handleHotUpdate(context) {
      if (context.file.split(/[\\/]/).includes(".preview")) {
        return [];
      }
      const affected = affectedPreviewFiles(context.modules);
      scheduleGeneration(affected.length === 0 ? undefined : affected);
      return undefined;
    },
    closeBundle() {
      return closePlugin();
    },
  };

  return plugin;
};
