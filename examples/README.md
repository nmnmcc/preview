# Examples

All examples require Node 24 or later.

Each directory can run on its own. Most projects are small compatibility
examples. The React Router project is the main product demo.

| Directory      | Framework setup             | Extra example                           |
| -------------- | --------------------------- | --------------------------------------- |
| `react`        | React with Vite             | React Context and a locale/theme matrix |
| `react-router` | React Router framework mode | Preview Lab issue workspace             |
| `vue`          | Vue with Vite               | A provide/inject theme template         |
| `svelte`       | Svelte with Vite            | A mount context                         |
| `sveltekit`    | SvelteKit                   | A typed route with a server load        |
| `vinext-app`   | vinext App Router           | An application route                    |
| `vinext-pages` | vinext Pages Router         | An application route                    |

The Preview Lab demo uses Tailwind CSS and shadcn/ui with Base UI. It has a
responsive issue list, filters, groups, a detail panel, local issue creation,
status changes, and comments. Its data is fixed and local. It does not need a
model call, network service, or database.

The demo shows two useful agent loops:

- `IssueRow.preview.tsx` isolates one row. A matrix covers English and Chinese
  text plus default, selected, and blocked states.
- `Issues.preview.ts` opens `/issues/PRV-142` in the real React Router app. It
  captures the loader result, desktop detail panel, and mobile detail sheet.
  It also defines nine responsive layout checks for the workspace, selected
  issue, active detail panel, and agent proof.

The Component preview uses `390×320` and `960×320` viewports. The Application
preview uses `390×844` and `1536×960` viewports. Both wait for the Geist font
and the final layout before they emit the `default` state and call `done()`.
The Application preview writes a clean PNG plus a sibling inspection directory
with Markdown, domain JSON, an annotated overview, and finding evidence. The
Component matrix opts out of inspection to keep its 12-state review set small.

The other router projects also show both preview forms. Their Component
previews do not use router state. Their Application previews open real routes,
emit a named state, and call `done()` from those routes.

The shared Component examples accept optional `emit` and `done` props. They put
their lifecycle work in `preview: { ... }`, so application production builds
remove that work.

Keep each `*.preview.*` file next to the component or route that it covers.
This also applies to Application previews. The vinext Pages example uses
`pageExtensions` and a `.page.tsx` suffix so preview files can stay in `pages/`
without becoming routes.

The small compatibility projects use the complete Tailwind viewport preset
group. The React Router demo uses the focused viewports listed above. Every
project sets `artifacts.clean`, so a full generation removes old PNG files.

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

Run the full Preview Lab demo:

```sh
yarn workspace @preview/example-react-router dev
```

Generate its 14 clean PNG files and two inspection trees:

```sh
yarn workspace @preview/example-react-router generate
```

## Check every example

Use the root commands to check all example projects:

```sh
yarn typecheck
yarn test:e2e
```

`yarn examples:generate` builds the packages and generates every example. The
generated `.preview/` directories are not part of version control.
