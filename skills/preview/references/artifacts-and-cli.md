# Artifacts and CLI

Use the local Preview binary for focused generation, visual checks, and CI.
Treat PNG paths as generated output. A command exit and an inspected image are
different checks; use both.

## Contents

- Generate images
- Inspect the visual result
- Understand output paths
- Clean stale PNG files
- Keep versioned artifacts
- Find common faults
- Follow browser and write safety rules

## Generate images

The Vite development server generates previews at start. When Vite can trace a
changed module to preview importers, Preview rebuilds only those preview files.
When it cannot map the change, Preview runs a full generation.

Prefer the project's generation script when it has one. Otherwise run the
local binary through the package manager:

```sh
yarn preview generate path/to/Card.preview.tsx
pnpm exec preview generate path/to/Card.preview.tsx
npx preview generate path/to/Card.preview.tsx
```

The bare command and these forms are also valid:

```sh
preview
preview generate
preview generate src/Card.preview.tsx
preview generate 'src/**/*.preview.tsx'
preview generate --output artifacts/previews
preview generate --root ./examples/react
```

`preview` is the short form of `preview generate`. The command reads the Vite
setup at the project root. A selector may be a preview file or a glob.
`--root` selects another Vite root. `--output` changes the output path for one
run.

Start with the changed file. Use a full run after the focused image is right
or when discovery, cleaning, or CI coverage is the subject of the task.

If one target fails, Preview tries the other targets and exits with a non-zero
status at the end. The CLI and Vite plugin use the same log form:
`12:34:56 PM [preview] Card -> path`. Each logged path is relative to its
preview source.

## Inspect the visual result

Do not stop when the command succeeds. Open each PNG needed to prove the task.
Use the agent's image-viewing tool when one is available.

Check these facts against the request:

- the expected component or route is present
- the intended data, theme, language, and state are present
- the viewport or full-page size is correct
- no content is clipped, hidden, duplicated, or still loading
- CSS, fonts, icons, and images are present
- each required matrix variant differs in the intended way

If the PNG is wrong, correct the application, preview setup, or ready point and
generate again. Do not hide a product defect by changing only the preview
unless the preview itself is wrong.

Run the project type check after the image is right. Run its production build
when normal application source contains a `preview:` block.

## Understand output paths

The default output name is `.preview`. A single React preview has this form:

```text
src/
├── Card.preview.tsx
└── .preview/
    └── Card.preview.tsx/
        ├── mobile.png
        └── desktop.png
```

Set `artifacts.output` to a child path relative to each preview source:

```ts
preview({
  capture: {
    viewports: {
      desktop: { width: 1440, height: 900 }
    }
  },
  artifacts: {
    output: "artifacts/previews"
  }
})
```

`src/Card.preview.tsx` then writes to
`src/artifacts/previews/Card.preview.tsx/desktop.png`.

The output cannot be absolute. It cannot contain `.` or `..` path parts or
glob syntax. Preview keeps each source in its own directory under the output
path.

Named collections and matrices put the variant before the viewport:

```text
.preview/Card.preview.tsx/theme=light,state=ready.desktop.png
```

## Clean stale PNG files

Enable cleaning in Vite config:

```ts
artifacts: {
  clean: true
}
```

Cleaning follows these rules:

- A path-limited run cleans only selected sources.
- A full run also cleans output for deleted sources.
- Preview does not clean a source when discovery or metadata is incomplete.
- A known target that fails capture keeps its last good artifact.
- Clean removes PNG files only. It keeps other file types.
- With an output override, a full clean run checks both the configured output
  and the override.

Use a full run when the task must prove that deleted sources or variants no
longer leave PNG files.

## Keep versioned artifacts

Versioning is off by default. Set the number of real files to keep:

```ts
preview({
  capture: {
    viewports: {
      desktop: { width: 1440, height: 900 }
    }
  },
  artifacts: {
    version: { retain: 3 }
  }
})
```

Preview compares new PNG bytes with the current real file. Equal bytes reuse
the current version. Changed bytes create a sortable UTC file and update a
relative symbolic link:

```text
.preview/Card.preview.tsx/
├── desktop@20260717T103045123Z.png
└── desktop.png -> desktop@20260717T103045123Z.png
```

The file system must support symbolic links. Preview does not fall back to a
hard link or copy.

The timestamp has millisecond precision. If the clock repeats or moves back,
Preview chooses one millisecond after the newest known version. Returning to
older image bytes still creates a new version because Preview compares only
with the current one.

`retain` includes the current real file and excludes the symbolic link.
Retention runs when Preview writes or reuses a version. It does not depend on
`artifacts.clean`.

## Find common faults

Use the failure to choose the next check:

| Symptom | Check and correction |
| --- | --- |
| No preview is found | Check the Vite root, default `*.preview.{js,jsx,ts,tsx}` suffix, `files.include`, `files.exclude`, and the command selector. Confirm the file has a supported default export. |
| The local command is missing | Install the core package in this project and run its package script or package-manager binary form. Do not rely on a global binary. |
| Chromium is missing or does not match | Install Chromium with the project's Playwright 1.61 command. In Nix or Devenv, use the supplied matching browser and environment instead. |
| Capture waits until `timeoutMs` | Find the target that never calls `ready()` inside an exact lowercase `preview: { ... }` block. For a Component, follow the adapter callback. For an Application, call Application `ready()` in the real route. Wait only for work needed by the final pixels. |
| The PNG is blank, partial, or still loading | The ready point is early, or CSS, a provider, data, a font, or an image is missing. Open the PNG, follow the subject's visible dependencies, and move readiness to the true final state. |
| A Component fails on route modules | Change it to an Application. Do not mock the router, `$app/*`, loaders, server state, or RSC state only to keep a Component target. |
| An Application navigation or request is blocked | Keep the location, redirects, and browser requests on the Vite origin. Remember that server-side work is outside browser request interception. |
| A production build reports Preview code | Put each lifecycle call in an exact lowercase `preview: { ... }` block. Keep its direct imports easy for the build to remove after the block is gone. Run the real client and server builds. Disable `build.check` only for known intentional code. |
| Old PNG files remain | Enable `artifacts.clean` and run a full generation. A focused run cleans only its selected sources. A failed or incomplete source keeps its last good file. |
| One matrix variant fails | Read the named variant in the error, fix that state, and rerun. Other targets may have completed, but the final command status remains non-zero. |

Do not fix a readiness failure by adding a blind sleep. A longer timeout is
correct only when required work is known to take longer.

## Follow browser and write safety rules

- Preview blocks cross-origin HTTP and HTTPS requests made by the captured
  browser page.
- It blocks Service Workers so they cannot bypass browser request
  interception.
- Server rendering, loaders, hooks, and other server code are outside browser
  request interception.
- Application navigation and redirects stay on the Vite origin.
- Numeric viewport heights capture the visible viewport. `"full"` and
  `"full-N"` capture the full scrollable page.
- Preview writes a temporary file and then replaces the target in one step.
- A CLI output override remains relative to each source and follows the same
  path checks as configured output.

Preview currently supports Component and Application previews, named
viewports, matrices, automatic development rebuilds, versioned artifacts, and
CI generation. It does not install browsers automatically, compare images, or
provide an interactive panel.
