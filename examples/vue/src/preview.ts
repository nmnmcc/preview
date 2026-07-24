import { template } from "@nmnmcc/preview";
import {
  preview as vuePreview,
  type VuePreviewOptions,
} from "@nmnmcc/preview-vue";
import { h } from "vue";
import type { CardTheme } from "./theme";
import ThemeProvider from "./ThemeProvider.vue";

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
    render: ({ done, emit }) =>
      h(ThemeProvider, { theme }, { default: () => render({ done, emit }) }),
  }),
  vuePreview,
);
