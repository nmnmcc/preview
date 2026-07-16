# @nmnmcc/preview-react

Define React previews for `@nmnmcc/preview`.

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-cli @nmnmcc/preview-react playwright
```

Keep the normal Vite plugin setup:

```ts
import preview from "@nmnmcc/preview"

export default {
  plugins: [preview({
    viewports: {
      desktop: { width: 1440, height: 900 }
    }
  })]
}
```

Select React in each `*.preview.tsx` file:

```tsx
import type { Preview } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"
import { useEffect } from "react"

const Card = ({ done }: { readonly done: Preview.PreviewDone }) => {
  useEffect(() => {
    done()
  }, [done])

  return <article>Ready</article>
}

export default preview({
  render: ({ done }) => <Card done={done} />
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
    render: ({ done }) => (
      <ThemeProvider name={theme}>{render({ done })}</ThemeProvider>
    )
  }),
  reactPreview
)
```

This shared module can import Tailwind CSS and hold an i18n provider. The
template can also add type-safe project options such as `theme` or `locale`.
The map is synchronous. Use the existing `done()` signal for async ready work.

Call `done()` after React has committed the final UI. Preview also waits for
the render function to return. It does not add another frame, font, selector,
or network wait.

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
    render: ({ done }) => (
      <Card done={done} state={state} theme={theme} />
    )
  })
)
```

The same helper works with a local `preview` template. Each matrix variant
keeps the CSS and providers from that template.

Requires React 18.3/19 and Node `^20.19.0 || >=22.12.0`.
Licensed under Apache-2.0.
