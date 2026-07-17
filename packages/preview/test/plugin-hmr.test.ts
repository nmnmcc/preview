import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import {
  createLogger,
  createServer,
  type Logger,
  type ViteDevServer,
} from "vite";
import preview from "../src/index";

const GeneratedPrefix = "[preview] ";
const GeneratedSeparator = " -> ";

interface GeneratedLog {
  readonly name: string;
  readonly path: string;
  readonly time: string;
}

const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

describe("preview plugin hot updates", () => {
  it.live(
    "regenerates only affected previews and ignores output updates",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const generated = yield* Queue.unbounded<GeneratedLog>();
          const errors: Array<string> = [];
          const logger: Logger = createLogger("silent");
          logger.info = (message) => {
            const plain = stripVTControlCharacters(message);
            const prefix = plain.indexOf(GeneratedPrefix);
            if (prefix <= 0) return;
            const separator = plain.indexOf(
              GeneratedSeparator,
              prefix + GeneratedPrefix.length,
            );
            if (separator === -1) return;
            Queue.offerUnsafe(generated, {
              name: plain.slice(prefix + GeneratedPrefix.length, separator),
              path: plain.slice(separator + GeneratedSeparator.length),
              time: plain.slice(0, prefix).trimEnd(),
            });
          };
          logger.error = (message) => {
            errors.push(message);
          };

          const plugin = preview({
            capture: {
              timeoutMs: 5_000,
              viewports: { test: { width: 100, height: 100 } },
            },
          });
          yield* fs.writeFileString(
            path.join(root, "message.ts"),
            'export const message = "first";\n',
          );
          yield* fs.writeFileString(
            path.join(root, "Card.preview.ts"),
            `import { preview } from "@nmnmcc/preview";
import { message } from "./message";
export default preview({
  mount: ({ root, ready }) => {
    root.textContent = message;
    ready();
    return () => undefined;
  }
});`,
          );
          yield* fs.writeFileString(
            path.join(root, "Other.preview.ts"),
            `import { preview } from "@nmnmcc/preview";
export default preview({
  mount: ({ root, ready }) => {
    root.textContent = "other";
    ready();
    return () => undefined;
  }
});`,
          );

          const server = yield* Effect.acquireRelease(
            Effect.tryPromise(() =>
              createServer({
                configFile: false,
                customLogger: logger,
                plugins: [plugin],
                resolve: {
                  alias: [
                    {
                      find: /^@nmnmcc\/preview$/,
                      replacement: fileURLToPath(
                        new URL("../src/browser.ts", import.meta.url),
                      ),
                    },
                  ],
                },
                root,
                server: { host: "127.0.0.1", port: 0 },
              }),
            ),
            (server: ViteDevServer) => Effect.promise(() => server.close()),
          );
          yield* Effect.tryPromise(() => server.listen());

          const first = yield* Queue.take(generated).pipe(
            Effect.timeout("20 seconds"),
          );
          const second = yield* Queue.take(generated).pipe(
            Effect.timeout("20 seconds"),
          );
          deepStrictEqual(
            [first, second].map((entry) => entry.name).toSorted(),
            ["Card", "Other"],
          );
          strictEqual(first.time.length > 0, true);
          strictEqual(second.time.length > 0, true);
          deepStrictEqual(
            [first, second]
              .map((entry) => path.basename(path.dirname(entry.path)))
              .toSorted(),
            ["Card.preview.ts", "Other.preview.ts"],
          );

          yield* fs.writeFileString(
            path.join(root, "message.ts"),
            'export const message = "second";\n',
          );
          const updated = yield* Queue.take(generated).pipe(
            Effect.timeout("20 seconds"),
          );
          strictEqual(updated.name, "Card");
          strictEqual(updated.time.length > 0, true);
          strictEqual(
            path.basename(path.dirname(updated.path)),
            "Card.preview.ts",
          );

          const hotUpdate = plugin.handleHotUpdate;
          if (typeof hotUpdate !== "function") {
            return yield* Effect.die(
              new Error("The preview hot-update hook is missing."),
            );
          }
          const result = yield* Effect.tryPromise(() =>
            Reflect.apply(hotUpdate, plugin, [
              { file: path.join(root, updated.path), modules: [] },
            ]),
          );
          deepStrictEqual(result, []);
          deepStrictEqual(errors, []);
        }),
      ).pipe(Effect.provide(platformLayer)),
    45_000,
  );
});
