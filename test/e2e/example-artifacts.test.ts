import { Buffer } from "node:buffer";
import { glob, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Inspection } from "@nmnmcc/preview";
import * as Schema from "effect/Schema";
import { chromium, type Page } from "playwright";
import { describe, test } from "vitest";
import { InitialIssues } from "../../examples/react-router/app/features/issues/model";

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
  "examples/react/src/.preview/Card.preview.tsx/default/",
  "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=en,theme=light,",
  "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=en,theme=dark,",
  "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=zh,theme=light,",
  "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=zh,theme=dark,",
  "examples/vue/src/.preview/Card.preview.ts/default/",
  "examples/vue/src/.preview/ThemedCard.preview.ts/default/theme=light,",
  "examples/vue/src/.preview/ThemedCard.preview.ts/default/theme=dark,",
  "examples/svelte/src/.preview/Card.preview.ts/default/",
  "examples/svelte/src/.preview/ThemedCard.preview.ts/default/theme=light,",
  "examples/svelte/src/.preview/ThemedCard.preview.ts/default/theme=dark,",
  "examples/sveltekit/src/lib/.preview/Card.preview.ts/default/",
  "examples/sveltekit/src/routes/items/[id]/.preview/Item.preview.ts/default/",
  "examples/vinext-app/src/.preview/Card.preview.tsx/default/",
  "examples/vinext-app/app/projects/[projectId]/.preview/Project.preview.ts/default/",
  "examples/vinext-pages/src/.preview/Card.preview.tsx/default/",
  "examples/vinext-pages/pages/projects/.preview/Project.preview.ts/default/",
] as const satisfies ReadonlyArray<ExamplePngStem>;

const standardExpectedPngs: ReadonlyArray<ExpectedPng> =
  tailwindViewports.flatMap(({ name, height, width }) =>
    examplePngStems.map((stem) => ({
      file: `${stem}viewport=${name}.png` as const,
      height,
      width,
    })),
  );

const issueRowVariants = [
  "locale=en,state=default",
  "locale=en,state=selected",
  "locale=en,state=blocked",
  "locale=zh,state=default",
  "locale=zh,state=selected",
  "locale=zh,state=blocked",
] as const;

const issueRowStem =
  "examples/react-router/app/components/issues/.preview/IssueRow.preview.tsx/default/";
const issuesApplicationStem =
  "examples/react-router/app/routes/.preview/Issues.preview.ts/default/";

const issueInspectionViewports = [
  { name: "desktop", height: 960, width: 1536 },
  { name: "mobile", height: 844, width: 390 },
] as const;

const issueInspectionChecks = [
  "detail-in-viewport",
  "detail-visible",
  "proof-in-detail",
  "proof-unobscured",
  "selected-issue-in-list",
  "selected-issue-min-height",
  "selected-issue-visible",
  "workspace-content-fits",
  "workspace-visible",
] as const;

const reactRouterExpectedPngs: ReadonlyArray<ExpectedPng> = [
  ...issueRowVariants.flatMap((variant) => [
    {
      file: `${issueRowStem}${variant},viewport=mobile.png` as const,
      height: 320,
      width: 390,
    },
    {
      file: `${issueRowStem}${variant},viewport=desktop.png` as const,
      height: 320,
      width: 960,
    },
  ]),
  {
    file: `${issuesApplicationStem}viewport=mobile.png`,
    height: 844,
    width: 390,
  },
  {
    file: `${issuesApplicationStem}viewport=desktop.png`,
    height: 960,
    width: 1536,
  },
  ...issueInspectionViewports.map(({ name, height, width }) => ({
    file: `${issuesApplicationStem}viewport=${name}.inspect/overview.png` as const,
    height,
    width,
  })),
];

const expectedPngs: ReadonlyArray<ExpectedPng> = [
  ...standardExpectedPngs,
  ...reactRouterExpectedPngs,
];

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

  test("writes complete Preview Lab inspection bundles", async ({ expect }) => {
    for (const { name } of issueInspectionViewports) {
      const directory = new URL(
        `../../${issuesApplicationStem}viewport=${name}.inspect/`,
        import.meta.url,
      );
      expect((await readdir(directory)).toSorted()).toStrictEqual([
        "README.md",
        "capture.json",
        "checks.json",
        "manifest.json",
        "nodes.json",
        "overview.png",
      ]);
    }
    const legacy = await Array.fromAsync(
      glob(`${issuesApplicationStem}viewport=*.inspect*.{html,json,png}`, {
        cwd: workspaceRoot,
      }),
    );
    expect(legacy).toStrictEqual([]);
  });

  test("uses proof paths that point to generated artifacts", async ({
    expect,
  }) => {
    const paths = [...new Set(InitialIssues.map(({ proof }) => proof))];
    const sizes = await Promise.all(
      paths.map(async (proof) => {
        const contents = await readFile(
          new URL(`../../examples/react-router/${proof}`, import.meta.url),
        );
        return contents.byteLength;
      }),
    );

    for (const size of sizes) expect(size).toBeGreaterThan(0);
  });

  test.concurrent.for(issueInspectionViewports)(
    "$name Preview Lab inspection has nine passing checks",
    async ({ name, height, width }, { expect }) => {
      const directory = `../../${issuesApplicationStem}viewport=${name}.inspect/`;
      const manifestText = await readFile(
        new URL(`${directory}manifest.json`, import.meta.url),
        "utf8",
      );
      const input: unknown = JSON.parse(manifestText);
      const manifest = Schema.decodeUnknownSync(Inspection.Manifest)(input, {
        onExcessProperty: "error",
      });
      const capture = Schema.decodeUnknownSync(Inspection.Capture)(
        JSON.parse(
          await readFile(
            new URL(`${directory}${manifest.files.capture}`, import.meta.url),
            "utf8",
          ),
        ),
        { onExcessProperty: "error" },
      );
      const checks = Schema.decodeUnknownSync(Inspection.Checks)(
        JSON.parse(
          await readFile(
            new URL(`${directory}${manifest.files.checks}`, import.meta.url),
            "utf8",
          ),
        ),
        { onExcessProperty: "error" },
      );

      expect(manifest.target).toStrictEqual({
        source: "Issues.preview.ts",
        state: "default",
        viewport: name,
      });
      expect(capture).toMatchObject({
        deviceScaleFactor: 1,
        fullPage: false,
        pngHeight: height,
        pngWidth: width,
        scale: "css",
      });
      expect(checks).toStrictEqual(
        issueInspectionChecks.map((checkName) => ({
          name: checkName,
          status: "passed",
          message: expect.any(String),
        })),
      );
      expect(manifest.findings).toStrictEqual([]);
      const readme = await readFile(
        new URL(`${directory}README.md`, import.meta.url),
        "utf8",
      );
      expect(readme).toContain("## Checks");
      expect(readme).toContain("workspace-visible");
    },
  );

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
      for (const { file } of standardExpectedPngs.filter(({ file }) =>
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
          "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=en,theme=light,viewport=base.png",
          "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=en,theme=dark,viewport=base.png",
          "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=zh,theme=light,viewport=base.png",
          "examples/react/src/.preview/ThemedCard.preview.tsx/default/locale=zh,theme=dark,viewport=base.png",
        ),
      ).toBe(4);
      expect(
        distinct(
          "examples/vue/src/.preview/ThemedCard.preview.ts/default/theme=light,viewport=base.png",
          "examples/vue/src/.preview/ThemedCard.preview.ts/default/theme=dark,viewport=base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/svelte/src/.preview/ThemedCard.preview.ts/default/theme=light,viewport=base.png",
          "examples/svelte/src/.preview/ThemedCard.preview.ts/default/theme=dark,viewport=base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/sveltekit/src/lib/.preview/Card.preview.ts/default/viewport=base.png",
          "examples/sveltekit/src/routes/items/[id]/.preview/Item.preview.ts/default/viewport=base.png",
        ),
      ).toBe(2);

      const reactRouterDecoded = new Map<ExamplePngPath, DecodedPng>();
      for (const { file, height, width } of reactRouterExpectedPngs) {
        const image = await decodePng(page, file);
        expect(image).toMatchObject({ height, uniform: false, width });
        reactRouterDecoded.set(file, image);
      }

      const reactRouterSignature = (file: ExamplePngPath): string => {
        const image = reactRouterDecoded.get(file);
        if (image === undefined) {
          throw new Error(`The decoded image is missing: ${file}`);
        }
        return signature(image);
      };

      for (const viewport of ["mobile", "desktop"] as const) {
        expect(
          new Set(
            issueRowVariants.map((variant) =>
              reactRouterSignature(
                `${issueRowStem}${variant},viewport=${viewport}.png`,
              ),
            ),
          ).size,
        ).toBe(issueRowVariants.length);
      }

      expect(
        new Set([
          reactRouterSignature(`${issuesApplicationStem}viewport=mobile.png`),
          reactRouterSignature(`${issuesApplicationStem}viewport=desktop.png`),
        ]).size,
      ).toBe(2);
      for (const { name } of issueInspectionViewports) {
        expect(
          reactRouterSignature(
            `${issuesApplicationStem}viewport=${name}.inspect/overview.png`,
          ),
        ).not.toBe(
          reactRouterSignature(`${issuesApplicationStem}viewport=${name}.png`),
        );
      }
      expect(
        distinct(
          "examples/vinext-app/src/.preview/Card.preview.tsx/default/viewport=base.png",
          "examples/vinext-app/app/projects/[projectId]/.preview/Project.preview.ts/default/viewport=base.png",
        ),
      ).toBe(2);
      expect(
        distinct(
          "examples/vinext-pages/src/.preview/Card.preview.tsx/default/viewport=base.png",
          "examples/vinext-pages/pages/projects/.preview/Project.preview.ts/default/viewport=base.png",
        ),
      ).toBe(2);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
