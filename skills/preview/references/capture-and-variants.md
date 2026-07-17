# Capture and variants

Use project-wide capture settings for facts shared by every preview. Keep the
first setup small. Add file rules, presets, full pages, matrices, concurrency,
or custom Playwright settings only when the result needs them.

Named settings make PNG paths stable and easy to read in local work and CI.

## Contents

- Configure discovery and capture
- Set Playwright options
- Use viewport presets
- Capture full pages
- Override one preview's viewports
- Generate state matrices

## Configure discovery and capture

This setup shows the main project-wide fields:

```ts
import preview, { ViewportPresets } from "@nmnmcc/preview"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    preview({
      files: {
        include: "src/**/*.preview.{js,jsx,ts,tsx}",
        exclude: "src/**/*.draft.preview.{js,jsx,ts,tsx}"
      },
      capture: {
        concurrency: 4,
        timeoutMs: 30_000,
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

The default include is `**/*.preview.{js,jsx,ts,tsx}`. An include or exclude
may be one glob or a list. Preview reads globs from the Vite project root.
Exclude wins. Preview always skips `node_modules/` and output directories for
the current run.

`capture.viewports` is required and must have at least one entry. Each key is
part of its artifact name. Use short names that will stay meaningful.

`capture.concurrency` limits all Playwright probe and capture page tasks. Its
default is `node:os.availableParallelism()`. Set it to `1` when a project or CI
environment needs sequential page work.

`capture.timeoutMs` controls navigation, the ready signal, and async unmount
work. Fix missing readiness or slow required work before increasing it.

Read [Artifacts and CLI](artifacts-and-cli.md) before changing output or clean
rules.

## Set Playwright options

Pass shared launch, browser context, and screenshot settings through the
plugin:

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

Keep these boundaries:

- `launch` goes to `chromium.launch()`. Preview is headless by default. An
  explicit `headless` value may change it.
- `context` goes to every discovery and capture context. Preview owns the
  viewport, device scale, JavaScript, online state, and Service Worker rules.
- `screenshot` may set animations, caret, background, CSS or device scale,
  style, and screenshot timeout behavior. Preview always asks for a PNG buffer
  and writes the file itself.
- Preview owns navigation options. Use `capture.timeoutMs` for navigation and
  readiness.
- Playwright checks the option values that it receives.

Preview starts Chromium only when a generation has at least one preview file.
It keeps the browser until Vite closes. If it disconnects, current page tasks
may fail and the next generation starts a new browser.

## Use viewport presets

Import all groups through the root namespace:

```ts
import preview, { ViewportPresets } from "@nmnmcc/preview"

preview({
  capture: {
    viewports: ViewportPresets.Storybook
  }
})
```

Or import individual groups from the viewport entry:

```ts
import { Mui, Storybook } from "@nmnmcc/preview/viewports"
```

The fixed groups contain these sizes:

| Group | Viewports |
| --- | --- |
| Tailwind | `base` 390x844, `sm` 640x960, `md` 768x1024, `lg` 1024x768, `xl` 1280x720, `2xl` 1536x864 |
| Bootstrap | `xs` 390x844, `sm` 576x864, `md` 768x1024, `lg` 992x744, `xl` 1200x800, `xxl` 1400x900 |
| Material UI | `xs` 390x844, `sm` 600x900, `md` 900x1200, `lg` 1200x800, `xl` 1536x864 |
| Ant Design | `xs` 390x844, `sm` 576x864, `md` 768x1024, `lg` 992x744, `xl` 1200x800, `xxl` 1600x900, `xxxl` 1920x1080 |
| Storybook | `mobile1` 320x568, `mobile2` 414x896, `tablet` 834x1112, `desktop` 1280x1024 |

Use bracket syntax for Tailwind `2xl`:

```ts
ViewportPresets.Tailwind["2xl"]
```

These are stable readonly size snapshots. They do not emulate a mobile user
agent, touch input, or another browser. They leave `deviceScaleFactor` unset,
so Preview uses `1`. Spread a preset to change it:

```ts
viewports: {
  sm: { ...ViewportPresets.Tailwind.sm, height: 800 }
}
```

## Capture full pages

A numeric height captures the visible viewport. Use `"full"` for a full-page
capture with a 720px layout height. Use `"full-N"` to set a positive safe
integer layout height:

```ts
viewports: {
  desktop: { width: 1280, height: "full-900" }
}
```

Both string forms capture the full scrollable page. The layout height controls
CSS viewport units and height media queries while Preview measures the page.

## Override one preview's viewports

A definition with no `viewports` uses all project viewports. Select or change
named project viewports in its metadata:

```tsx
export default preview({
  viewports: {
    mobile: true,
    desktop: { height: "full-960" }
  },
  render: ({ ready }) => <Subject ready={ready} />
})
```

`true` keeps the project value. An object changes part of it. Every name must
exist in the project-wide viewport record.

## Generate state matrices

Use `matrix()` when one Component needs every useful mix of named inputs:

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
  ({ theme, state }) =>
    preview({
      theme,
      render: ({ ready }) => (
        <Card ready={ready} state={state} />
      )
    })
)
```

Choose axes that change visible product meaning. Avoid a large Cartesian
product that adds no review value.

Keep these matrix rules:

- Give a matrix at least one axis and every axis at least one value.
- Start axis names and string values with an ASCII letter or digit. Use only
  ASCII letters, digits, `_`, or `-` after that.
- Use strings, booleans, or non-negative safe integers for axis values. Keep
  their text names distinct within one axis.
- Make each `exclude` a non-empty partial match with known axes and values.
- Make each named `include` set every axis once. Its values may be any string,
  number, or boolean because its explicit name becomes the artifact variant.
  Use a local lookup for complex values.
- Leave at least one variant after exclusions and includes.

A manual named collection is also valid:

```tsx
export default {
  empty: preview({ render: ({ ready }) => <Empty ready={ready} /> }),
  filled: preview({ render: ({ ready }) => <Filled ready={ready} /> })
}
```

Preview probes the full collection before capture. It captures each variant
and viewport on its own page. One failed target does not stop the remaining
targets.

Matrix artifacts use the variant and viewport in a stable name:

```text
.preview/Card.preview.tsx/theme=light,state=ready.desktop.png
```

A single definition uses only the viewport name:

```text
.preview/Card.preview.tsx/desktop.png
```
