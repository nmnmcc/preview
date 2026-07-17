import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { createServer, type ViteDevServer } from "vite";
import * as Generation from "../../../generation";
import * as PluginControl from "../../../plugin-control";

export interface GenerateOptions {
  readonly root: string;
  readonly paths: ReadonlyArray<string>;
  readonly output?: string;
}

export class PreviewProjectRunnerError extends Schema.TaggedErrorClass<PreviewProjectRunnerError>(
  "@nmnmcc/preview/PreviewProjectRunnerError",
)("PreviewProjectRunnerError", {
  detail: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.detail;
  }
}

const acquireViteServer = Effect.fn("PreviewProjectRunner.acquireViteServer")(
  function* (root: string) {
    return yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          createServer({
            root,
            server: { host: "127.0.0.1", port: 0, strictPort: false },
          }),
        catch: (cause) =>
          new PreviewProjectRunnerError({
            detail: `Could not create a Vite server: ${String(cause)}`,
            cause,
          }),
      }),
      (server) => Effect.promise(() => server.close()),
    );
  },
);

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
  ) => Effect.Effect<Generation.GenerationSummary, PreviewProjectRunnerError>;
}

export class ProjectRunner extends Context.Service<ProjectRunner, Interface>()(
  "@nmnmcc/preview/PreviewProjectRunner",
) {}

const generate = Effect.fn("PreviewProjectRunner.generate")(function* ({
  output,
  paths,
  root,
}: GenerateOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* acquireViteServer(root);

      let control: PluginControl.DecodedPluginControl | undefined;
      for (const candidate of server.config.plugins) {
        const decoded = PluginControl.decode(candidate);
        if (Result.isSuccess(decoded)) {
          control = decoded.success;
          break;
        }
      }

      if (control === undefined) {
        return yield* new PreviewProjectRunnerError({
          detail: "The loaded Vite config does not include @nmnmcc/preview.",
        });
      }

      yield* Effect.tryPromise({
        try: () =>
          Reflect.apply(control.prepareCli, control, []) as Promise<void>,
        catch: (cause) =>
          new PreviewProjectRunnerError({
            detail: `Could not prepare preview generation: ${String(cause)}`,
            cause,
          }),
      });
      yield* listen(server);

      return yield* Effect.tryPromise({
        try: async () => {
          const value: unknown = await Reflect.apply(
            control.generate,
            control,
            [{ paths, ...(output === undefined ? {} : { output }) }],
          );
          return await Schema.decodeUnknownPromise(
            Generation.GenerationSummary,
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
