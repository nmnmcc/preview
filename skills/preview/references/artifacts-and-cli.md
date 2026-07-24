# Artifacts and CLI

Use the local Preview binary for focused generation, visual checks, and CI.
Treat clean PNGs and optional inspection trees as generated output. A command
exit and an inspected image are different checks; use both.

## Contents

- Generate images
- Inspect the visual result
- Understand output paths
- Clean stale artifact files
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

For a larger agent task, keep the proof loop small and exact:

1. Define a Component preview for the local state that changed.
2. Add matrix axes only for states that can change the visible result.
3. Define an Application preview when a real route, loader, or layout matters.
4. Generate the focused source and inspect every new PNG.
5. Run a full generation to prove discovery and stale-file cleaning.

Keep preview data fixed when the task is about UI. A local fixture makes the
same input produce the same artifact. It also lets an agent compare states
without a model call, network service, or database.

If one target fails, Preview tries the other targets and exits with a non-zero
status at the end. The CLI and Vite plugin use the same log form:
`12:34:56 PM [preview] Card -> path`. Each logged path is relative to its
preview source.

## Inspect the visual result

Do not stop when the command succeeds. Open each PNG needed to prove the task.
When layout inspection is enabled, read its `README.md` and open its annotated
overview and relevant evidence PNGs. Use the agent's image-viewing tool when
one is available.

Check these facts against the request:

- the expected component or route is present
- the intended data, theme, language, and state are present
- the viewport or full-page size is correct
- no content is clipped, hidden, duplicated, or still loading
- CSS, fonts, icons, and images are present
- each required matrix variant differs in the intended way

If the PNG is wrong, correct the application, preview setup, or emit point and
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
        └── default/
            ├── viewport=mobile.png
            └── viewport=desktop.png
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
`src/artifacts/previews/Card.preview.tsx/default/viewport=desktop.png`.

The output cannot be absolute. It cannot contain `.` or `..` path parts or
glob syntax. Preview keeps each source in its own directory under the output
path.

Each emitted state has its own directory. Named collections and matrices use
`viewport=<name>` after the variant:

```text
.preview/Card.preview.tsx/default/theme=light,state=ready,viewport=desktop.png
```

A viewport name follows the same token rule as a matrix value. It starts with
an ASCII letter or digit. The other characters can be ASCII letters, digits,
`_`, or `-`. A dot is not valid in a viewport name.

## Clean stale artifact files

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
- Each Preview source output directory is owned by Preview. Clean removes every
  entry that is not part of a current target. This includes old artifact names,
  HTML, JSON, PNG files, and subdirectories.
- With an output override, a full clean run checks both the configured output
  and the override.

Use a full run when the task must prove that deleted sources or variants no
longer leave generated files.

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

Preview compares new artifact bytes with the current real files. Equal bytes
reuse the current version. Changed bytes create sortable UTC files and update
relative symbolic links:

```text
.preview/Card.preview.tsx/
└── default/
    ├── viewport=desktop@20260717T103045123Z.png
    └── viewport=desktop.png -> viewport=desktop@20260717T103045123Z.png
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

When inspection is enabled, the clean PNG and the complete sibling `.inspect/`
directory form one bundle. Their real paths use the same timestamp. Reuse and
retention act on the whole pair, so one target cannot mix inspection files from
different captures. Read [Layout inspection](inspection.md) for the tree and
workflow.

## Find common faults

Use the failure to choose the next check:

| Symptom | Check and correction |
| --- | --- |
| No preview is found | Check the Vite root, default `*.preview.{js,jsx,ts,tsx}` suffix, `files.include`, `files.exclude`, and the command selector. Confirm the file has a supported default export. |
| The local command is missing | Install the core package in this project and run its package script or package-manager binary form. Do not rely on a global binary. |
| Chromium is missing or does not match | Install Chromium with the project's Playwright 1.61 command. In Nix or Devenv, use the supplied matching browser and environment instead. |
| Capture waits until `timeoutMs` | Find the target that never calls `emit()` or `done()` inside an exact lowercase `preview: { ... }` block. For a Component, follow the adapter callbacks. For an Application, use the Application functions in the real route. Wait only for work needed by the named pixels. |
| An emit fails | Await every `emit(name)` call. Use each valid lowercase name once. Do not emit at the same time, emit after `done()`, or call `done()` before the first emit or during an emit. |
| The PNG is blank, partial, or still loading | The emit point is early, or CSS, a provider, data, a font, or an image is missing. Open the PNG, follow the subject's visible dependencies, and move the emit to the true wanted state. |
| A Component fails on route modules | Change it to an Application. Do not mock the router, `$app/*`, loaders, server state, or RSC state only to keep a Component target. |
| An Application navigation or request is blocked | Keep the location, redirects, and browser requests on the Vite origin. Remember that server-side work is outside browser request interception. |
| A production build reports Preview code | Put each lifecycle call in an exact lowercase `preview: { ... }` block. Keep its direct imports easy for the build to remove after the block is gone. Run the real client and server builds. Disable `build.check` only for known intentional code. |
| Old PNG files remain | Enable `artifacts.clean` and run a full generation. A focused run cleans only its selected sources. A failed or incomplete source keeps its last good file. |
| One matrix variant fails | Read the named variant in the error, fix that state, and rerun. Other targets may have completed, but the final command status remains non-zero. |

Do not fix a lifecycle failure by adding a blind sleep. A longer timeout is
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
