import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { Plugin } from "vite";
import type * as Generation from "./generation";

export const PluginName = "@nmnmcc/preview";

export const PluginControlKey = Symbol.for(
  "@nmnmcc/preview/internal/plugin-control",
);

export interface GenerateRequest {
  readonly output?: string;
  readonly paths?: ReadonlyArray<string>;
}

export interface PluginControl {
  readonly prepareCli: () => Promise<void>;
  readonly generate: (
    request?: GenerateRequest,
  ) => Promise<Generation.GenerationSummary>;
}

const ControlledPlugin = Schema.Struct({
  name: Schema.Literal(PluginName),
  [PluginControlKey]: Schema.Struct({
    prepareCli: Schema.instanceOf(Function),
    generate: Schema.instanceOf(Function),
  }),
});

export type DecodedPluginControl =
  (typeof ControlledPlugin.Type)[typeof PluginControlKey];

export const attach = (plugin: Plugin, control: PluginControl): Plugin => {
  Reflect.set(plugin, PluginControlKey, control);
  return plugin;
};

export const decode = (input: unknown) =>
  Schema.decodeUnknownResult(ControlledPlugin)(input).pipe(
    Result.map((plugin) => plugin[PluginControlKey]),
  );
