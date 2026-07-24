import {
  preview as corePreview,
  template,
  type ComponentPreviewDefinition,
  type Preview,
  type PreviewDone,
  type PreviewEmit,
  type PreviewOptions,
} from "@nmnmcc/preview";
import { createApp, type VNodeChild } from "vue";

export interface VuePreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: {
    readonly emit: PreviewEmit;
    readonly done: PreviewDone;
  }) => VNodeChild;
}

export const preview: Preview.PreviewTemplate<
  VuePreviewOptions,
  ComponentPreviewDefinition
> = template(({ render, ...metadata }: VuePreviewOptions): PreviewOptions => {
  return {
    ...metadata,
    mount: ({ root, emit, done }) => {
      const app = createApp({ render: () => render({ emit, done }) });
      app.mount(root);
      return () => app.unmount();
    },
  };
}, corePreview);
