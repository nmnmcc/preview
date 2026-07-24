import type * as Inspection from "./inspection";

export type PreviewViewportHeight = number | "full" | `full-${number}`;

export interface PreviewViewport {
  readonly width: number;
  readonly height: PreviewViewportHeight;
  readonly deviceScaleFactor?: number;
}

export type PreviewViewportOverride =
  | true
  | {
      readonly width?: number;
      readonly height?: PreviewViewportHeight;
      readonly deviceScaleFactor?: number;
    };

export interface PreviewMetadata {
  readonly viewports?: Readonly<Record<string, PreviewViewportOverride>>;
  readonly inspection?: false | Inspection.Definition;
}
