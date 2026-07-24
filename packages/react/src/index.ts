import {
  preview as corePreview,
  template,
  type ComponentPreviewDefinition,
  type Preview,
  type PreviewDone,
  type PreviewEmit,
  type PreviewOptions,
} from "@nmnmcc/preview";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface ReactPreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: {
    readonly emit: PreviewEmit;
    readonly done: PreviewDone;
  }) => ReactNode;
}

export const preview: Preview.PreviewTemplate<
  ReactPreviewOptions,
  ComponentPreviewDefinition
> = template(({ render, ...metadata }: ReactPreviewOptions): PreviewOptions => {
  return {
    ...metadata,
    mount: ({ root, emit, done }) => {
      const reactRoot = createRoot(root);
      reactRoot.render(render({ emit, done }));
      return () => reactRoot.unmount();
    },
  };
}, corePreview);
