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
- `packages/react` holds the React package.
- `packages/svelte` holds the Svelte package.
- `packages/vue` holds the Vue package.
- `examples` holds the end-to-end test projects.
- `test/e2e` holds the Vitest checks for generated example files.
- `references` holds the fixed Vite and Effect source trees.

Public source files in `packages/preview/src` document and re-export the API.
Keep their implementation in `packages/preview/src/internal`. Keep CLI
implementation in `packages/preview/src/internal/cli`. The CLI `main.ts` file
is an entry point that runs the command. It is not a library index.

Keep modules that run only in a browser in
`packages/preview/src/internal/browser`. Keep wire schemas that are shared by
the browser and Node in `packages/preview/src/internal`. Put each Effect
service in the nearest `services` directory. This rule also applies below the
`browser` and `cli` directories. Keep Node Playwright services in
`packages/preview/src/internal/services`.

Keep browser and CLI entry points small. Each `main.ts` runs a composed
`program` with its platform runtime. It must not act as a library index.

## Public API design

The public source files, TypeScript declarations, and package manifest are the
source of truth for the public API. Keep the root entry small. It gives common
functions such as `preview`, `template`, and `matrix` direct exports. It groups
the other APIs by purpose. Keep the default export for the Vite plugin.

Keep each subpath focused:

- The browser entry has only browser-safe preview and matrix APIs.
- The Application entry has `application`, `ready`, and their types.
- The viewport entry has the fixed, readonly preset groups.
- The internal runner entry is private to the Vite plugin.

Keep Component and Application targets distinct. A Component target has a
mount function. An Application target has a location. Public constructors are
the supported way to make either definition. A template must keep the target
type returned by its base function.

Keep matrix rules in its public types and runtime checks. Each axis is
non-empty. Axis values use strings, booleans, or non-negative safe integers so
artifact names stay stable. An `exclude` value comes from its axis. A named
`include` may add a new typed input.

Keep viewport group names and preset names exact. Both groups and presets are
readonly. Change an existing preset only in a breaking release.

Keep the package's Effect dependency and peer dependency on the same exact
version. Keep the CLI binary entry at `./dist/main.mjs`.

## Naming

- Use PascalCase for module constants that define fixed rules or default
  values, such as patterns, protocol keys, and default settings.
- Do not force PascalCase for other values. Follow normal TypeScript and
  framework conventions. Use PascalCase for types, classes, components, and
  schemas that act as type constructors. Use camelCase for functions, methods,
  effects, flags, test fixtures, and ordinary runtime values.

## Effect

This workspace pins Effect `4.0.0-beta.98`. Use the API from that version.
Check the fixed source in `references/effect-smol` before you add or change
Effect code.

Look for an Effect feature before you make a local replacement. Use Effect for
typed errors, Schema checks, services, layers, resource scopes, concurrency,
file and path access, runtimes, and test control when those tools fit the work.
Use Schema when an unknown object shape needs a runtime check. Do not write
local object type guards.

The main Effect boundaries are:

- The Preview Node code uses Effect services and layers for file search,
  browser life, rendering, errors, and safe file writes.
- The CLI uses `effect/unstable/cli` and the Effect Node platform. Its
  `main.ts` runs the program with `NodeRuntime`.
- The capture runner uses
  `@effect/platform-browser/BrowserRuntime`, Effect Schema, and Effect
  interruption in the browser.
- The Application entry uses Effect Schema for browser state checks. It stays
  safe in browser and server code and does not import Vite, Playwright, or the
  Effect Node platform.
- Effect tests use `@effect/vitest`. Use `Deferred` or another Effect control
  instead of a time-based wait for concurrent tests.

Keep the Node and browser platforms separate. The browser and Application
entries use browser-safe Effect modules. The separate capture runner uses the
Effect Browser Platform. None of these browser-facing entries may import Vite,
Playwright, or Node platform code. The capture runner is a real TypeScript
module. Do not make its source with string interpolation. The
`@nmnmcc/preview/internal/runner` export is private to the Vite plugin.

## Tests

Tests must run code and check observable behavior. A unit test may check a
returned value, error, state change, or effect. An integration test may check a
real build, browser session, file operation, or generated artifact.

Do not add static tests that only:

- make TypeScript accept or reject sample code;
- use `@ts-expect-error` or an unused `compile*` function as a test;
- list module exports or public type names;
- compare package metadata that the manifest already states; or
- read repository source text or paths to enforce a naming, layout, or design
  rule.

Put maintenance and design rules in this file. Put type rules in the public
declarations that implement them. Let `yarn typecheck` check those declarations.
Do not copy either kind of rule into test code.

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
all workspace types. `yarn test:e2e` builds the packages, makes all example PNG
files, and checks them with Vitest.

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
