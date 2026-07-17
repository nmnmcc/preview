# @nmnmcc/preview-vue

Define Vue Component previews for `@nmnmcc/preview`.

Requires Vue 3.2.25 or later and Node 24 or later.

## Full guide

Install the public [`preview` skill](https://github.com/nmnmcc/preview/tree/main/skills/preview):

```sh
npx skills add nmnmcc/preview --skill preview
```

Use `$preview` for shared providers, matrices, Application routes, capture
settings, and artifact generation.

## Minimal setup

Add Preview to an existing Vue Vite project:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-vue playwright@^1.61.0
yarn playwright install chromium
```

Put Preview after `vue()` in `vite.config.ts`:

```ts
import preview from "@nmnmcc/preview";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
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
import type { PreviewReady } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-vue";
import { defineComponent, h, onMounted, type PropType } from "vue";
import Card from "./Card.vue";

const Subject = defineComponent({
  props: {
    ready: {
      type: Function as PropType<PreviewReady>,
      required: true,
    },
  },
  setup(props) {
    preview: {
      onMounted(() => props.ready());
    }

    return () => h(Card);
  },
});

export default preview({
  render: ({ ready }) => h(Subject, { ready }),
});
```

Keep capture-only lifecycle work in an exact lowercase `preview: { ... }`
block.

Run `yarn preview generate Card.preview.ts`. Preview unmounts the Vue app after
capture.

Licensed under Apache-2.0.
