# Application previews

Use an Application preview when the UI state needs a real route. Preview runs the
normal router, loaders, layouts, server rendering, React Server Components,
and application providers. It opens one final same-origin location and waits
for the route to call `ready()`.

This target gives route-level truth without copied router setup or framework
module mocks.

## Contents

- Follow the Application lifecycle
- Add a React Router Application
- Add a SvelteKit Application
- Add a vinext Application
- Mark the real route ready
- Keep capture code out of production
- Follow Application runtime rules

## Follow the Application lifecycle

An Application definition has no mount function and injects no props. Put it
in a `*.preview.{js,jsx,ts,tsx}` file beside the route. Give it the final URL,
not a route pattern:

```ts
import { application } from "@nmnmcc/preview/application"

export default application({
  location: "/projects/42"
})
```

Import Application `ready()` in the real route. Call it only after the route
has the state that the PNG must show. The function is a no-op outside capture
and is safe during server rendering.

An Application-only project needs `@nmnmcc/preview` and Playwright. It does
not need a React, Vue, or Svelte Component adapter.

## Add a React Router Application

Use React Router's typed `href()` helper in a nearby preview file:

```ts
import { application } from "@nmnmcc/preview/application"
import { href } from "react-router"

export default application({
  location: href("/projects/:projectId", { projectId: "42" })
})
```

Keep `reactRouter()` before Preview in `vite.config.*`. The real route runs its
normal loader and receives normal router state.

## Add a SvelteKit Application

Use SvelteKit's typed `resolve()` helper:

```ts
import { application } from "@nmnmcc/preview/application"
import { resolve } from "$app/paths"

export default application({
  location: resolve("/items/[id]", { id: "42" })
})
```

Use this target for a page that reads `$app/*`, runs a `load` function, or
needs server rendering. Keep `sveltekit()` before Preview.

## Add a vinext Application

Keep vinext as the only React and React Server Components setup. Do not add a
second React or RSC plugin:

```ts
import preview from "@nmnmcc/preview"
import { defineConfig } from "vite"
import vinext from "vinext"

export default defineConfig({
  plugins: [
    vinext(),
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

vinext does not provide one simple typed location builder. Pass the final
same-origin URL for both App Router and Pages Router routes:

```ts
import { application } from "@nmnmcc/preview/application"

export default application({
  location: "/projects/42"
})
```

## Mark the real route ready

Put capture-only lifecycle work in an exact lowercase
`preview: { ... }` block.

React, React Router, and vinext:

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

Svelte and SvelteKit:

```svelte
<script lang="ts">
  import { ready } from "@nmnmcc/preview/application"
  import { onMount } from "svelte"

  preview: {
    onMount(ready)
  }
</script>
```

Vue:

```vue
<script setup lang="ts">
import { ready } from "@nmnmcc/preview/application"
import { onMounted } from "vue"

preview: {
  onMounted(ready)
}
</script>
```

If a loader, client request, font, image, or state transition changes the
wanted pixels, call `ready()` after that exact work instead of directly after
mount. Do not use a timeout as the signal.

## Keep capture code out of production

`preview:` is a standard JavaScript label. Preview keeps its block during Vite
serve and removes the full block after framework transforms during every Vite
build. Removal also works when `build.minify` is `false`.

Use the exact lowercase label only for capture work. Do not put normal route
work in it. Run the production build after adding or changing a label.

Preview checks final client, SSR, and custom Vite build chunks for remaining
Preview labels, definitions, runtime code, and imports. It reports the build
environment, chunk, and match. Use this option only when remaining code is
known and intentional:

```ts
preview({
  build: { check: false },
  capture: {
    viewports: {
      desktop: { width: 1440, height: 900 }
    }
  }
})
```

This option disables the final check. It does not disable label removal.

## Follow Application runtime rules

- Keep the initial location, browser navigation, and redirects on the Vite
  origin.
- Give Preview the final location. Use the router's typed URL helper when it
  has one.
- Do not inject props or mount a second application.
- Browser HTTP and HTTPS requests to another origin are blocked.
- Server loaders, server hooks, server rendering, and other server code are
  outside browser request interception.
- Call `ready()` once the current document shows the final wanted state. The
  call is safe more than once.

Read [Artifacts and CLI](artifacts-and-cli.md) when navigation, readiness, or
capture fails.
