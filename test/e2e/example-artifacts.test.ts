import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { describe, test } from "vitest";

type ExamplePngStem = `examples/${string}/.preview/${string}/${string}`;
type ExamplePngPath = `${ExamplePngStem}${string}.png`;

interface ExpectedPng {
  readonly file: ExamplePngPath;
  readonly height: number;
  readonly width: number;
}

interface ExpectedViewport {
  readonly height: number;
  readonly name: string;
  readonly width: number;
}

const PngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const tailwindViewports = [
  { name: "base", width: 390, height: 844 },
  { name: "sm", width: 640, height: 960 },
  { name: "md", width: 768, height: 1024 },
  { name: "lg", width: 1024, height: 768 },
  { name: "xl", width: 1280, height: 720 },
  { name: "2xl", width: 1536, height: 864 },
] as const satisfies ReadonlyArray<ExpectedViewport>;

const examplePngStems = [
  "examples/react/src/.preview/Card.preview.tsx/",
  "examples/react/src/.preview/ThemedCard.preview.tsx/locale=en,theme=light.",
  "examples/react/src/.preview/ThemedCard.preview.tsx/locale=en,theme=dark.",
  "examples/react/src/.preview/ThemedCard.preview.tsx/locale=zh,theme=light.",
  "examples/react/src/.preview/ThemedCard.preview.tsx/locale=zh,theme=dark.",
  "examples/react-router/app/components/.preview/Card.preview.tsx/",
  "examples/react-router/app/routes/.preview/Project.preview.ts/",
  "examples/vue/src/.preview/Card.preview.ts/",
  "examples/vue/src/.preview/ThemedCard.preview.ts/theme=light.",
  "examples/vue/src/.preview/ThemedCard.preview.ts/theme=dark.",
  "examples/svelte/src/.preview/Card.preview.ts/",
  "examples/svelte/src/.preview/ThemedCard.preview.ts/theme=light.",
  "examples/svelte/src/.preview/ThemedCard.preview.ts/theme=dark.",
  "examples/sveltekit/src/lib/.preview/Card.preview.ts/",
  "examples/sveltekit/src/routes/items/[id]/.preview/Item.preview.ts/",
  "examples/vinext-app/src/.preview/Card.preview.tsx/",
  "examples/vinext-app/app/projects/[projectId]/.preview/Project.preview.ts/",
  "examples/vinext-pages/src/.preview/Card.preview.tsx/",
  "examples/vinext-pages/pages/projects/.preview/Project.preview.ts/",
] as const satisfies ReadonlyArray<ExamplePngStem>;

const expectedPngs: ReadonlyArray<ExpectedPng> = tailwindViewports.flatMap(
  ({ name, height, width }) =>
    examplePngStems.map((stem) => ({
      file: `${stem}${name}.png` as const,
      height,
      width,
    })),
);

describe("generated example artifacts", () => {
  test.concurrent.for(expectedPngs)(
    "$file has a PNG header and is $width×$height",
    async ({ file, height, width }, { expect }) => {
      const contents = await readFile(
        new URL(`../../${file}`, import.meta.url),
      );

      expect(contents.byteLength).toBeGreaterThanOrEqual(24);
      expect(contents.subarray(0, PngSignature.byteLength)).toEqual(
        PngSignature,
      );
      expect(contents.readUInt32BE(8)).toBe(13);
      expect(contents.toString("ascii", 12, 16)).toBe("IHDR");
      expect({
        width: contents.readUInt32BE(16),
        height: contents.readUInt32BE(20),
      }).toStrictEqual({ width, height });
    },
  );
});
