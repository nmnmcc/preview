# @nmnmcc/preview-vue

Define Vue previews for `@nmnmcc/preview`.

Add Preview to an existing Vue Vite project. The project already has Vue,
Vite, and `@vitejs/plugin-vue`. Add Preview, the required Effect version, and
Playwright:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-vue effect@4.0.0-beta.98 playwright
yarn playwright install chromium
```

Register Preview after the Vue plugin:

```ts
import vue from "@vitejs/plugin-vue"
import preview from "@nmnmcc/preview"

export default {
  plugins: [
    vue(),
    preview({
      capture: {
        viewports: {
          desktop: { width: 1440, height: 900 }
        }
      }
    })
  ]
}
```

Import a Vue component from each `*.preview.ts` file:

```ts
import { preview } from "@nmnmcc/preview-vue"
import { h, nextTick } from "vue"
import Card from "./Card.vue"

export default preview({
  render: ({ ready }) => {
    void nextTick(ready)
    return h(Card)
  }
})
```

Use `nextTick(ready)` when the first Vue update is the final UI. Call `ready()`
later when the component waits for other work. Preview also waits for the Vue
mount work. It does not add another frame, font, selector, or network wait.
Preview unmounts the Vue app after capture.

## Shared setup

Make one local preview function when all previews need the same CSS or Vue
provider components. Import this function from project preview files instead
of importing the Vue package there.

```ts
import { template } from "@nmnmcc/preview"
import {
  preview as vuePreview,
  type VuePreviewOptions
} from "@nmnmcc/preview-vue"
import { h } from "vue"
import ThemeProvider from "./ThemeProvider.vue"
import "./app.css"

interface AppPreviewOptions extends VuePreviewOptions {
  readonly theme?: "light" | "dark"
}

export const preview = template(
  ({ theme = "light", render, ...metadata }: AppPreviewOptions): VuePreviewOptions => ({
    ...metadata,
    render: ({ ready }) => h(
      ThemeProvider,
      { theme },
      { default: () => render({ ready }) }
    )
  }),
  vuePreview
)
```

The template can add type-safe project options such as `theme` or `locale`.
The map is synchronous. Use the existing `ready()` signal for async work.

Use a `preview` label in an Application route:

```vue
<script setup lang="ts">
import { ready } from "@nmnmcc/preview/application"
import { onMounted } from "vue"

preview: {
  onMounted(ready)
}
</script>
```

Preview keeps the block in the development server. Each production Vite build
removes the full block from its output. The same rule works in the `setup()`
function of a normal `<script>` block.

Requires Vue 3.2.25 or a later Vue 3 release and Node 24 or later. Licensed
under Apache-2.0.
