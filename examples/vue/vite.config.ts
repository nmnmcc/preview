import preview, { ViewportPresets } from "@nmnmcc/preview";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    preview({
      capture: { viewports: ViewportPresets.Tailwind },
      artifacts: { clean: true },
    }),
  ],
});
