import { template } from "@nmnmcc/preview";
import {
  preview as vuePreview,
  type VuePreviewOptions,
} from "@nmnmcc/preview-vue";
import { h } from "vue";
import ThemeProvider from "./ThemeProvider.vue";
import type { CardTheme } from "./theme";

interface AppPreviewOptions extends VuePreviewOptions {
  readonly theme?: CardTheme;
}

export const preview = template(
  ({
    render,
    theme = "light",
    ...metadata
  }: AppPreviewOptions): VuePreviewOptions => ({
    ...metadata,
    render: ({ ready }) =>
      h(ThemeProvider, { theme }, { default: () => render({ ready }) }),
  }),
  vuePreview,
);
