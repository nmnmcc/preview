import * as Schema from "effect/Schema";
import * as SchemaRules from "./schema";

export const CaptureMode = Schema.Literals(["viewport", "fullPage"]);
export type CaptureMode = typeof CaptureMode.Type;

export const PreviewViewport = Schema.Struct({
  width: SchemaRules.PositiveInteger,
  height: SchemaRules.PositiveInteger,
  deviceScaleFactor: Schema.optionalKey(SchemaRules.PositiveNumber),
});
export interface PreviewViewport
  extends Schema.Schema.Type<typeof PreviewViewport> {}

const PreviewViewportOverrideValue = Schema.Struct({
  width: Schema.optionalKey(SchemaRules.PositiveInteger),
  height: Schema.optionalKey(SchemaRules.PositiveInteger),
  deviceScaleFactor: Schema.optionalKey(SchemaRules.PositiveNumber),
});

export const PreviewViewportOverride = Schema.Union([
  Schema.Literal(true),
  PreviewViewportOverrideValue,
]);
export type PreviewViewportOverride = typeof PreviewViewportOverride.Type;

export const PreviewMetadata = Schema.Struct({
  viewports: Schema.optionalKey(
    Schema.Record(SchemaRules.ViewportName, PreviewViewportOverride).check(
      Schema.isMinProperties(1),
    ),
  ),
  capture: Schema.optionalKey(CaptureMode),
});
export interface PreviewMetadata
  extends Schema.Schema.Type<typeof PreviewMetadata> {}

const PreviewDefinitionTypeId: unique symbol = Symbol.for(
  "@nmnmcc/preview/PreviewDefinition",
);

export type PreviewDone = () => void;

export type PreviewRender = (
  root: HTMLElement,
  done: PreviewDone,
) => void | Promise<void>;

const PreviewRenderSchema = Schema.declare<PreviewRender>(
  (input): input is PreviewRender => typeof input === "function",
);

const PreviewDefinitionStruct = Schema.Struct({
  [PreviewDefinitionTypeId]: Schema.Literal(true),
  metadata: PreviewMetadata,
  render: PreviewRenderSchema,
});

export interface PreviewDefinition {
  readonly metadata: PreviewMetadata;
  readonly render: PreviewRender;
}

const isPreviewDefinition = Schema.is(PreviewDefinitionStruct);

export const PreviewDefinition = Schema.declare<PreviewDefinition>(
  (input): input is PreviewDefinition => isPreviewDefinition(input),
);

export const PreviewCollection = Schema.Record(
  SchemaRules.PreviewVariantName,
  PreviewDefinition,
).check(Schema.isMinProperties(1));
export type PreviewCollection = typeof PreviewCollection.Type;

export const PreviewExportSchema = Schema.Union([
  PreviewDefinition,
  PreviewCollection,
]);
export type PreviewExport = typeof PreviewExportSchema.Type;

export interface PreviewOptions extends PreviewMetadata {
  readonly render: PreviewRender;
}

export type PreviewTemplate<Input> = (input: Input) => PreviewDefinition;

export const preview = (options: PreviewOptions): PreviewDefinition => {
  const { render, ...inputMetadata } = options;
  const definition = PreviewDefinitionStruct.make({
    [PreviewDefinitionTypeId]: true,
    metadata: inputMetadata,
    render,
  });
  Object.freeze(definition.metadata);
  return Object.freeze(definition);
};

export function template<Input>(
  map: (input: Input) => PreviewOptions,
): PreviewTemplate<Input>;
export function template<Input, BaseInput>(
  map: (input: Input) => NoInfer<BaseInput>,
  base: PreviewTemplate<BaseInput>,
): PreviewTemplate<Input>;
export function template<Input, BaseInput>(
  ...args:
    | readonly [map: (input: Input) => PreviewOptions]
    | readonly [
        map: (input: Input) => BaseInput,
        base: PreviewTemplate<BaseInput>,
      ]
): PreviewTemplate<Input> {
  if (args.length === 1) {
    const [map] = args;
    return (input) => preview(map(input));
  }

  const [map, base] = args;
  return (input) => base(map(input));
}
