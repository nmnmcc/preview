# Preview

[![skills.sh](https://skills.sh/b/nmnmcc/preview)](https://skills.sh/nmnmcc/preview)

Preview makes important UI states easy to define, run, and inspect. Define a
preview beside its source, run it with the project's real framework and
application setup, and use the result in local work or CI.

The current Vite integration supports isolated components, real application
routes, responsive viewports, state matrices, stable visual artifacts, and
filesystem layout inspections with image evidence.

Preview requires Node 24 or later, Vite 8, and Playwright 1.61.

## Install the agent skill

The [`preview` skill](skills/preview/SKILL.md) has the full setup and operation
guide for React, Vue, Svelte, React Router, SvelteKit, and vinext.

```sh
npx skills add nmnmcc/preview --skill preview
```

Ask your agent to use `$preview` when it defines or checks UI states, routes,
viewports, matrices, or generated artifacts in a Vite project.

## Create the first React preview

Add Preview to an existing React Vite project:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-react playwright@^1.61.0
yarn playwright install chromium
```

Put Preview after React in `vite.config.ts`:

```ts
import preview from "@nmnmcc/preview";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    preview({
      capture: {
        viewports: {
          desktop: { width: 1440, height: 900 },
        },
      },
    }),
  ],
});
```

Add `src/Card.preview.tsx`:

```tsx
import type { PreviewDone, PreviewEmit } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-react";
import { useEffect } from "react";

const Card = ({
  done,
  emit,
}: {
  readonly done: PreviewDone;
  readonly emit: PreviewEmit;
}) => {
  preview: {
    useEffect(() => {
      void emit("default").then(done);
    }, [done, emit]);
  }

  return <article>Hello Preview</article>;
};

export default preview({
  render: ({ done, emit }) => <Card done={done} emit={emit} />,
});
```

Keep capture-only lifecycle work in an exact lowercase `preview: { ... }`
block. Preview removes the block from production builds.

Run the preview:

```sh
yarn preview generate src/Card.preview.tsx
```

The current capture workflow writes
`src/.preview/Card.preview.tsx/default/viewport=desktop.png` by default.

## Packages and examples

- [`@nmnmcc/preview`](packages/preview) provides the Vite plugin and core APIs.
- [`@nmnmcc/preview-react`](packages/react) mounts React components.
- [`@nmnmcc/preview-vue`](packages/vue) mounts Vue components.
- [`@nmnmcc/preview-svelte`](packages/svelte) mounts Svelte components.
- [`examples`](examples/README.md) has working React, React Router, Vue, Svelte,
  SvelteKit, and vinext projects.

Licensed under Apache-2.0.
