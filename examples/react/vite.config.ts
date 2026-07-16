import preview, { ViewportPresets } from "@nmnmcc/preview";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    preview({
      files: {
        include: "src/**/*.preview.{js,jsx,ts,tsx}",
        exclude: "src/**/*.draft.preview.{js,jsx,ts,tsx}",
      },
      capture: { viewports: ViewportPresets.Tailwind },
      artifacts: { clean: true },
    }),
  ],
});
