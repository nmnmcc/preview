import preview from "@nmnmcc/preview";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    reactRouter(),
    preview({
      capture: {
        inspection: true,
        playwright: {
          context: { colorScheme: "light", locale: "en-US" },
          screenshot: {
            animations: "disabled",
            caret: "hide",
            scale: "css",
          },
        },
        viewports: {
          desktop: { height: 960, width: 1536 },
          mobile: { height: 844, width: 390 },
        },
      },
      artifacts: { clean: true },
    }),
  ],
});
