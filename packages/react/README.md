# @nmnmcc/preview-react

Define React previews for `@nmnmcc/preview`.

Add Preview to an existing React Vite project. The project already has React,
Vite, and `@vitejs/plugin-react`. Add Preview, the required Effect version,
and Playwright:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-react effect@4.0.0-beta.98 playwright
yarn playwright install chromium
```

Register Preview after the React plugin:

```ts
import react from "@vitejs/plugin-react"
import preview from "@nmnmcc/preview"

export default {
  plugins: [
    react(),
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

Select React in each `*.preview.tsx` file:

```tsx
import type { PreviewReady } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"
import { useEffect } from "react"

const Card = ({ ready }: { readonly ready: PreviewReady }) => {
  useEffect(() => {
    ready()
  }, [ready])

  return <article>Ready</article>
}

export default preview({
  render: ({ ready }) => <Card ready={ready} />
})
```

## Shared setup

Make one local preview function when all previews need the same CSS or React
providers. Import this function from project preview files instead of importing
the React package there.

```tsx
import { template } from "@nmnmcc/preview"
import {
  preview as reactPreview,
  type ReactPreviewOptions
} from "@nmnmcc/preview-react"
import { ThemeProvider } from "./theme"
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

This shared module can import Tailwind CSS and hold a language provider. The
template can also add type-safe project options such as `theme` or `locale`.
The map is synchronous. Use the existing `ready()` signal for async work.

Call `ready()` after React has committed the final UI. Preview also waits for
the mount work. It does not add another frame, font, selector, or network
wait. Preview unmounts the React root after capture.

The same component adapter works in a vinext project. Use an Application
preview for a vinext route that needs App Router or Pages Router state.

Mark the outer route lifecycle statement so production builds remove it:

```tsx
import { ready } from "@nmnmcc/preview/application"
import { useEffect } from "react"

export function ProjectRoute() {
  preview: {
    useEffect(() => {
      ready()
    }, [])
  }

  return <main>Project</main>
}
```

Preview keeps this hook in the development server. Each production Vite build
removes the full `preview` block from its output.

## Variant matrices

Use the core `matrix` helper with the React `preview` function or a local
template. This example makes four variants.

```tsx
import { matrix } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"

export default matrix(
  {
    axes: {
      theme: ["light", "dark"],
      state: ["ready", "error"]
    }
  },
  ({ theme, state }) => preview({
    render: ({ ready }) => (
      <Card ready={ready} state={state} theme={theme} />
    )
  })
)
```

The same helper works with a local `preview` template. Each matrix variant
keeps the CSS and providers from that template.

Requires React 18.3/19 and Node 24 or later.
Licensed under Apache-2.0.
