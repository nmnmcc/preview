# Contributing

## Development environment

This project uses Devenv as its supported development environment. The setup
is in `devenv.nix`, `devenv.yaml`, and `devenv.lock`.

Devenv provides Node.js 26, Yarn, Git, and a headless Chromium build. The
Chromium build must match the Playwright version in this workspace. The Nix
setup checks this match before it opens the shell. It also sets Playwright to
use the Nix browser and skip its own browser download.

Set up a clone and open the shell:

```sh
git submodule update --init --recursive
devenv shell
yarn install
```

You can use Direnv instead. The checked-in `.envrc` loads the same Devenv
shell:

```sh
direnv allow
yarn install
```

Do not run `yarn playwright install chromium` inside the Devenv shell. Devenv
already provides the browser.

## Repository layout

- `packages/preview` holds the `@nmnmcc/preview` package.
- `packages/cli` holds the `@nmnmcc/preview-cli` command.
- `packages/react` holds the React package.
- `packages/vue` holds the Vue package.
- `examples/react` is the end-to-end test project.
- `references` holds the fixed Vite and Effect source trees.
- `tools/verify-example.mjs` checks the generated PNG files.

Public source files in `packages/preview/src` document and re-export the API.
Keep their implementation in `packages/preview/src/internal`. Keep CLI
implementation in `packages/cli/src/internal`. The CLI `main.ts` file is an
entry point that runs the command. It is not a library index.

## Effect

This workspace pins Effect `4.0.0-beta.98`. Use the API from that version.
Check the fixed source in `references/effect-smol` before you add or change
Effect code.

Look for an Effect feature before you make a local replacement. Use Effect for
typed errors, Schema checks, services, layers, resource scopes, concurrency,
file and path access, runtimes, and test control when those tools fit the work.

The main Effect boundaries are:

- The Preview Node code uses Effect services and layers for file search,
  browser life, rendering, errors, and safe file writes.
- The CLI uses `effect/unstable/cli` and the Effect Node platform. Its
  `main.ts` runs the program with `NodeRuntime`.
- The capture runner uses
  `@effect/platform-browser/BrowserRuntime`, Effect Schema, and Effect
  interruption in the browser.
- Effect tests use `@effect/vitest`. Use `Deferred` or another Effect control
  instead of a time-based wait for concurrent tests.

Keep the Node and browser platforms separate. The browser entry may use
Effect. The separate capture runner may use Effect Browser Platform. Neither
entry may import Vite, Playwright, or Node platform code. The capture runner is
a real TypeScript module. Do not make its source with string interpolation.
The `@nmnmcc/preview/internal/runner` export is private to the Vite plugin.

## Source references

- Before you change code that uses Vite or Effect, check the matching source
  under [`references/`](references/).
- Use the source to check APIs, types, and common code for the versions in this
  workspace. Do not rely only on memory or documents for another version.
- Read [`references/README.md`](references/README.md) for the current versions
  and the main source paths.
- Treat the reference sources as read-only. Change a fixed source commit only
  when you also update its matching package.

## Checks

Run the checks from the workspace root:

```sh
yarn test
yarn typecheck
yarn test:e2e
```

`yarn test` runs the unit tests. `yarn typecheck` builds the packages and checks
all workspace types. `yarn test:e2e` builds the packages, makes the React
example PNG files, and checks them.

## Documentation language

- Keep README files for users. Put development setup, internal design, and
  contributor commands in this file.
- Write all project-owned documentation in [Basic English](https://en.wikipedia.org/wiki/Basic_English) as far as this is practical.
- Use short, direct sentences. Put one main idea in each sentence.
- Use common words and the active voice.
- Keep names, code, API terms, and other needed technical terms. Explain a term when a new reader may not know it.
- Keep the meaning exact. A clear technical statement is more important than a strict word list.
- Do not rewrite generated files, third-party files, or Git submodule documentation.
- When you change an old document, make the changed part follow these rules. New documents must follow them from the start.
