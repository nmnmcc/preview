import { Buffer } from "node:buffer";
import { glob, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
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

interface DecodedPng {
  readonly hashA: number;
  readonly hashB: number;
  readonly height: number;
  readonly uniform: boolean;
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

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

const decodePng = async (
  page: Page,
  file: ExamplePngPath,
): Promise<DecodedPng> => {
  const contents = await readFile(new URL(`../../${file}`, import.meta.url));
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (context === null) throw new Error("Could not create a canvas.");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();

    let hashA = 2_166_136_261;
    let hashB = 5381;
    let uniform = true;
    for (let index = 0; index < pixels.length; index += 1) {
      const value = pixels[index] ?? 0;
      hashA = Math.imul(hashA ^ value, 16_777_619);
      hashB = Math.imul(hashB, 33) ^ value;
      if (uniform && index >= 4 && value !== pixels[index % 4]) {
        uniform = false;
      }
    }
    return {
      hashA: hashA >>> 0,
      hashB: hashB >>> 0,
      height: canvas.height,
      uniform,
      width: canvas.width,
    };
  }, contents.toString("base64"));
};

const signature = ({ hashA, hashB }: DecodedPng): string => `${hashA}:${hashB}`;

describe("generated example artifacts", () => {
  test("has exactly the expected PNG files", async ({ expect }) => {
    const actual = await Array.fromAsync(
      glob("examples/**/.preview/**/*.png", { cwd: workspaceRoot }),
    );

    expect(actual.toSorted()).toStrictEqual(
      expectedPngs.map(({ file }) => file).toSorted(),
    );
  });

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

  test("decodes representative images with distinct rendered content", async ({
    expect,
  }) => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const decoded = new Map<ExamplePngPath, DecodedPng>();
      for (const { file } of expectedPngs.filter(({ file }) =>
        file.endsWith("base.png"),
      )) {
        const image = await decodePng(page, file);
        expect(image).toMatchObject({
          height: 844,
          uniform: false,
          width: 390,
        });
        decoded.set(file, image);
      }

      const imageSignature = (file: ExamplePngPath): string => {
        const image = decoded.get(file);
        if (image === undefined) {
          throw new Error(`The decoded image is missing: ${file}`);
        }
        return signature(image);
      };
      const distinct = (...files: ReadonlyArray<ExamplePngPath>) =>
        new Set(files.map(imageSignature)).size;

      expect(
        distinct(
          "examples/react/src/.preview/ThemedCard.preview.tsx/locale=en,theme=light.base.png",
          "examples/react/src/.preview/ThemedCard.preview.tsx/locale=en,theme=dark.base.png",
          "examples/react/src/.preview/ThemedCard.preview.tsx/locale=zh,theme=light.base.png",
          "examples/react/src/.preview/ThemedCard.preview.tsx/locale=zh,theme=dark.base.png",
        ),
      ).toBe(4);
      expect(
        distinct(
          "examples/vue/src/.preview/ThemedCard.preview.ts/theme=light.base.png",
          "examples/vue/src/.preview/ThemedCard.preview.ts/theme=dark.base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/svelte/src/.preview/ThemedCard.preview.ts/theme=light.base.png",
          "examples/svelte/src/.preview/ThemedCard.preview.ts/theme=dark.base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/react-router/app/components/.preview/Card.preview.tsx/base.png",
          "examples/react-router/app/routes/.preview/Project.preview.ts/base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/sveltekit/src/lib/.preview/Card.preview.ts/base.png",
          "examples/sveltekit/src/routes/items/[id]/.preview/Item.preview.ts/base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/vinext-app/src/.preview/Card.preview.tsx/base.png",
          "examples/vinext-app/app/projects/[projectId]/.preview/Project.preview.ts/base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/vinext-pages/src/.preview/Card.preview.tsx/base.png",
          "examples/vinext-pages/pages/projects/.preview/Project.preview.ts/base.png",
        ),
      ).toBe(2);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
