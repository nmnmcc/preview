# @nmnmcc/preview-vue

Define Vue previews for `@nmnmcc/preview`.

```sh
yarn add vue
yarn add -D @vitejs/plugin-vue @nmnmcc/preview @nmnmcc/preview-cli @nmnmcc/preview-vue playwright
```

Keep the normal Vue and Preview plugin setup:

```ts
import vue from "@vitejs/plugin-vue"
import preview from "@nmnmcc/preview"

export default {
  plugins: [
    vue(),
    preview({
      viewports: {
        desktop: { width: 1440, height: 900 }
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
  render: ({ done }) => {
    void nextTick(done)
    return h(Card)
  }
})
```

Use `nextTick(done)` when the first Vue update is the final UI. Call `done()`
later when the component waits for other work. Preview also waits for the Vue
mount to return. It does not add another frame, font, selector, or network
wait.

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
    render: ({ done }) => h(
      ThemeProvider,
      { theme },
      { default: () => render({ done }) }
    )
  }),
  vuePreview
)
```

The template can add type-safe project options such as `theme` or `locale`.
The map is synchronous. Use the existing `done()` signal for async ready work.

Requires Vue 3.2.25 or a later Vue 3 release and Node
`^20.19.0 || >=22.12.0`. Licensed under Apache-2.0.
