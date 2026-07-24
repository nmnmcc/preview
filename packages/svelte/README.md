# @nmnmcc/preview-svelte

Define Svelte Component previews for `@nmnmcc/preview`.

Requires Svelte 5 and Node 24 or later.

## Full guide

Install the public [`preview` skill](https://github.com/nmnmcc/preview/tree/main/skills/preview):

```sh
npx skills add nmnmcc/preview --skill preview
```

Use `$preview` for Application routes, matrices, capture settings, and artifact
generation.

## Minimal setup

Add Preview to an existing Svelte Vite project:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-svelte playwright@^1.61.0
yarn playwright install chromium
```

Put Preview after `svelte()` in `vite.config.ts`:

```ts
import preview from "@nmnmcc/preview";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte(),
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

Add `Card.preview.ts`:

```ts
import { preview } from "@nmnmcc/preview-svelte";
import Card from "./Card.svelte";

export default preview({
  component: Card,
  props: ({ done, emit }) => ({ done, emit }),
});
```

Call the given function after the component is mounted:

```svelte
<script lang="ts">
  import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
  import { onMount } from "svelte";

  let {
    done,
    emit,
  }: { readonly done: PreviewDone; readonly emit: PreviewEmit } = $props();

  preview: {
    onMount(() => {
      void emit("default").then(done);
    });
  }
</script>

<article>Hello Preview</article>
```

Keep capture-only lifecycle work in an exact lowercase `preview: { ... }`
block.

Run `yarn preview generate Card.preview.ts`. Preview unmounts the component
after capture.

Licensed under Apache-2.0.
