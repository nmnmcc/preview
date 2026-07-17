# @nmnmcc/preview

Define and run repeatable UI previews with the project's real Vite setup. This
package provides the Vite integration, low-level Component API, Application
API, viewport presets, matrices, and CLI.

Requires Node 24 or later, Vite 8, and Playwright 1.61.

## Full guide

Install the public [`preview` skill](https://github.com/nmnmcc/preview/tree/main/skills/preview):

```sh
npx skills add nmnmcc/preview --skill preview
```

Use `$preview` for framework setup, Application routes, capture settings,
matrices, artifacts, versioning, and CI generation.

## Minimal setup

Add the package to an existing Vite project:

```sh
yarn add -D @nmnmcc/preview playwright@^1.61.0
yarn playwright install chromium
```

Register the plugin in `vite.config.ts`:

```ts
import preview from "@nmnmcc/preview";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    preview({
      capture: {
        viewports: {
          desktop: { width: 1440, height: 900 },
        },
      },
    }),
  ],
});
```

Add `src/Card.preview.ts`:

```ts
import { preview } from "@nmnmcc/preview";

export default preview({
  mount: ({ root, ready }) => {
    const card = document.createElement("article");
    card.textContent = "Hello Preview";
    root.append(card);

    preview: {
      ready();
    }

    return () => card.remove();
  },
});
```

Keep capture-only lifecycle work in an exact lowercase `preview: { ... }`
block.

Run the preview:

```sh
yarn preview generate src/Card.preview.ts
```

The default output is `src/.preview/Card.preview.ts/desktop.png`.

Use `@nmnmcc/preview-react`, `@nmnmcc/preview-vue`, or
`@nmnmcc/preview-svelte` for framework components. Do not import
`@nmnmcc/preview/internal/runner`.

Licensed under Apache-2.0.
