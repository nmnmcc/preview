import * as Schema from "effect/Schema";
import {
  ApplicationDefinitionTypeId,
  PreviewDefinitionTypeId,
  type PreviewDefinition as Definition,
  type PreviewMount as Mount,
} from "./definition";
import type {
  PreviewMetadata as PreviewMetadataType,
  PreviewViewportHeight as PreviewViewportHeightType,
  PreviewViewportOverride as PreviewViewportOverrideType,
  PreviewViewport as PreviewViewportType,
} from "./preview-metadata";
import * as SchemaRules from "./schema";

export type PreviewMetadata = PreviewMetadataType;

export type PreviewViewport = PreviewViewportType;

export type PreviewViewportOverride = PreviewViewportOverrideType;

export type PreviewViewportHeight = PreviewViewportHeightType;

export type PreviewCollection = Readonly<Record<string, Definition>>;

export type PreviewDefinition = Definition;

export type PreviewExport = Definition | PreviewCollection;

const FullPageHeightPrefix = "full-";
const DefaultFullPageViewportHeight = 720;

const FullPageViewportHeight = Schema.TemplateLiteral([
  FullPageHeightPrefix,
  SchemaRules.PositiveInteger,
]);

const PreviewViewportHeightSchema = Schema.Union([
  SchemaRules.PositiveInteger,
  Schema.Literal("full"),
  FullPageViewportHeight,
]);

export const isFullPageViewportHeight = (
  height: PreviewViewportHeight,
): height is Exclude<PreviewViewportHeight, number> =>
  typeof height === "string";

export const viewportLayoutHeight = (height: PreviewViewportHeight): number =>
  typeof height === "number"
    ? height
    : height === "full"
      ? DefaultFullPageViewportHeight
      : Number(height.slice(FullPageHeightPrefix.length));

export const PreviewViewport = Schema.toStandardSchemaV1(
  Schema.Struct({
    width: SchemaRules.PositiveInteger,
    height: PreviewViewportHeightSchema,
    deviceScaleFactor: Schema.optionalKey(SchemaRules.PositiveNumber),
  }),
) satisfies Schema.Codec<PreviewViewportType>;

const PreviewViewportOverrideValue = Schema.Struct({
  width: Schema.optionalKey(SchemaRules.PositiveInteger),
  height: Schema.optionalKey(PreviewViewportHeightSchema),
  deviceScaleFactor: Schema.optionalKey(SchemaRules.PositiveNumber),
});

export const PreviewViewportOverride = Schema.toStandardSchemaV1(
  Schema.Union([Schema.Literal(true), PreviewViewportOverrideValue]),
) satisfies Schema.Codec<PreviewViewportOverrideType>;

export const PreviewMetadata = Schema.toStandardSchemaV1(
  Schema.Struct({
    viewports: Schema.optionalKey(
      Schema.Record(SchemaRules.ViewportName, PreviewViewportOverride).check(
        Schema.isMinProperties(1),
      ),
    ),
  }),
) satisfies Schema.Codec<PreviewMetadataType>;

const PreviewMount = Schema.declare<Mount>(
  (input): input is Mount => typeof input === "function",
);

const ComponentTarget = Schema.Struct({
  type: Schema.tag("sandbox"),
  mount: PreviewMount,
});

const ApplicationTarget = Schema.Struct({
  type: Schema.tag("application"),
  location: Schema.NonEmptyString,
});

const ComponentPreviewDefinition = Schema.Struct({
  [PreviewDefinitionTypeId]: Schema.Literal(true),
  metadata: PreviewMetadata,
  target: ComponentTarget,
});

const ApplicationDefinition = Schema.Struct({
  [PreviewDefinitionTypeId]: Schema.Literal(true),
  [ApplicationDefinitionTypeId]: Schema.Literal(true),
  metadata: PreviewMetadata,
  target: ApplicationTarget,
});

const PreviewDefinitionStruct = Schema.Union([
  ComponentPreviewDefinition,
  ApplicationDefinition,
]);

const isPreviewDefinition = Schema.is(PreviewDefinitionStruct);

export const PreviewDefinition = Schema.toStandardSchemaV1(
  Schema.declare<Definition>((input): input is Definition =>
    isPreviewDefinition(input),
  ),
);

export const PreviewCollection = Schema.toStandardSchemaV1(
  Schema.Record(SchemaRules.PreviewVariantName, PreviewDefinition).check(
    Schema.isMinProperties(1),
  ),
) satisfies Schema.Codec<PreviewCollection>;

export const PreviewExport = Schema.toStandardSchemaV1(
  Schema.Union([PreviewDefinition, PreviewCollection]),
) satisfies Schema.Codec<PreviewExport>;

export { application, preview, template } from "./definition";

export type {
  ApplicationLocation,
  ApplicationDefinition,
  ApplicationOptions,
  ApplicationTarget,
  ComponentPreviewDefinition,
  ComponentTarget,
  PreviewMount,
  PreviewMountContext,
  PreviewReady,
  PreviewOptions,
  PreviewTarget,
  PreviewTemplate,
  PreviewUnmount,
} from "./definition";
