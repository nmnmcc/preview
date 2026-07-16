# Source References

This directory holds local source code from third-party projects. Use it to
check APIs, types, and common code for the exact package versions in this
workspace. This is safer than memory or online documents for another version.

## Current sources

- `vite/`: `vitejs/vite` at `v8.1.4`. It matches `vite@8.1.4` in this
  workspace. Most plugin APIs and code are in `packages/vite/`.
- `effect-smol/`: `Effect-TS/effect-smol` at `effect@4.0.0-beta.98`. It matches
  `effect`, `@effect/platform-browser`, `@effect/platform-node-shared`, and
  `@effect/vitest` in this workspace.

## Update rules

- When an upstream project has a tag for a package version, use the tag that
  matches this workspace.
- Set `shallow = true` for every source in `.gitmodules`.
- When you add a source, record its package and version here.
- After you clone this project, run `git submodule update --init --recursive`.
  Change a fixed source commit only when you update its package.
