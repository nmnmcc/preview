import preview, { ViewportPresets } from "@nmnmcc/preview";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vinext(),
    preview({
      capture: { viewports: ViewportPresets.Tailwind },
      artifacts: { clean: true },
    }),
  ],
});
