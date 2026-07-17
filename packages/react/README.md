# @nmnmcc/preview-react

Define React Component previews for `@nmnmcc/preview`.

Requires React 18.3 or 19 and Node 24 or later.

## Full guide

Install the public [`preview` skill](https://github.com/nmnmcc/preview/tree/main/skills/preview):

```sh
npx skills add nmnmcc/preview --skill preview
```

Use `$preview` for shared providers, matrices, Application routes, capture
settings, and artifact generation.

## Minimal setup

Add Preview to an existing React Vite project:

```sh
yarn add -D @nmnmcc/preview @nmnmcc/preview-react playwright@^1.61.0
yarn playwright install chromium
```

Put Preview after `react()` in `vite.config.ts`:

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

Add `Card.preview.tsx`:

```tsx
import type { PreviewReady } from "@nmnmcc/preview";
import { preview } from "@nmnmcc/preview-react";
import { useEffect } from "react";
import { Card } from "./Card";

const Subject = ({ ready }: { readonly ready: PreviewReady }) => {
  preview: {
    useEffect(() => {
      ready();
    }, [ready]);
  }

  return <Card />;
};

export default preview({
  render: ({ ready }) => <Subject ready={ready} />,
});
```

Keep capture-only lifecycle work in an exact lowercase `preview: { ... }`
block.

Run `yarn preview generate Card.preview.tsx`. Preview unmounts the React root
after capture.

Licensed under Apache-2.0.
