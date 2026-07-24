# Contributing

## Development environment

This project uses Devenv as its supported development environment. The setup
is in `devenv.nix`, `devenv.yaml`, and `devenv.lock`.

Devenv provides Node.js 26, Yarn, Git, Python 3.14, uv, and a headless Chromium
build. The Chromium build must match the Playwright version in this workspace.
The Nix setup checks this match before it opens the shell. It also sets
Playwright to use the Nix browser and skip its own browser download.

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

Devenv creates a Python virtual environment in its state directory. It runs
`uv sync --locked` before the shell opens. `pyproject.toml` and `uv.lock` are
the source of truth for Python tools. Change both files together when a Python
tool version changes.

## Repository layout

- `packages/preview` holds the `@nmnmcc/preview` package.
- `packages/react` holds the React package.
- `packages/svelte` holds the Svelte package.
- `packages/vue` holds the Vue package.
- `examples` holds the end-to-end test projects.
- `test/e2e` holds the Vitest checks for generated example files.
- `skills/preview` holds the public Preview agent skill.
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
- The Application entry has `application`, `emit`, `done`, and their types.
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

## Agent skill

Keep the public skill in `skills/preview`. Keep its `SKILL.md` short. Put full
user workflows in its direct `references` directory. Do not add nested
reference directories.

Update the skill when a public package behavior, requirement, command, or
example changes. Keep package README files short. Each README has the smallest
working setup for that package and points to the skill for the full guide.

Keep the skill metadata in `agents/openai.yaml`. Its default prompt must name
`$preview`. Run `yarn check:skill` after every skill change.

## Naming

- Use PascalCase for module constants that define fixed rules or default
  values, such as patterns, protocol keys, and default settings.
- Do not force PascalCase for other values. Follow normal TypeScript and
  framework conventions. Use PascalCase for types, classes, components, and
  schemas that act as type constructors. Use camelCase for functions, methods,
  effects, flags, test fixtures, and ordinary runtime values.

## Product language

Present Preview as a way to define, run, and inspect repeatable UI previews.
PNG artifacts are one current output, not the product boundary. State what
Preview does. Do not define it with a list of unrelated features that it does
not have.

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

## Add a changeset

Add a changeset when a change affects a public package in a way that users can
see:

```sh
yarn changeset
```

Select each public package that the change affects. Use these release types:

- `patch` for a compatible fix.
- `minor` for a compatible feature.
- `major` for a breaking public API change.

Write a short release note in Basic English. State what changed for the user.
Do not list internal work unless users need to know about it.

A root documentation-only change, test-only change, or CI change does not need
a changeset when package files stay the same. If package files change but no
package needs a release, add an empty changeset:

```sh
yarn changeset --empty
```

Check the release plan before you commit:

```sh
yarn changeset status
```

Commit the new file in `.changeset` with the code change. Do not edit package
versions or package changelogs by hand.

## Release packages

The `Release` GitHub Actions workflow runs on `main`.

When `main` has changesets, the workflow opens or updates the
`chore: release packages` pull request. This pull request consumes the
changesets and updates package versions, package changelogs, internal package
ranges, and the Yarn lock file.

Review those files and merge the release pull request. The next workflow run
checks the exact release commit, builds all packages, publishes each new
version to npm, and creates its Git tag and GitHub Release. npm uses GitHub
OIDC. The workflow does not read or set an `NPM_TOKEN` secret.

## Set up npm once

Each package must exist on npm before npm can accept a Trusted Publisher. For a
new registry name, publish a local placeholder at version `0.0.0`. Do not use a
version that this repository may need to publish.

Create all four package names:

- `@nmnmcc/preview`
- `@nmnmcc/preview-react`
- `@nmnmcc/preview-svelte`
- `@nmnmcc/preview-vue`

Then add the same Trusted Publisher to each package on npm:

- Provider: GitHub Actions
- Organization or user: `nmnmcc`
- Repository: `preview`
- Workflow filename: `release.yml`
- Environment: leave this empty
- Allowed action: `npm publish`

The workflow has `id-token: write` only for this OIDC exchange. It runs on a
GitHub-hosted runner and uses npm from the pinned Devenv environment.

In the GitHub repository settings, allow GitHub Actions to read and write the
repository and to create pull requests. Keep branch protection on `main`; the
workflow publishes only after the release pull request reaches `main`.

## CI environment and caches

Both workflows install Devenv 2.1.2 from its exact source commit. The project
environment then comes from `devenv.lock`, `yarn.lock`, and `uv.lock`. All
project commands run through `devenv shell`.

The check workflow caches only Yarn and uv downloads. Its cache key includes
all three lock files, the runner system, and the runner architecture. It does
not cache `node_modules`, build output, or generated preview files. The release
workflow starts with empty package-manager caches. Both workflows use the
read-only Devenv binary cache for Nix store downloads.

## Checks

Run the full check from the workspace root:

```sh
yarn check
```

This command checks formatting, GitHub Actions, Changesets, the public Agent
Skill, unit behavior, workspace types, example builds, and end-to-end output.
Use a smaller command while you work:

```sh
yarn check:skill
yarn test
yarn typecheck
yarn test:e2e
```

`yarn check:skill` validates the public Agent Skill with the Python tool locked
in `uv.lock`. `yarn test` runs the unit tests. `yarn typecheck` builds the
packages and checks all workspace types. `yarn test:e2e` builds the packages,
makes all example PNG files, and checks them with Vitest.

## Documentation language

- Keep README files for users. Put development setup, internal design, and
  contributor commands in this file.
- Write all project-owned documentation in
  [Basic English](https://en.wikipedia.org/wiki/Basic_English) as far as this
  is practical.
- Use short, direct sentences. Put one main idea in each sentence.
- Use common words and the active voice.
- Keep names, code, API terms, and other needed technical terms. Explain a term
  when a new reader may not know it.
- Keep the meaning exact. A clear technical statement is more important than a
  strict word list.
- Do not rewrite generated files, third-party files, or Git submodule
  documentation.
- When you change an old document, make the changed part follow these rules.
  New documents must follow them from the start.
