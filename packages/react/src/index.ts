import {
  preview as corePreview,
  template,
  type ComponentPreviewDefinition,
  type Preview,
  type PreviewOptions,
  type PreviewReady,
} from "@nmnmcc/preview";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface ReactPreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: { readonly ready: PreviewReady }) => ReactNode;
}

export const preview: Preview.PreviewTemplate<
  ReactPreviewOptions,
  ComponentPreviewDefinition
> = template(
  ({ render, ...metadata }: ReactPreviewOptions): PreviewOptions => {
    return {
      ...metadata,
      mount: ({ root, ready }) => {
        const reactRoot = createRoot(root);
        reactRoot.render(render({ ready }));
        return () => reactRoot.unmount();
      },
    };
  },
  corePreview,
);
