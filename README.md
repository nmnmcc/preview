# Preview

Preview is a Vite plugin. It turns `*.preview.{js,jsx,ts,tsx}` files into PNG
files. By default, it puts each image in a `.preview/` directory next to the
source file. The `artifacts.output` setting can use another child directory.

Preview has two ways to define an image:

- `preview()` mounts one component in a small internal page.
- An **Application** opens a real route from the Vite application.

Use `preview()` for isolated UI. Use an Application when the view needs a
router, a server loader, app providers, or other framework state.

Preview requires Vite 8, Playwright 1.61, Effect 4.0.0-beta.98, and Node 24
or later.

## Install

Add Preview to an existing React Vite app. The app must already have React,
Vite, and `@vitejs/plugin-react`. Add Preview, its React adapter, the required
Effect version, and Playwright:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-react effect@4.0.0-beta.98 playwright
yarn playwright install chromium
```

Add Preview after the framework plugin in `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react"
import preview, { ViewportPresets } from "@nmnmcc/preview"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    preview({
      capture: {
        viewports: {
          mobile: ViewportPresets.Tailwind.base,
          desktop: ViewportPresets.Tailwind.xl
        }
      },
      artifacts: {
        clean: true,
        output: "artifacts/previews"
      }
    })
  ]
})
```

The same plugin also works after `reactRouter()`, `sveltekit()`, or
`vinext()`. Preview uses the public Vite plugin hooks. It does not patch a
framework plugin. React, Vue, and Svelte use the same Preview plugin setup.

The optional `files.include` and `files.exclude` settings accept one file
pattern (glob) or a list of patterns. A glob uses symbols such as `*` to match
file names. Preview reads each pattern from the Vite project root. The default
include pattern is `**/*.preview.{js,jsx,ts,tsx}`. With no exclude pattern,
Preview adds no project filter. An exclude match takes priority over an
include match. Preview always skips `node_modules/` and per-source directories
with a valid ownership marker under the output paths for the current run. The
marker is a small file that shows Preview owns the directory.

Set `artifacts.output` to a child directory path relative to each preview
source file. For example, `artifacts.output: "artifacts/previews"` gives
`src/Card.preview.tsx` the directory
`src/artifacts/previews/Card.preview.tsx/`. The default output is `.preview`.
The path cannot be absolute. It cannot contain `.` or `..` path parts or glob
syntax.

## Playwright options

Set project-wide Playwright options when capture needs another browser setup:

```ts
preview({
  capture: {
    playwright: {
      launch: {
        args: ["--force-color-profile=srgb"]
      },
      context: {
        colorScheme: "dark",
        locale: "en-GB"
      },
      screenshot: {
        animations: "disabled",
        scale: "css"
      }
    },
    timeoutMs: 30_000,
    viewports: {
      desktop: { width: 1280, height: 720 }
    }
  }
})
```

`launch` goes to `chromium.launch()` once for each generation. Preview uses
headless mode by default. An explicit `headless` value can change this.

`context` goes to every `browser.newContext()` used for discovery and capture.
Preview always gets the viewport and device scale factor from `viewports`. It
also keeps JavaScript on, keeps the context online, and blocks Service Workers.

`screenshot` goes to every `page.screenshot()` call. Preview always returns a
PNG buffer and writes the file itself. The viewport height controls full-page
capture. Screenshot options can change animation, caret, background, pixel
scale, style, and screenshot timeout behavior.

Preview keeps navigation options private. `capture.timeoutMs` controls
navigation and the Preview ready signal. Playwright checks the option values
that it receives.

## Viewport presets

Preview provides fixed viewport groups for common responsive design systems.
Use a full group when every breakpoint needs an image:

```ts
import preview, { ViewportPresets } from "@nmnmcc/preview"

export default {
  plugins: [
    preview({ capture: { viewports: ViewportPresets.Storybook } })
  ]
}
```

The viewport subpath exports `Tailwind`, `Bootstrap`, `Mui`, `Antd`, and
`Storybook` directly:

```ts
import { Mui, Storybook } from "@nmnmcc/preview/viewports"
```

You can also select a preset and give it a project name:

```ts
preview({
  capture: {
    viewports: {
      mobile: ViewportPresets.Mui.xs,
      desktop: ViewportPresets.Mui.lg
    }
  }
})
```

The groups have these sizes:

| Group | Viewports |
| --- | --- |
| [Tailwind](https://tailwindcss.com/docs/responsive-design) | `base` 390×844, `sm` 640×960, `md` 768×1024, `lg` 1024×768, `xl` 1280×720, `2xl` 1536×864 |
| [Bootstrap](https://getbootstrap.com/docs/5.3/layout/breakpoints/) | `xs` 390×844, `sm` 576×864, `md` 768×1024, `lg` 992×744, `xl` 1200×800, `xxl` 1400×900 |
| [Material UI](https://mui.com/material-ui/customization/breakpoints/) | `xs` 390×844, `sm` 600×900, `md` 900×1200, `lg` 1200×800, `xl` 1536×864 |
| [Ant Design](https://ant.design/components/grid/) | `xs` 390×844, `sm` 576×864, `md` 768×1024, `lg` 992×744, `xl` 1200×800, `xxl` 1600×900, `xxxl` 1920×1080 |
| [Storybook](https://storybook.js.org/docs/essentials/viewport) | `mobile1` 320×568, `mobile2` 414×896, `tablet` 834×1112, `desktop` 1280×1024 |

Use `ViewportPresets.Tailwind["2xl"]` to select the Tailwind `2xl` preset.

The framework groups use their default breakpoint widths. Preview adds a
height that is useful for capture. The `base` and `xs` presets use 390×844
because their framework ranges start at zero. The Storybook group keeps its
three minimal viewport sizes. Preview adds the `desktop` preset.

Each preset leaves `deviceScaleFactor` unset, so Preview uses `1`. The presets
set viewport size only. They do not set a user agent, touch input, or mobile
browser behavior.

The preset objects are stable, readonly snapshots. Existing values change only
in a breaking release. Spread a preset when a project needs a different value:

```ts
viewports: {
  sm: { ...ViewportPresets.Tailwind.sm, height: 800 }
}
```

A numeric height captures the visible viewport. Use `"full"` to capture the
full scrollable page with a 720px layout height. Use `"full-N"` to set a
different layout height. `N` must be a positive safe integer:

```ts
viewports: {
  desktop: { width: 1280, height: "full-900" }
}
```

Both full-height forms capture the full page. The layout height controls CSS
viewport units and height media queries while Preview measures the page.

## Examples

The [`examples`](examples/README.md) directory has runnable projects for React,
React Router, Vue, Svelte, SvelteKit, and vinext. The main framework examples
share one basic card preview and add a framework-specific case.

## Component previews

Add `Card.preview.tsx` next to an isolated component:

```tsx
import type { PreviewReady } from "@nmnmcc/preview"
import { preview } from "@nmnmcc/preview-react"
import { useEffect } from "react"

const Card = ({ ready }: { readonly ready: PreviewReady }) => {
  useEffect(() => {
    ready()
  }, [ready])

  return <article>Hello Preview</article>
}

export default preview({
  viewports: {
    mobile: true,
    desktop: { height: "full-960" }
  },
  render: ({ ready }) => <Card ready={ready} />
})
```

The preview gives `ready` to its mount function. Call `ready()` after the
final UI is ready. The call is safe more than once.

Preview waits for the mount work and `ready()`. It then captures the page.
It calls the returned unmount function once when the capture ends. The mount
context also has an `AbortSignal` for work that can stop early. Preview waits
up to `capture.timeoutMs` for async unmount work. It then closes the browser
context.

The default export can be one preview definition or a named collection. If a
preview has no `viewports`, it uses every project viewport. Use `true` to keep
a project viewport. Use an object to change part of it.

## Application previews

Use an Application preview for a framework route. This React Router example
uses the router's typed path helper:

```ts
import { application } from "@nmnmcc/preview/application"
import { href } from "react-router"

export default application({
  location: href("/projects/:projectId", { projectId: "42" })
})
```

The route calls the Application `ready()` function after its real UI is
ready:

```tsx
import { ready } from "@nmnmcc/preview/application"
import { useEffect } from "react"

export function ProjectRoute() {
  preview: {
    useEffect(() => {
      ready()
    }, [])
  }

  return <main>Project 42</main>
}
```

`preview:` is a standard JavaScript label. Preview keeps its block during
`vite serve`. During each Vite build, Vite asks Oxc, its JavaScript transform,
to remove the full block. This happens after framework plugins change the
module and before Vite removes code that no import uses. It also works when
`build.minify` is `false`, so Vite does not make the output smaller. The label
is fixed and case-sensitive. Use the exact lowercase name `preview` only for
capture code.

Preview checks the final JavaScript chunks for a remaining `preview` label,
Application runtime, definition, or import. The check runs for client,
server-side rendering (SSR), and custom Vite build environments. It reports
the environment, chunk, and match. Use `build.check: false` only when the
remaining code is intentional:

```ts
preview({
  build: { check: false },
  capture: { viewports: ViewportPresets.Tailwind }
})
```

`build.check: false` skips only this final check. Build-time label removal
still runs.

`ready()` is a no-op when the page is not under capture. It is also safe
during server rendering. Under capture, it marks the current document ready
once.

Preview does not read or match route patterns. It only opens the final
same-origin `location`. Use a framework path helper such as React Router
`href()` or SvelteKit `resolve()` to keep route values checked by that
framework. Redirects must stay on the Vite origin.

An Application runs the normal route, loader, layout, and providers. Preview
waits for navigation and Application `ready()` before capture. It does not
inject component props or mount a second app.

### vinext

Put Preview after vinext in the Vite plugin list:

```ts
import preview from "@nmnmcc/preview"
import { defineConfig } from "vite"
import vinext from "vinext"

export default defineConfig({
  plugins: [vinext(), preview({
    capture: {
      viewports: {
        desktop: { width: 1440, height: 900 }
      }
    }
  })]
})
```

Do not add a second React or React Server Components (RSC) plugin. vinext adds
the plugins that its router needs.

vinext does not provide a simple typed way to build a route location. Pass the
final same-origin URL to the Application preview instead:

```ts
export default application({
  location: "/projects/42"
})
```

See [`examples/vinext-app`](examples/vinext-app) and
[`examples/vinext-pages`](examples/vinext-pages). They test
`vinext@1.0.0-beta.2`. Preview receives only this final URL. It does not depend
on a vinext route pattern at run time.

## Why both APIs use `ready()`

Both forms use the same event name because the event has the same
meaning: the image may now be captured. The source is different:

- A component preview gets `ready` in its mount or render context.
- An Application imports `ready` from `@nmnmcc/preview/application`.

The package root exports the component preview API. The short
`@nmnmcc/preview/application` entry keeps the Application runtime separate.

## Shared component setup

Use a local template when every component preview needs the same CSS or
providers:

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

The map passed to `template` is synchronous. Keep async ready work in the UI.
The second argument can be any typed preview function. This lets templates
keep the exact target type from input to output.

## Variant matrices

Use `matrix` when one component preview needs every mix of one or more inputs:

```tsx
import { matrix } from "@nmnmcc/preview"
import { preview } from "./preview"

export default matrix(
  {
    axes: {
      theme: ["light", "dark"],
      state: ["ready", "error"]
    },
    exclude: [{ theme: "dark", state: "error" }]
  },
  ({ theme, state }) => preview({
    theme,
    render: ({ ready }) => (
      <Card ready={ready} state={state} />
    )
  })
)
```

Each matrix has at least one axis. Each axis has at least one value. Axis names,
string axis values, and `include` variant names must start with an ASCII letter
or digit. The rest may use ASCII letters, digits, `_`, or `-`. Axis values may
also be booleans or non-negative safe integers. Values in one axis must have
different names after conversion to text.

Each `exclude` entry is a partial match. It must name at least one known axis,
and each value must come from that axis. Each named `include` sets every axis
once and adds no other field. Its input values may use any string, number, or
boolean because the explicit variant name becomes the artifact name. Use a
string key and a local lookup table for complex test data. At least one
variant must remain after `exclude` and `include` are applied.

You can also write a collection by hand:

```tsx
export default {
  empty: preview({ render: ({ ready }) => <Empty ready={ready} /> }),
  filled: preview({ render: ({ ready }) => <Filled ready={ready} /> })
}
```

Preview probes a collection before it captures any item. It captures each
variant and viewport on its own page. One failed variant does not stop the
other variants in the file.

The output has this form:

```text
src/
├── Card.preview.tsx
└── .preview/
    └── Card.preview.tsx/
        ├── .nmnmcc-preview-artifacts
        ├── theme=light,state=ready.mobile.png
        ├── theme=light,state=ready.desktop.png
        └── ...
```

A single preview uses the viewport name, such as
`.preview/Card.preview.tsx/mobile.png`.

With `artifacts.output: "artifacts/previews"`, the same source writes to
`src/artifacts/previews/Card.preview.tsx/mobile.png` instead.

## Versioned artifacts

Versioning is off by default. Turn it on with an explicit retention count:

```ts
preview({
  capture: { viewports: ViewportPresets.Tailwind },
  artifacts: {
    version: { retain: 3 }
  }
})
```

Preview compares the new PNG bytes with the current PNG bytes. It does not
calculate a hash. Equal bytes reuse the current version. Changed bytes make a
new file with a sortable UTC time:

```text
.preview/Card.preview.tsx/
├── .nmnmcc-preview-artifacts
├── mobile@20260717T103045123Z.png
└── mobile.png -> mobile@20260717T103045123Z.png
```

`mobile.png` is a relative symbolic link to the current real file. Preview
updates this link in one step after it writes the real file. The file system
must support symbolic links. Preview does not fall back to a hard link or a
copy.

The time has millisecond precision. If two changes use the same clock time, or
the clock moves back, Preview adds one millisecond after the newest known
version. A return to older image bytes is still a new change because Preview
compares only with the current version.

`retain` includes the current real file. It does not count the symbolic link.
Retention runs whenever Preview writes or reuses a version. It does not depend
on `artifacts.clean`.

## Generate images

The Vite development server makes previews at start. When Vite can trace a
changed module to its preview importers, Preview rebuilds only those previews.
When Vite cannot map the change to a preview, Preview runs a full generation.
Use these commands for a manual or CI build:

```sh
preview
preview generate
preview generate src/Card.preview.tsx
preview generate 'src/**/*.preview.tsx'
preview generate --output artifacts/previews
preview generate --root ./examples/react
```

`preview` is a short form of `preview generate`. The command reads the Vite
setup for the project. If one target fails, the process ends with a non-zero
status. It still tries the other targets.

## Output and safety rules

- Preview blocks HTTP(S) requests to another origin when the captured browser
  page makes them. It does not block requests from server rendering, route
  loaders, server hooks, or other server code.
- Preview blocks Service Workers so they cannot bypass browser request
  interception.
- Application navigation and redirects must stay on the Vite origin.
- A numeric viewport height captures the visible viewport. `"full"` and
  `"full-N"` capture the full scrollable page. `N` sets the layout height.
- Preview writes a temporary file and then replaces the target in one step.
- Preview writes `.nmnmcc-preview-artifacts` in each exact per-source output
  directory that it owns.
- Preview accepts an existing output directory only when it is empty or has a
  valid ownership marker. It refuses to write into a non-empty unmarked
  directory. Move or remove an old unmarked output directory before you reuse
  that exact path.
- Set `artifacts.clean: true` to remove stale PNG files from directories with
  a valid marker. A path-limited run cleans only the selected source
  directories. A full run can also clean such directories for deleted sources.
- Preview never cleans a directory without a valid marker. It preserves old
  unmarked output and ordinary project directories. This rule also protects
  ordinary `src` or `images` paths when one of those names is used for
  `artifacts.output`.
- Preview does not clean a source when target discovery or metadata is not
  complete. A known target that fails capture keeps its last good artifact.
- Clean removes PNG files only from per-source directories with a valid marker.
  It keeps other files in those directories.
- `preview --output <path>` and `preview generate --output <path>` override
  `artifacts.output` for one CLI run.
- When an output override is used with `artifacts.clean: true`, a full run
  cleans directories with valid markers in both the configured output and the
  override.
- Marked output directories contain generated files. When the output is a
  dedicated generated path, add it to version control ignore rules. The
  default path is `.preview/`.

## Public entries

- `@nmnmcc/preview` exports the Vite plugin, component `preview()` function,
  lifecycle types, `template`, `matrix`, and shared namespaces.
- `@nmnmcc/preview/application` exports `application()` and `ready()`.
- `@nmnmcc/preview/viewports` exports the fixed viewport groups.
- `@nmnmcc/preview-react`, `@nmnmcc/preview-vue`, and
  `@nmnmcc/preview-svelte` adapt component mounts for each UI framework.

Preview uses Effect across its Node and browser code. The Node plugin composes
file, browser, rendering, and write work as Effect services and layers. The CLI
uses Effect's CLI module and Node platform. The capture runner uses the Effect
browser platform, Effect Schema for data checks, and Effect interruption to
stop work. The Application entry uses Effect Schema for runtime checks. It
does not import Vite, Playwright, or Node platform code, so it is safe in
browser and server application code.

Do not import `@nmnmcc/preview/internal/runner`. It is private to the Vite
plugin.

## Current scope

Preview supports component and Application previews, named viewports, variant
matrices, automatic rebuilds, and CI generation. It does not yet have an
interactive panel, image comparison, or automatic browser setup. Users must
install and cache the Playwright browser.

Licensed under Apache-2.0.
