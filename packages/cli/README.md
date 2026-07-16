# @nmnmcc/preview-cli

Generate `@nmnmcc/preview` PNG files from the command line.

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-cli playwright
yarn playwright install chromium

preview
preview generate
preview generate src/Card.preview.tsx
preview generate --root ./examples/react
preview --help
```

`preview` is a short form of `preview generate`.

The CLI loads the project's Vite config and calls the generation API exposed
by its `@nmnmcc/preview` plugin. It generates every variant in each matching
preview collection. It needs no extra matrix option.

Requires Vite 8 and Node `^20.19.0 || >=22.12.0`.
Licensed under Apache-2.0.
