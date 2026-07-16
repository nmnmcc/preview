# Examples

All examples require Node 24 or later.

Each directory is a small application that can run on its own. The React,
React Router, Vue, Svelte, and SvelteKit projects have the same basic component
card. Each one also has a framework-specific example.

| Directory | Framework setup | Extra example |
| --- | --- | --- |
| `react` | React with Vite | React Context and a locale/theme matrix |
| `react-router` | React Router framework mode | A typed route with a loader |
| `vue` | Vue with Vite | A provide/inject theme template |
| `svelte` | Svelte with Vite | A mount context |
| `sveltekit` | SvelteKit | A typed route with a server load |
| `vinext-app` | vinext App Router | An application route |
| `vinext-pages` | vinext Pages Router | An application route |

The router projects show both forms. Their component previews do not use router
state. Their Application previews open real routes and call `ready()` from
those routes.

Keep each `*.preview.*` file next to the component or route that it covers.
This also applies to Application previews. The vinext Pages example uses
`pageExtensions` and a `.page.tsx` suffix so preview files can stay in `pages/`
without becoming routes.

Every project uses the complete Tailwind viewport preset group. Each preview
gets an image for `base`, `sm`, `md`, `lg`, `xl`, and `2xl`.
Each project sets `artifacts.clean` so a full generation removes old Preview
images from output directories with valid markers.

The React Vite setup also shows the optional `files.include` and
`files.exclude` file path patterns. Exclude takes priority when both patterns
match a file.

## Run one example

Install the workspace packages from the repository root. Then start an example:

```sh
yarn workspace @preview/example-vue dev
```

Generate its PNG files without starting a long-running server:

```sh
yarn build
yarn workspace @preview/example-vue generate
```

## Check every example

Use the root commands to check all example projects:

```sh
yarn typecheck
yarn test:e2e
```

`yarn examples:generate` builds the packages and generates every example. The
generated `.preview/` directories are not part of version control.
