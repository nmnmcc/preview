import { PreviewGeneration } from "@nmnmcc/preview";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { createServer, type ViteDevServer } from "vite";

export interface GenerateOptions {
  readonly root: string;
  readonly paths: ReadonlyArray<string>;
}

export class PreviewProjectRunnerError extends Schema.TaggedErrorClass<PreviewProjectRunnerError>(
  "@nmnmcc/preview-cli/PreviewProjectRunnerError",
)("PreviewProjectRunnerError", {
  detail: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.detail;
  }
}

const PreviewPlugin = Schema.Struct({
  previewApi: Schema.Struct({
    generate: Schema.instanceOf(Function),
  }),
});

const acquireViteServer = Effect.fn(
  "PreviewProjectRunner.acquireViteServer",
)(function* (root: string) {
  return yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        createServer({
          root,
          mode: "preview-cli",
          server: { host: "127.0.0.1", port: 0, strictPort: true },
        }),
      catch: (cause) =>
        new PreviewProjectRunnerError({
          detail: `Could not create a Vite server: ${String(cause)}`,
          cause,
        }),
    }),
    (server) =>
      Effect.tryPromise({
        try: () => server.close(),
        catch: () => undefined,
      }).pipe(Effect.ignore),
  );
});

const listen = Effect.fn("PreviewProjectRunner.listen")(function* (
  server: ViteDevServer,
) {
  return yield* Effect.tryPromise({
    try: () => server.listen(),
    catch: (cause) =>
      new PreviewProjectRunnerError({
        detail: `Could not start the Vite server: ${String(cause)}`,
        cause,
      }),
  });
});

export interface Interface {
  readonly generate: (
    options: GenerateOptions,
  ) => Effect.Effect<
    PreviewGeneration.GenerationSummary,
    PreviewProjectRunnerError
  >;
}

export class ProjectRunner extends Context.Service<ProjectRunner, Interface>()(
  "@nmnmcc/preview-cli/PreviewProjectRunner",
) {}

const generate = Effect.fn("PreviewProjectRunner.generate")(function* ({
  paths,
  root,
}: GenerateOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* acquireViteServer(root);
      yield* listen(server);

      let plugin: typeof PreviewPlugin.Type | undefined;
      for (const candidate of server.config.plugins) {
        const decoded = Schema.decodeUnknownResult(PreviewPlugin)(candidate);
        if (Result.isSuccess(decoded)) {
          plugin = decoded.success;
          break;
        }
      }

      if (plugin === undefined) {
        return yield* new PreviewProjectRunnerError({
          detail: "The loaded Vite config does not include @nmnmcc/preview.",
        });
      }

      return yield* Effect.tryPromise({
        try: async () => {
          const value: unknown = await Reflect.apply(
            plugin.previewApi.generate,
            plugin.previewApi,
            [{ paths }],
          );
          return await Schema.decodeUnknownPromise(
            PreviewGeneration.GenerationSummary,
          )(value);
        },
        catch: (cause) =>
          new PreviewProjectRunnerError({
            detail: `Preview generation failed: ${String(cause)}`,
            cause,
          }),
      });
    }),
  );
});

export const layer = Layer.succeed(
  ProjectRunner,
  ProjectRunner.of({ generate }),
);
