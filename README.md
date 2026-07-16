# Preview

Preview is a Vite plugin. It turns `*.preview.ts` and `*.preview.tsx` files
into PNG files. It puts the output in a `.preview/` directory next to the
source file. It supports named viewports, automatic rebuilds in the
development server, variant matrices, and a command for CI use.

Preview requires Vite 8, Playwright 1.61, and Node
`^20.19.0 || >=22.12.0`.

## Use

Add the plugin, CLI, React package, and browser tool:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-cli @nmnmcc/preview-react playwright
yarn playwright install chromium
```

Set at least one named viewport in `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react"
import preview from "@nmnmcc/preview"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    preview({
      viewports: {
        mobile: { width: 390, height: 844 },
        desktop: { width: 1440, height: 900 }
      }
    })
  ]
})
```

Then add `Card.preview.tsx` to any source directory:

```tsx
import type { Preview } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"
import { useEffect } from "react"
import "./card.css"

const Card = ({ done }: { readonly done: Preview.PreviewDone }) => {
  useEffect(() => {
    done()
  }, [done])

  return <article>Hello Preview</article>
}

export default preview({
  viewports: {
    mobile: true,
    desktop: { height: 960 }
  },
  capture: "viewport",
  render: ({ done }) => <Card done={done} />
})
```

The default export can be one preview definition or a named collection. The
`render` function gets an object with a `done` function. Call `done()` after
the final UI is ready. Preview also waits for `render` to return or resolve.
It does not wait for frames, fonts, network idle, or a selector after that
point.

If you leave out `viewports`, Preview makes output for every project viewport.
Use `true` to use a project viewport as it is. Use an object to change its size
for this file. You can also give a file its own viewport with both `width` and
`height`.

## Shared setup

Use a local template when every preview needs the same setup. This module is
normal browser code. It can import a global CSS file and wrap the preview with
React providers.

Create `src/preview.tsx`:

```tsx
import { template } from "@nmnmcc/preview"
import {
  preview as reactPreview,
  type ReactPreviewOptions
} from "@nmnmcc/preview-react"
import { createContext } from "react"
import "./app.css"

type Locale = "en" | "zh"

export const LocaleContext = createContext<Locale>("en")

interface AppPreviewOptions extends ReactPreviewOptions {
  readonly locale?: Locale
}

export const preview = template(
  ({ locale = "en", render, ...metadata }: AppPreviewOptions): ReactPreviewOptions => ({
    ...metadata,
    render: ({ done }) => (
      <LocaleContext.Provider value={locale}>
        {render({ done })}
      </LocaleContext.Provider>
    )
  }),
  reactPreview
)
```

Import this local function from each preview file:

```tsx
import { preview } from "./preview"

export default preview({
  locale: "zh",
  render: ({ done }) => <Card done={done} />
})
```

Put `@import "tailwindcss";` in `app.css` when the project uses Tailwind. The
same module can use an i18n provider, a theme provider, or any other provider.
The map passed to `template` is synchronous. Keep async ready work in the UI
and call `done()` when it is complete. Preview still blocks outside HTTP(S)
requests, so bundle translation data or serve it from the same Vite origin.

The second argument to `template` is optional. Without it, the template uses
the core `preview` function. A returned template can be the base for another
template.

## Variant matrices

Use `matrix` when the same preview needs every mix of two or more inputs. Each
axis has a non-empty list. Preview calls the base preview function once for
each product of those lists.

```tsx
import { matrix } from "@nmnmcc/preview"
import { preview } from "./preview"

export default matrix(
  {
    axes: {
      locale: ["en", "zh"],
      state: ["ready", "error"]
    },
    exclude: [
      { locale: "zh", state: "error" }
    ],
    include: {
      "zh-error": { locale: "zh", state: "error" }
    }
  },
  ({ locale, state }) => preview({
    locale,
    render: ({ done }) => <Card done={done} state={state} />
  })
)
```

`exclude` entries are partial matches. The example removes one product.
`include` adds a direct, named call to the base function. It can add an input
that is not in an axis list. Each included input must still set every axis.

Axis values can be safe strings, booleans, or non-negative safe integers.
String values use letters, numbers, `_`, or `-`. Use a string key and a local
lookup table for an object, function, React node, or other complex fixture.
Preview keeps axis order and makes names such as
`locale=en,state=ready`.

You can also write a collection by hand:

```tsx
export default {
  empty: preview({ render: ({ done }) => <Empty done={done} /> }),
  filled: preview({ render: ({ done }) => <Filled done={done} /> })
}
```

Preview probes a collection without rendering it. It then renders each
variant and viewport on its own page. One failed variant does not stop the
other variants in that source file.

The output has this form:

```text
src/
├── Card.preview.tsx
└── .preview/
    ├── Card.locale=en,state=ready.mobile.png
    ├── Card.locale=en,state=ready.desktop.png
    └── ...
```

A single preview keeps the old form, such as `Card.mobile.png`.

When the Vite development server starts, the plugin makes every preview. After
that, it rebuilds only previews that use a changed module. Use these commands
for a manual or CI build:

```sh
preview
preview generate
preview generate src/Card.preview.tsx
preview generate 'src/**/*.preview.tsx'
preview generate --root ./examples/react
```

`preview` is a short form of `preview generate`. The command reads the Vite
setup for the project. If one target fails, the
process ends with a non-zero status. It still tries to build the other targets.
The command also provides help, version output, argument validation, and shell
completion scripts.

## Output rules

- Preview blocks outside HTTP(S) requests while it renders a page.
- A PNG shows the viewport by default. A project or file can use
  `capture: "fullPage"` instead.
- Preview writes to a temporary file and then replaces the target in one step.
  Readers do not see a half-written file.
- Preview does not remove old PNG files after a variant is renamed or removed.
  Remove stale files as part of your own clean step.
- `.preview/` is generated output. Add it to your version control ignore list.

## Browser runtime

The package has a browser entry for `@nmnmcc/preview`. It exports `preview`,
`template`, and `matrix` as direct helpers. It groups the other browser APIs
under `Preview` and `PreviewMatrix`. The namespaces include runtime schemas.
A browser bundle that imports these values may include their runtime
dependencies. The browser entry does not import Vite, Playwright, or Node
platform code.

Do not import `@nmnmcc/preview/internal/runner`. It is private to the Vite
plugin. Use `preview`, `template`, or `matrix` from the main package entry.

## Framework packages

The main package does not depend on a UI framework. The separate
`@nmnmcc/preview-react` and `@nmnmcc/preview-vue` packages add React and Vue
support. See the [Vue package](packages/vue/README.md) for Vue setup. A package
for another framework can map its input to the core preview options:

```ts
import {
  template,
  type Preview
} from "@nmnmcc/preview"

interface FrameworkView {
  readonly mount: (root: HTMLElement) => void | Promise<void>
}

interface FrameworkPreviewOptions extends Preview.PreviewMetadata {
  readonly render: (options: {
    readonly done: Preview.PreviewDone
  }) => FrameworkView
}

export const preview = template(
  (options: FrameworkPreviewOptions): Preview.PreviewOptions => {
    const { render, ...metadata } = options
    return {
      ...metadata,
      render: (root, done) => render({ done }).mount(root)
    }
  }
)
```

The Vite plugin only sees the core preview definition. It does not know which
framework package made it.

## Current scope

This is the first working version. Its main parts are React and Vue previews,
PNG files, more than one viewport, the command line tool, and small rebuilds
during development. It does not yet have an interactive panel, picture
comparison, or automatic browser setup. Users must install and cache the
Playwright browser.

Licensed under Apache-2.0.
