import preview, { ViewportPresets } from "@nmnmcc/preview";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte(),
    preview({
      capture: { viewports: ViewportPresets.Tailwind },
      artifacts: { clean: true },
    }),
  ],
});
