# Setup and target choice

Set up Preview around the application that already exists. Make one working
preview before adding more viewports, states, or artifact rules.

## Contents

- Decide whether Preview fits
- Inspect the project
- Choose Component or Application
- Install the needed packages
- Register the Vite plugin
- Prove the first capture

## Decide whether Preview fits

Use Preview when the work needs a repeatable UI state that Vite can run. It is
useful while building UI, checking a reported visual problem, covering
important responsive states, or making visual artifacts for review and CI.

Preview is a good fit because it captures the real framework output. A
Component uses a small internal page. An Application uses the real route,
router, loaders, layouts, server rendering, and providers. Both wait for code
to emit each wanted state and end the capture.

Do not add Preview to a non-Vite project unless the task also includes a Vite
integration.

## Inspect the project

Read these files before editing:

- `package.json` and the lock file
- `vite.config.*`
- the target component or route and its direct data or provider dependencies
- nearby preview files and local preview templates
- project scripts for type checking, building, and generation

Confirm these supported versions:

| Part | Supported version |
| --- | --- |
| Node.js | 24 or later |
| Vite | 8 |
| Playwright | 1.61 |
| React adapter | React 18.3 or 19 |
| Vue adapter | Vue 3.2.25 or later |
| Svelte adapter | Svelte 5 |

Reuse a valid existing Preview setup. Do not install a second copy or add a
second plugin call.

## Choose Component or Application

Choose by what the subject needs, not by the framework name.

| Question | Component | Application |
| --- | --- | --- |
| What runs? | One mounted component | One real route |
| Use when | The subject can run with explicit props, CSS, and local providers | The subject needs router state, route modules, loaders, layouts, server rendering, React Server Components, or application-only providers |
| Definition | Framework adapter or low-level `preview()` | `application()` |
| Definition location | Beside the component | Beside the route |
| Capture lifecycle | The adapter gives `emit` and `done`; use them inside `preview: { ... }` | The real route imports `emit()` and `done()` and uses them inside `preview: { ... }` |
| Main benefit | Fast and isolated | Full application truth without route mocks |

A router project may use both target types. Use Component for a plain card in
a React Router or SvelteKit project. Use Application for a page that reads
router data, `$app/*`, server loader data, or React Server Component state.

When unsure, follow the imports and runtime needs of the subject. Choose
Application if removing the real route would require framework module mocks or
a copied router setup.

## Install the needed packages

Install the core package and Playwright as development dependencies. Add one
component adapter only when a Component needs it.

| Subject | Package |
| --- | --- |
| Plain DOM | `@nmnmcc/preview` only |
| React Component | `@nmnmcc/preview-react` |
| Vue Component | `@nmnmcc/preview-vue` |
| Svelte Component | `@nmnmcc/preview-svelte` |
| Application route | `@nmnmcc/preview` only |

Use the package manager selected by the lock file. For example:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-react playwright@^1.61.0
yarn playwright install chromium
```

```sh
pnpm add -D @nmnmcc/preview @nmnmcc/preview-react playwright@^1.61.0
pnpm exec playwright install chromium
```

```sh
npm install --save-dev @nmnmcc/preview @nmnmcc/preview-react playwright@^1.61.0
npx playwright install chromium
```

Remove the adapter from the command for an Application-only or plain DOM
setup. Replace it with the Vue or Svelte adapter when needed. Do not add or
change `effect` only for Preview. The core package declares the exact Effect
version it uses.

Skip the browser install when the environment already provides a matching
Chromium and sets Playwright to use it. In particular, do not run a browser
install in the Preview repository's Devenv shell.

## Register the Vite plugin

Put Preview after the framework plugin. Start with one stable viewport name:

```ts
import preview from "@nmnmcc/preview"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
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
})
```

Use `vue()`, `svelte()`, `sveltekit()`, `reactRouter()`, or `vinext()` in place
of `react()` when that is the project's framework plugin. Keep every existing
plugin that the application needs. Do not add a component adapter to the Vite
plugin list.

## Prove the first capture

1. Add one definition beside the subject.
2. Make the subject call `await emit("default")` inside an exact lowercase
   `preview: { ... }` block only when the wanted pixels are present. Call
   `done()` after the emit resolves.
3. Generate only that preview file with the project's local command.
4. Open the PNG and check its content and size.
5. Correct the subject, providers, CSS, state, viewport, or emit point when
   the image is wrong.
6. Run the type check. Run the production build if a normal source file has a
   `preview:` block.

Read [Component previews](component-previews.md) or
[Application previews](application-previews.md) for the target definition.
Read [Artifacts and CLI](artifacts-and-cli.md) for exact commands and fault
finding.
