import { template } from "@nmnmcc/preview";
import {
  preview as reactPreview,
  type ReactPreviewOptions,
} from "@nmnmcc/preview-react";
import { createContext } from "react";
import "./card.css";

export type PreviewLocale = "en" | "zh";

export const PreviewLocaleContext = createContext<PreviewLocale | undefined>(
  undefined,
);

export interface AppPreviewOptions extends ReactPreviewOptions {
  readonly locale?: PreviewLocale;
}

export const preview = template(
  ({
    locale = "en",
    render,
    ...metadata
  }: AppPreviewOptions): ReactPreviewOptions => ({
    ...metadata,
    render: ({ done }) => (
      <PreviewLocaleContext.Provider value={locale}>
        {render({ done })}
      </PreviewLocaleContext.Provider>
    ),
  }),
  reactPreview,
);
