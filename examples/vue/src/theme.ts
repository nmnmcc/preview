import type { InjectionKey, Ref } from "vue";

export type CardTheme = "light" | "dark";

export const PreviewThemeKey: InjectionKey<Readonly<Ref<CardTheme>>> =
  Symbol("preview-theme");
