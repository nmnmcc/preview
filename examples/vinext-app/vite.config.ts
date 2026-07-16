import preview, { ViewportPresets } from "@nmnmcc/preview";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [
    vinext(),
    preview({
      capture: { viewports: ViewportPresets.Tailwind },
      artifacts: { clean: true },
    }),
  ],
});
