import { type Preview, template } from "@nmnmcc/preview";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface ReactPreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: {
    readonly done: Preview.PreviewDone;
  }) => ReactNode;
}

export const preview = template(
  ({ render, ...metadata }: ReactPreviewOptions): Preview.PreviewOptions => {
    return {
      ...metadata,
      render: (root, done) => {
        createRoot(root).render(render({ done }));
      },
    };
  },
);
