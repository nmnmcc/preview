import { type Preview, template } from "@nmnmcc/preview";
import { createApp, type VNodeChild } from "vue";

export interface VuePreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: {
    readonly done: Preview.PreviewDone;
  }) => VNodeChild;
}

export const preview = template(
  ({ render, ...metadata }: VuePreviewOptions): Preview.PreviewOptions => {
    return {
      ...metadata,
      render: (root, done) => {
        createApp({ render: () => render({ done }) }).mount(root);
      },
    };
  },
);
