# @nmnmcc/preview-svelte

Define Svelte 5 previews for `@nmnmcc/preview`.

Add Preview to an existing Svelte Vite project. The project already has
Svelte, Vite, and `@sveltejs/vite-plugin-svelte`. Add Preview, the required
Effect version, and Playwright:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-svelte effect@4.0.0-beta.98 playwright
yarn playwright install chromium
```

Register Preview after the Svelte plugin:

```ts
import preview from "@nmnmcc/preview"
import { svelte } from "@sveltejs/vite-plugin-svelte"

export default {
  plugins: [
    svelte(),
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

Use a component and a typed props function in each preview file:

```ts
import { preview } from "@nmnmcc/preview-svelte"
import Card from "./Card.svelte"

export default preview({
  component: Card,
  props: ({ ready }) => ({
    title: "Ready",
    ready
  })
})
```

The props must match the component. Call `ready()` after Svelte commits the
final UI. Preview unmounts the component after capture.

Use an Application preview for a SvelteKit route that reads `$app/*`, runs a
`load` function, or needs server rendering. Do not mock those modules in a
component preview.

Use SvelteKit's typed `resolve()` helper in the preview file:

```ts
import { application } from "@nmnmcc/preview/application"
import { resolve } from "$app/paths"

export default application({
  location: resolve("/items/[id]", { id: "42" })
})
```

Call the Application `ready()` function from the route:

```svelte
<script lang="ts">
  import { ready } from "@nmnmcc/preview/application"
  import { onMount } from "svelte"

  preview: {
    onMount(ready)
  }
</script>
```

Preview keeps the block in the development server. Each production Vite build
removes the full block from its output.

The component adapter uses Svelte's public `mount()` and `unmount()` functions.
TypeScript checks the preview props against the selected component.

Requires Svelte 5 and Node 24 or later.
Licensed under Apache-2.0.
