# Component previews

Use a Component preview for UI that can run with explicit props, CSS, and
local providers. Preview mounts it in a small internal page, captures each
named state from `emit()`, waits for `done()`, and then unmounts it.

This target gives fast visual feedback without starting the real router. Do
not use it when the subject needs route modules, loaders, server rendering, or
application-only state.

## Contents

- Follow the Component lifecycle
- Use the low-level DOM API
- Add a React Component
- Add a Vue Component
- Add a Svelte Component
- Emit states with the code that knows their pixels
- Share CSS and providers
- Select per-preview viewports
- Handle cleanup and cancellation

## Follow the Component lifecycle

Keep one default export in each `*.preview.{js,jsx,ts,tsx}` file. The default
may be one definition, a named collection, or a matrix.

Use a preview-only wrapper when the first state means only “the framework
mounted the subject.” Keep that wrapper in the preview file or in a file
imported only by previews. Put its capture lifecycle work in an exact lowercase
`preview: { ... }` block.

Let the product component own the lifecycle when it alone knows that data,
fonts, images, animation, or another visible state is present. Make the
callbacks optional so the normal application can omit them. Put only its
capture lifecycle work in an exact lowercase `preview: { ... }` block.

The block is required for every Component emit and done call, including calls
in a preview-only wrapper or low-level mount. Never replace it with a fixed
delay.

## Use the low-level DOM API

Use the core API for plain DOM or a framework without an adapter:

```ts
import { preview } from "@nmnmcc/preview"

export default preview({
  mount: async ({ root, emit, done }) => {
    const card = document.createElement("article")
    card.textContent = "Hello Preview"
    root.append(card)

    preview: {
      await emit("default")
      done()
    }

    return () => card.remove()
  }
})
```

The mount may be async. It may return sync or async cleanup work.

## Add a React Component

Use `@nmnmcc/preview-react`. Put a preview-only wrapper in
`Card.preview.tsx` when mount is the first capture point:

```tsx
import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"
import { useEffect } from "react"
import { Card } from "./Card"

const Subject = ({ done, emit }: {
  readonly done: PreviewDone
  readonly emit: PreviewEmit
}) => {
  preview: {
    useEffect(() => {
      void emit("default").then(done)
    }, [done, emit])
  }

  return <Card title="Ready" />
}

export default preview({
  render: ({ done, emit }) => <Subject done={done} emit={emit} />
})
```

Preview unmounts the React root after capture.

If `Card` loads its own final state, give it an optional callback instead:

```tsx
import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview"
import { useEffect } from "react"

interface CardProps {
  readonly data?: { readonly title: string }
  readonly done?: PreviewDone
  readonly emit?: PreviewEmit
}

export const Card = ({ data, done, emit }: CardProps) => {
  preview: {
    useEffect(() => {
      if (data !== undefined && done !== undefined && emit !== undefined) {
        void emit("loaded").then(done)
      }
    }, [data, done, emit])
  }

  return <article>{data?.title ?? "Loading"}</article>
}
```

Pass the adapter callback from `Card.preview.tsx`. Run the application
production build after adding the label.

## Add a Vue Component

Use `@nmnmcc/preview-vue`. A preview-only Vue wrapper can signal after mount:

```ts
import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-vue"
import { defineComponent, h, onMounted, type PropType } from "vue"
import Card from "./Card.vue"

const Subject = defineComponent({
  props: {
    done: {
      type: Function as PropType<PreviewDone>,
      required: true
    },
    emit: {
      type: Function as PropType<PreviewEmit>,
      required: true
    }
  },
  setup(props) {
    preview: {
      onMounted(async () => {
        await props.emit("default")
        props.done()
      })
    }

    return () => h(Card, { title: "Ready" })
  }
})

export default preview({
  render: ({ done, emit }) => h(Subject, { done, emit })
})
```

Preview unmounts the Vue application after capture. When the product component
knows the wanted states, give it optional `PreviewEmit` and `PreviewDone`
props. Use them from `onMounted()` or a later state watcher inside
`preview: { ... }`. Use `nextTick()` only when the next Vue update is part of
the wanted UI.

## Add a Svelte Component

Use `@nmnmcc/preview-svelte`. A preview-only Svelte wrapper can signal after
mount. Put this in `CardPreviewSubject.svelte`:

```svelte
<script lang="ts">
  import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview"
  import { onMount } from "svelte"
  import Card from "./Card.svelte"

  let { done, emit }: {
    readonly done: PreviewDone
    readonly emit: PreviewEmit
  } = $props()

  preview: {
    onMount(() => {
      void emit("default").then(done)
    })
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
  props: ({ done, emit }) => ({ done, emit })
})
```

Preview uses Svelte's public `mount()` and `unmount()` functions. When the
product component knows the wanted states, give it optional `PreviewEmit` and
`PreviewDone` props. Use them from `onMount()` or a later state effect inside
`preview: { ... }`.

## Emit states with the code that knows their pixels

Call `await emit(name)` inside `preview: { ... }` after all visible work for
that named artifact is complete. Examples include:

- the framework commit or mount
- a data request that changes the wanted state
- a web font or image needed by the layout
- a state transition that the preview is meant to show

Use a lowercase name that starts with a letter or number and then uses letters,
numbers, `_`, or `-`. Await each call before changing the UI or emitting the
next state. A name may appear only once for one target, variant, and viewport.
Call `done()` after at least one emit resolves. Repeated `done()` calls have no
effect. Preview does not add a frame wait, font wait, selector wait,
network-idle wait, or time delay. Add the exact wait that the UI needs and no
broader wait.

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
    render: ({ done, emit }) => (
      <ThemeProvider name={theme}>{render({ done, emit })}</ThemeProvider>
    )
  }),
  reactPreview
)
```

Import this local `preview` function from component preview files. Keep the
map synchronous. Put async work in the mounted UI and signal it with
`emit()` and `done()` inside an exact lowercase `preview: { ... }` block.

## Select per-preview viewports

A definition without `viewports` uses every project viewport. Select or
change named project viewports in the definition:

```tsx
export default preview({
  viewports: {
    mobile: true,
    desktop: { height: "full-960" }
  },
  render: ({ done, emit }) => <Subject done={done} emit={emit} />
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
- Preview requests unmount after `done()` or a capture failure. An unmount does
  not replace a missing `done()` call.
- Do not keep global listeners, timers, or other state after unmount.
