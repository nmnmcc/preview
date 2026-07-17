# Component previews

Use a Component preview for UI that can run with explicit props, CSS, and
local providers. Preview mounts it in a small internal page, waits for mount
work and `ready()`, captures it, and then unmounts it.

This target gives fast visual feedback without starting the real router. Do
not use it when the subject needs route modules, loaders, server rendering, or
application-only state.

## Contents

- Follow the Component lifecycle
- Use the low-level DOM API
- Add a React Component
- Add a Vue Component
- Add a Svelte Component
- Put readiness with the code that knows the final state
- Share CSS and providers
- Select per-preview viewports
- Handle cleanup and cancellation

## Follow the Component lifecycle

Keep one default export in each `*.preview.{js,jsx,ts,tsx}` file. The default
may be one definition, a named collection, or a matrix.

Use a preview-only wrapper when readiness means only “the framework mounted
the subject.” Keep that wrapper in the preview file or in a file imported only
by previews. Put its capture lifecycle work in an exact lowercase
`preview: { ... }` block.

Let the product component own readiness when it alone knows that data, fonts,
images, animation, or another visible state is final. Make the callback
optional so the normal application can omit it. Put only its capture lifecycle
work in an exact lowercase `preview: { ... }` block.

The block is required for every Component readiness signal, including one in a
preview-only wrapper or low-level mount. Never replace it with a fixed delay.

## Use the low-level DOM API

Use the core API for plain DOM or a framework without an adapter:

```ts
import { preview } from "@nmnmcc/preview"

export default preview({
  mount: ({ root, ready }) => {
    const card = document.createElement("article")
    card.textContent = "Hello Preview"
    root.append(card)

    preview: {
      ready()
    }

    return () => card.remove()
  }
})
```

The mount may be async. It may return sync or async cleanup work.

## Add a React Component

Use `@nmnmcc/preview-react`. Put a preview-only wrapper in
`Card.preview.tsx` when mount is the ready point:

```tsx
import type { PreviewReady } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"
import { useEffect } from "react"
import { Card } from "./Card"

const Subject = ({ ready }: { readonly ready: PreviewReady }) => {
  preview: {
    useEffect(() => {
      ready()
    }, [ready])
  }

  return <Card title="Ready" />
}

export default preview({
  render: ({ ready }) => <Subject ready={ready} />
})
```

Preview unmounts the React root after capture.

If `Card` loads its own final state, give it an optional callback instead:

```tsx
import type { PreviewReady } from "@nmnmcc/preview"
import { useEffect } from "react"

interface CardProps {
  readonly data?: { readonly title: string }
  readonly ready?: PreviewReady
}

export const Card = ({ data, ready }: CardProps) => {
  preview: {
    useEffect(() => {
      if (data !== undefined) ready?.()
    }, [data, ready])
  }

  return <article>{data?.title ?? "Loading"}</article>
}
```

Pass the adapter callback from `Card.preview.tsx`. Run the application
production build after adding the label.

## Add a Vue Component

Use `@nmnmcc/preview-vue`. A preview-only Vue wrapper can signal after mount:

```ts
import type { PreviewReady } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-vue"
import { defineComponent, h, onMounted, type PropType } from "vue"
import Card from "./Card.vue"

const Subject = defineComponent({
  props: {
    ready: {
      type: Function as PropType<PreviewReady>,
      required: true
    }
  },
  setup(props) {
    preview: {
      onMounted(() => props.ready())
    }

    return () => h(Card, { title: "Ready" })
  }
})

export default preview({
  render: ({ ready }) => h(Subject, { ready })
})
```

Preview unmounts the Vue application after capture. When the product component
knows the final state, give it an optional `PreviewReady` prop. Call it from
`onMounted()` or a later state watcher inside `preview: { ... }`. Use
`nextTick()` only when the next Vue update is the true final UI.

## Add a Svelte Component

Use `@nmnmcc/preview-svelte`. A preview-only Svelte wrapper can signal after
mount. Put this in `CardPreviewSubject.svelte`:

```svelte
<script lang="ts">
  import type { PreviewReady } from "@nmnmcc/preview"
  import { onMount } from "svelte"
  import Card from "./Card.svelte"

  let { ready }: { readonly ready: PreviewReady } = $props()

  preview: {
    onMount(ready)
  }
</script>

<Card title="Ready" />
```

Then add `Card.preview.ts`:

```ts
import { preview } from "@nmnmcc/preview-svelte"
import Subject from "./CardPreviewSubject.svelte"

export default preview({
  component: Subject,
  props: ({ ready }) => ({ ready })
})
```

Preview uses Svelte's public `mount()` and `unmount()` functions. When the
product component knows the final state, give it an optional `PreviewReady`
prop and call it from `onMount()` or a later state effect inside
`preview: { ... }`.

## Put readiness with the code that knows the final state

Call `ready()` inside `preview: { ... }` after all visible work required by the
artifact is complete. Examples include:

- the framework commit or mount
- a data request that changes the wanted state
- a web font or image needed by the layout
- a state transition that the preview is meant to show

The call is safe more than once. Preview does not add a frame wait, font wait,
selector wait, network-idle wait, or time delay. Add the exact wait that the UI
needs and no broader wait.

## Share CSS and providers

Import global CSS from the preview file or a local preview template. Use
`template()` when every preview needs the same provider, theme, language, or
other wrapper:

```tsx
import { template } from "@nmnmcc/preview"
import {
  preview as reactPreview,
  type ReactPreviewOptions
} from "@nmnmcc/preview-react"
import { ThemeProvider } from "./ThemeProvider"
import "./app.css"

interface AppPreviewOptions extends ReactPreviewOptions {
  readonly theme?: "light" | "dark"
}

export const preview = template(
  ({ theme = "light", render, ...metadata }: AppPreviewOptions): ReactPreviewOptions => ({
    ...metadata,
    render: ({ ready }) => (
      <ThemeProvider name={theme}>{render({ ready })}</ThemeProvider>
    )
  }),
  reactPreview
)
```

Import this local `preview` function from component preview files. Keep the
map synchronous. Put async work in the mounted UI and signal it with
`ready()` inside an exact lowercase `preview: { ... }` block.

## Select per-preview viewports

A definition without `viewports` uses every project viewport. Select or
change named project viewports in the definition:

```tsx
export default preview({
  viewports: {
    mobile: true,
    desktop: { height: "full-960" }
  },
  render: ({ ready }) => <Subject ready={ready} />
})
```

Every name must exist in the plugin's `capture.viewports` record. Read
[Capture and variants](capture-and-variants.md) for presets and height rules.

## Handle cleanup and cancellation

- Stop cancellable mount work when the low-level mount context's
  `AbortSignal` is aborted.
- Return cleanup from a low-level mount. Preview calls it once and waits up to
  `capture.timeoutMs`.
- Let the React, Vue, and Svelte adapters unmount their framework roots.
- Do not keep global listeners, timers, or other state after unmount.
