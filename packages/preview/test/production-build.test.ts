import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "@effect/vitest";
import { assertInclude, strictEqual } from "@effect/vitest/utils";
import * as Schema from "effect/Schema";
import { build, createBuilder, type PluginOption } from "vite";
import preview from "../src/index";
import { ApplicationModuleId } from "../src/internal/check";
import { ApplicationReadyCodeSignature } from "../src/internal/rpcs";

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const applicationEntry = fileURLToPath(
  new URL("../src/Application.ts", import.meta.url),
);
const previewOptions = {
  capture: {
    viewports: { test: { height: 100, width: 100 } },
  },
} as const;

const BuildOutput = Schema.Struct({
  output: Schema.Array(Schema.Unknown),
});

const BuildChunk = Schema.Struct({
  type: Schema.Literal("chunk"),
  code: Schema.String,
});

const isBuildOutput = Schema.is(BuildOutput);
const isBuildChunk = Schema.is(BuildChunk);

const withProject = async <A>(
  files: Readonly<Record<string, string>>,
  use: (root: string) => Promise<A>,
): Promise<A> => {
  const root = await mkdtemp(join(workspaceRoot, ".preview-build-test-"));
  try {
    await Promise.all(
      Object.entries({
        "package.json": JSON.stringify({ private: true, type: "module" }),
        ...files,
      }).map(async ([file, content]) => {
        const path = join(root, file);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
      }),
    );
    return await use(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

const outputCode = (result: unknown): string => {
  const results = Array.isArray(result) ? result : [result];
  const code: Array<string> = [];
  for (const item of results) {
    if (!isBuildOutput(item)) continue;
    for (const file of item.output) {
      if (isBuildChunk(file)) code.push(file.code);
    }
  }
  return code.join("\n");
};

const applicationAlias = {
  find: ApplicationModuleId,
  replacement: applicationEntry,
} as const;

const buildProject = (
  root: string,
  entry: string,
  plugins: ReadonlyArray<PluginOption> = [],
  external?: (id: string) => boolean,
) =>
  build({
    build: {
      minify: false,
      rolldownOptions: {
        ...(external === undefined ? {} : { external }),
        input: join(root, entry),
      },
      write: false,
    },
    configFile: false,
    logLevel: "silent",
    plugins: [...plugins, preview(previewOptions)],
    resolve: { alias: [applicationAlias] },
    root,
  });

describe("production builds", () => {
  it("removes a Preview-labeled React lifecycle block", () =>
    withProject(
      {
        "src/main.tsx": `import { ready as signal } from "@nmnmcc/preview/application";

const useEffect = (effect: () => void) => effect;

preview: {
  useEffect(() => signal());
}

console.log("react-kept");
`,
      },
      async (root) => {
        const code = outputCode(await buildProject(root, "src/main.tsx"));
        assertInclude(code, "react-kept");
        strictEqual(code.includes(ApplicationReadyCodeSignature), false);
        strictEqual(code.includes("preview:"), false);
      },
    ));

  it("keeps existing Rolldown label removal settings", () =>
    withProject(
      {
        "src/main.ts": `preview: { console.log("preview-dropped"); }
debug: { console.log("debug-dropped"); }
console.log("kept");
`,
      },
      async (root) => {
        const code = outputCode(
          await build({
            build: {
              minify: false,
              rolldownOptions: {
                input: join(root, "src/main.ts"),
                transform: { dropLabels: ["debug"] },
              },
              write: false,
            },
            configFile: false,
            logLevel: "silent",
            plugins: [preview(previewOptions)],
            root,
          }),
        );
        assertInclude(code, "kept");
        strictEqual(code.includes("preview-dropped"), false);
        strictEqual(code.includes("debug-dropped"), false);
      },
    ));

  it("reports bundled ready code by default", () =>
    withProject(
      {
        "src/main.ts": `import { ready } from "@nmnmcc/preview/application";
preview: {
  queueMicrotask(ready);
}

ready();
`,
      },
      async (root) => {
        await rejects(
          buildProject(root, "src/main.ts"),
          /Application ready runtime/u,
        );
      },
    ));

  it("reports a bundled Application preview definition", () =>
    withProject(
      {
        "src/main.ts": `import { application } from "@nmnmcc/preview/application";
console.log(application({ location: "/projects/42" }));
`,
      },
      async (root) => {
        await rejects(
          buildProject(root, "src/main.ts"),
          /Application preview definition/u,
        );
      },
    ));

  it("lets check false skip only the final bundle check", () =>
    withProject(
      {
        "src/main.ts": `import { ready } from "@nmnmcc/preview/application";
preview: {
  queueMicrotask(ready);
}

ready();
`,
      },
      async (root) => {
        const result = await build({
          build: {
            minify: false,
            rolldownOptions: { input: join(root, "src/main.ts") },
            write: false,
          },
          configFile: false,
          logLevel: "silent",
          plugins: [preview({ ...previewOptions, build: { check: false } })],
          resolve: { alias: [applicationAlias] },
          root,
        });
        const code = outputCode(result);
        assertInclude(code, ApplicationReadyCodeSignature);
        strictEqual(code.includes("queueMicrotask"), false);
      },
    ));

  it("reports a Preview label added after the Oxc transform", () =>
    withProject(
      {
        "src/main.ts": `console.log("kept");\n`,
      },
      async (root) => {
        await rejects(
          buildProject(root, "src/main.ts", [
            {
              name: "add-late-preview-label",
              renderChunk(code) {
                return `${code}\npreview: { console.log("late"); }\n`;
              },
            },
          ]),
          /Preview code remains[\s\S]*label preview:/u,
        );
      },
    ));

  it("reports an external Application import in an SSR build", () =>
    withProject(
      {
        "src/main.ts": `import { ready } from "@nmnmcc/preview/application";
export const render = ready;
`,
      },
      async (root) => {
        await rejects(
          build({
            build: {
              rolldownOptions: {
                external: [ApplicationModuleId],
                input: join(root, "src/main.ts"),
              },
              ssr: true,
              write: false,
            },
            configFile: false,
            logLevel: "silent",
            plugins: [preview(previewOptions)],
            root,
          }),
          /environment "ssr"[\s\S]*external import/u,
        );
      },
    ));

  it("removes a Preview-labeled block in an SSR build", () =>
    withProject(
      {
        "src/main.ts": `import { ready } from "@nmnmcc/preview/application";
preview: {
  queueMicrotask(ready);
}
export const render = "ssr-kept";
`,
      },
      async (root) => {
        const code = outputCode(
          await build({
            build: {
              minify: false,
              rolldownOptions: { input: join(root, "src/main.ts") },
              ssr: true,
              write: false,
            },
            configFile: false,
            logLevel: "silent",
            plugins: [preview(previewOptions)],
            resolve: { alias: [applicationAlias] },
            root,
          }),
        );
        assertInclude(code, "ssr-kept");
        strictEqual(code.includes(ApplicationReadyCodeSignature), false);
        strictEqual(code.includes("preview:"), false);
      },
    ));

  it("removes a Preview-labeled block in a custom environment", () =>
    withProject(
      {
        "src/main.ts": `import { ready } from "@nmnmcc/preview/application";
preview: {
  queueMicrotask(ready);
}
export const boot = "edge-kept";
`,
      },
      async (root) => {
        const builder = await createBuilder({
          configFile: false,
          environments: {
            edge: {
              build: {
                minify: false,
                rolldownOptions: { input: join(root, "src/main.ts") },
                write: false,
              },
            },
          },
          logLevel: "silent",
          plugins: [preview(previewOptions)],
          resolve: { alias: [applicationAlias] },
          root,
        });
        const edge = builder.environments.edge;
        if (edge === undefined)
          throw new Error("The edge environment is missing.");
        const code = outputCode(await builder.build(edge));
        assertInclude(code, "edge-kept");
        strictEqual(code.includes(ApplicationReadyCodeSignature), false);
        strictEqual(code.includes("preview:"), false);
      },
    ));

  it("reports the name of a custom Vite build environment", () =>
    withProject(
      {
        "src/main.ts": `import { ready } from "@nmnmcc/preview/application";
export const boot = ready;
`,
      },
      async (root) => {
        const builder = await createBuilder({
          configFile: false,
          environments: {
            edge: {
              build: {
                rolldownOptions: {
                  external: [ApplicationModuleId],
                  input: join(root, "src/main.ts"),
                },
                write: false,
              },
            },
          },
          logLevel: "silent",
          plugins: [preview(previewOptions)],
          root,
        });
        const edge = builder.environments.edge;
        if (edge === undefined)
          throw new Error("The edge environment is missing.");
        await rejects(
          builder.build(edge),
          /environment "edge"[\s\S]*external import/u,
        );
      },
    ));
});
