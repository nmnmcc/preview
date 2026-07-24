import { spawn } from "node:child_process";
import { Option, Schema } from "effect";

const PublicPackages = [
  "@nmnmcc/preview",
  "@nmnmcc/preview-react",
  "@nmnmcc/preview-svelte",
  "@nmnmcc/preview-vue",
] as const;

const NpmRegistry = "https://registry.npmjs.org";

const PublishedResult = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  published: Schema.Boolean,
});

const SkippedResult = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  skipped: Schema.Literal(true),
});

const YarnPublishResult = Schema.Union([PublishedResult, SkippedResult]);

interface PublishResult {
  readonly name: string;
  readonly version: string;
  readonly published: boolean;
}

const parsePublishResult = (output: string): PublishResult => {
  for (const line of output.trimEnd().split(/\r?\n/).reverse()) {
    let value: unknown;

    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }

    const result = Schema.decodeUnknownOption(YarnPublishResult)(value);
    if (Option.isSome(result)) {
      return {
        name: result.value.name,
        version: result.value.version,
        published: "published" in result.value ? result.value.published : false,
      };
    }
  }

  throw new Error("Yarn did not report a publish result.");
};

const publishPackage = (
  packageName: (typeof PublicPackages)[number],
  dryRun: boolean,
): Promise<PublishResult> =>
  new Promise((resolve, reject) => {
    const args = [
      "workspace",
      packageName,
      "npm",
      "publish",
      "--access",
      "public",
      "--tolerate-republish",
      "--json",
    ];

    if (dryRun) {
      args.push("--dry-run");
    }

    const child = spawn("yarn", args, {
      env: {
        ...process.env,
        YARN_NPM_REGISTRY_SERVER: NpmRegistry,
      },
      stdio: ["inherit", "pipe", "inherit"],
    });
    let output = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `Yarn publish failed for ${packageName} with ${
              signal === null ? `exit code ${code}` : `signal ${signal}`
            }.`,
          ),
        );
        return;
      }

      try {
        resolve(parsePublishResult(output));
      } catch (error) {
        reject(error);
      }
    });
  });

const main = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.length === 1 && args[0] === "--dry-run";

  if (args.length > 0 && !dryRun) {
    throw new Error("Use no argument to publish, or use --dry-run to check.");
  }

  if (
    !dryRun &&
    (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN === undefined ||
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL === undefined)
  ) {
    throw new Error(
      "Publishing requires GitHub Actions with OIDC. Use --dry-run locally.",
    );
  }

  for (const packageName of PublicPackages) {
    const result = await publishPackage(packageName, dryRun);

    if (result.name !== packageName) {
      throw new Error(
        `Yarn reported ${result.name} while publishing ${packageName}.`,
      );
    }

    if (dryRun) {
      if (result.published) {
        throw new Error(
          `A dry run published ${result.name}@${result.version}.`,
        );
      }
      continue;
    }

    if (result.published) {
      console.log(`New tag: ${result.name}@${result.version}`);
    }
  }
};

await main();
