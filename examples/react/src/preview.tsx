import { template } from "@nmnmcc/preview";
import {
  preview as react,
  type ReactPreviewOptions,
} from "@nmnmcc/preview-react";
import { createContext } from "react";

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
    render: ({ ready }) => (
      <PreviewLocaleContext.Provider value={locale}>
        {render({ ready })}
      </PreviewLocaleContext.Provider>
    ),
  }),
  react,
);
