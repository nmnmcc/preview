# @nmnmcc/preview

Turn `*.preview.tsx` files in a Vite project into PNG files. The output goes in
a `.preview/` directory next to each source file.

See the [project README](../../README.md) for all settings, examples, and
usage details.

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-cli playwright
yarn playwright install chromium
```

Register the Vite plugin and set project viewports:

```ts
import preview from "@nmnmcc/preview"

export default {
  plugins: [preview({
    viewports: {
      mobile: { width: 390, height: 844 },
      desktop: { width: 1440, height: 900 }
    }
  })]
}
```

Each preview file uses the named `preview` export. Its `render` function must
return or resolve and call `done()`:

```ts
import { preview } from "@nmnmcc/preview"

export default preview({
  render: (root, done) => {
    root.textContent = "Ready"
    done()
  }
})
```

## Variant matrices

Use `matrix` to build all products of named axes. Its second argument is a
preview function. The values are fully typed in that function.

```ts
import { matrix, preview } from "@nmnmcc/preview"

export default matrix(
  {
    axes: {
      theme: ["light", "dark"],
      disabled: [false, true]
    },
    exclude: [{ theme: "dark", disabled: true }],
    include: {
      "forced-dark": { theme: "dark", disabled: true }
    }
  },
  ({ theme, disabled }) => preview({
    render: (root, done) => {
      root.dataset.theme = theme
      root.textContent = disabled ? "Disabled" : "Ready"
      done()
    }
  })
)
```

`exclude` uses partial axis matches. `include` adds exact named inputs. Axis
values can be safe strings, booleans, or non-negative safe integers. Use a
string key and a lookup table for complex fixture data.

You can export a named collection without `matrix`:

```ts
export default {
  empty: preview({ render: renderEmpty }),
  filled: preview({ render: renderFilled })
}
```

A collection file writes names such as
`Card.theme=light,disabled=false.mobile.png`. A single preview still writes
`Card.mobile.png`. Preview reports an optional `variant` on each collection
artifact or failure. It keeps rendering other variants after one variant
fails. It does not remove old PNG files.

## Templates

Use `template` to make a preview function with shared defaults or setup. Its
map changes the new input into the input needed by its base function.

```ts
import {
  template,
  type Preview
} from "@nmnmcc/preview"

interface TextPreviewOptions extends Preview.PreviewMetadata {
  readonly text: string
}

export const textPreview = template(
  ({ text, ...metadata }: TextPreviewOptions): Preview.PreviewOptions => ({
    ...metadata,
    render: (root, done) => {
      root.textContent = text
      done()
    }
  })
)
```

Pass another preview or template function as the second argument to build on
it. Leave out the second argument to use the core `preview` function. Maps are
synchronous. TypeScript checks that each map returns the input required by its
base.

## Public API

The root entry keeps common functions direct. It groups the other APIs by
module:

- The default export creates the Vite plugin.
- `preview`, `template`, and `matrix` are direct named exports.
- `Preview` holds preview helpers, types, and runtime schemas.
- `PreviewMatrix` holds the matrix helper and matrix types.
- `PreviewGeneration` holds generation result types and its runtime schema.
- `PreviewPlugin` holds the plugin factory and plugin contracts.

All other values and types are available only through these module
namespaces.

Use the namespaces for types and less common runtime values:

```ts
import type {
  Preview,
  PreviewGeneration,
  PreviewMatrix,
  PreviewPlugin
} from "@nmnmcc/preview"

type Done = Preview.PreviewDone
type Axes = PreviewMatrix.PreviewMatrixAxes
type Summary = PreviewGeneration.GenerationSummary
type PluginOptions = PreviewPlugin.PreviewPluginOptions
```

Browser builds use a small conditional entry. It keeps `preview`, `template`,
and `matrix` as direct exports. It also exports `Preview` and `PreviewMatrix`.
It does not export the default plugin, `PreviewPlugin`, or
`PreviewGeneration`.

The browser entry uses runtime schemas. A browser bundle that imports a
runtime value from this entry may include its runtime dependencies. It does
not import Vite, Playwright, or Node platform code.

`@nmnmcc/preview/internal/runner` is for the Vite plugin. It is not a supported
user API. Import public helpers and module namespaces from `@nmnmcc/preview`.

## Programmatic generation

Keep the plugin value when you create the Vite setup:

```ts
import preview from "@nmnmcc/preview"

export const previewPlugin = preview({
  viewports: {
    mobile: { width: 390, height: 844 }
  }
})

export default {
  plugins: [previewPlugin]
}
```

Call `generate` only after the Vite server is listening:

```ts
const summary = await previewPlugin.previewApi.generate({
  paths: ["src/Card.preview.tsx", "src/admin/**/*.preview.tsx"]
})
```

Leave out `paths`, or use an empty array, to generate every preview. A path can
name a file, a directory, or a glob. Calls run one at a time in call order. One
failed call does not block later calls.

The result includes successful artifacts and target failures. Collection
results include the variant name. Setup, discovery, and browser launch errors
reject the Promise. Always await `generate` before you close the Vite server.

Install `@nmnmcc/preview-cli` separately to get the `preview` command.

Install framework packages on their own. For React, use
`@nmnmcc/preview-react`.

Requires Vite 8, Playwright 1.61, and Node `^20.19.0 || >=22.12.0`.
Licensed under Apache-2.0.
