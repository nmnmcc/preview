import react from "@vitejs/plugin-react";
import preview from "@nmnmcc/preview";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    preview({
      viewports: {
        mobile: { width: 390, height: 844 },
        desktop: { width: 1440, height: 900 },
      },
    }),
  ],
});
