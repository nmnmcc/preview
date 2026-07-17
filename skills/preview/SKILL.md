---
name: preview
description: Define, run, inspect, and repair repeatable UI previews with @nmnmcc/preview and the target project's real Vite setup. Use when an agent works on plain Vite, React, Vue, Svelte, React Router, SvelteKit, or vinext and needs to understand or verify a component or real route, add *.preview.* coverage, capture responsive or state variants, generate or inspect visual artifacts locally or in CI, or fix discovery, readiness, browser, build-removal, and artifact problems. Use for UI work that can run on Node 24 or later, Vite 8, and Playwright 1.61.
---

# Preview

Use Preview to make important UI states explicit and repeatable. Keep each
definition close to its source, run it with the project's real Vite and
framework setup, and inspect the result during development, review, or CI.

Preview gives the work these useful properties:

- It runs the project's Vite and framework setup instead of a copied demo.
- It supports both an isolated Component and a real Application route.
- It waits for an explicit `ready()` signal instead of guessing with a delay.
- It gives viewports and state variants stable, readable artifact names.
- It uses the same generator in Vite development, local commands, and CI.

## Work in this order

1. Inspect the target project's package manager, versions, Vite config,
   framework, route system, existing Preview setup, and target UI.
2. Read [Setup and target choice](references/setup-and-targets.md). Choose a
   Component only when it can run without route-only state. Otherwise choose
   an Application.
3. Read the guide for the chosen target. Install the core package, any needed
   Component adapter, Playwright, and Chromium. Skip Chromium only after checking
   that the environment supplies and configures the matching browser. Add the
   plugin, the smallest working definition, one named viewport, and a
   `ready()` signal inside an exact lowercase `preview: { ... }` block. Make
   the signal mean that the final pixels are present.
4. Run the local Preview command for the new or changed file. Open every PNG
   that the task depends on. Check the subject, state, viewport, clipping,
   fonts, and other visible details. A successful command alone is not visual
   proof.
5. Fix the UI or preview and generate again until the image is right. Then run
   the project's type check. Run its production build when normal application
   source contains a `preview:` block.

Report a version mismatch instead of silently changing the project's Node,
Vite, framework, or Playwright version. Upgrade only when the task permits it.

## Put each part in the right place

| Part                   | Place                                                                                             | Purpose                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Preview Vite plugin    | `vite.config.*`, after the framework plugin                                                       | Discover files, run capture, and remove capture-only blocks from builds |
| Component definition   | `*.preview.{js,jsx,ts,tsx}` beside the component                                                  | Mount one isolated subject with the matching adapter                    |
| Component readiness    | A preview-only wrapper, or an optional callback in the subject when it knows the true final state | Mark the mounted component ready inside `preview: { ... }`              |
| Application definition | `*.preview.{js,jsx,ts,tsx}` beside the route                                                      | Open one final same-origin route location                               |
| Application readiness  | The real route component                                                                          | Mark the routed application ready inside `preview: { ... }`             |
| Shared setup           | A small local preview template module                                                             | Add common CSS, providers, theme, or locale once                        |
| Captured artifact      | A sibling `.preview/` tree by default                                                             | Keep generated output close to its source                               |

## Read only the needed guides

- Read [Component previews](references/component-previews.md) for plain DOM,
  React, Vue, Svelte, preview-only wrappers, shared templates, and cleanup.
- Read [Application previews](references/application-previews.md) for React
  Router, SvelteKit, vinext, route locations, and route readiness.
- Read [Capture and variants](references/capture-and-variants.md) for discovery,
  Playwright settings, viewport presets, full pages, and matrices.
- Read [Artifacts and CLI](references/artifacts-and-cli.md) for commands, output
  paths, cleaning, versioning, CI, visual proof, and fault finding.

Read more than one guide when the result crosses those areas.

## Keep these rules

- Preserve the target application's setup. Do not replace its router,
  providers, loaders, server rendering, or framework plugin.
- Keep the first config to the required named viewports. Add file filters,
  Playwright overrides, cleaning, versioning, or matrices only for a stated
  need.
- Put Preview after the framework plugin. With vinext, do not add another React
  or React Server Components plugin.
- Keep Component and Application targets distinct. Do not mock route-only
  modules to force them into a Component.
- Make `ready()` mean that the final image may be captured. Do not use a fixed
  sleep as a readiness signal.
- Put all capture-only lifecycle work for Component and Application targets
  in an exact lowercase `preview: { ... }` block. This includes code in a
  preview-only wrapper. Put no product work in that block.
- Keep Application locations and browser navigation on the Vite origin.
- Never import `@nmnmcc/preview/internal/runner`. It is private to the plugin.
- Make browser setup explicit. Install Playwright's matching Chromium in a
  normal environment. Do not install it in a Nix or Devenv shell that already
  supplies and configures the matching browser.
