import {
  preview as corePreview,
  template,
  type ComponentPreviewDefinition,
  type Preview,
  type PreviewOptions,
  type PreviewReady,
} from "@nmnmcc/preview";
import { createApp, type VNodeChild } from "vue";

export interface VuePreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: { readonly ready: PreviewReady }) => VNodeChild;
}

export const preview: Preview.PreviewTemplate<
  VuePreviewOptions,
  ComponentPreviewDefinition
> = template(({ render, ...metadata }: VuePreviewOptions): PreviewOptions => {
  return {
    ...metadata,
    mount: ({ root, ready }) => {
      const app = createApp({ render: () => render({ ready }) });
      app.mount(root);
      return () => app.unmount();
    },
  };
}, corePreview);
