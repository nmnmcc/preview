import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import {
  type Browser as PlaywrightBrowser,
  type BrowserContext,
  chromium,
  errors,
  type Page,
  type Route,
} from "playwright";
import type * as Preview from "../../preview";
import type * as Config from "../../config";
import * as Protocol from "../../protocol";

export interface Request {
  readonly source: string;
  readonly baseUrl: string;
  readonly viewport: Config.ResolvedPreviewViewport;
  readonly timeoutMs: number;
}

export interface CaptureRequest extends Request {
  readonly capture: Preview.CaptureMode;
  readonly variant?: string;
}

export interface Target {
  readonly variant?: string;
  readonly metadata: unknown;
}

export interface Session {
  readonly probe: (
    request: Request,
  ) => Effect.Effect<ReadonlyArray<Target>, PreviewBrowserError>;
  readonly capture: (
    request: CaptureRequest,
  ) => Effect.Effect<Uint8Array, PreviewBrowserError>;
}

export interface Interface {
  readonly launch: (
    source: string,
  ) => Effect.Effect<Session, PreviewBrowserError, Scope.Scope>;
}

export class PreviewBrowserError extends Schema.TaggedErrorClass<PreviewBrowserError>(
  "@nmnmcc/preview/PreviewBrowserError",
)("PreviewBrowserError", {
  source: Schema.String,
  variant: Schema.optionalKey(Schema.String),
  viewport: Schema.optionalKey(Schema.String),
  detail: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return this.detail;
  }
}

const formatUnknownError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const browserFailure = (
  source: string,
  detail: string,
  cause: unknown,
  variant?: string,
  viewport?: string,
): PreviewBrowserError =>
  new PreviewBrowserError({
    source,
    ...(variant === undefined ? {} : { variant }),
    ...(viewport === undefined ? {} : { viewport }),
    detail,
    cause,
  });

interface PageRequest extends Request {
  readonly action: Protocol.PreviewAction;
  readonly variant?: string;
}

const requestTarget = (request: PageRequest): string =>
  request.variant === undefined
    ? request.source
    : `${request.source} variant ${JSON.stringify(request.variant)}`;

const renderFailure = (
  request: PageRequest,
  cause: unknown,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    `Could not run ${requestTarget(request)} at viewport ${request.viewport.name}: ${formatUnknownError(cause)}`,
    cause,
    request.variant,
    request.viewport.name,
  );

const renderCompletionFailure = (
  request: PageRequest,
  cause: unknown,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    request.action === "probe"
      ? `Preview probe did not finish within ${request.timeoutMs} ms for ${request.source}.`
      : `Preview render did not resolve and call done() within ${request.timeoutMs} ms for ${requestTarget(request)} at viewport ${request.viewport.name}.`,
    cause,
    request.variant,
    request.viewport.name,
  );

const captureFailure = (
  request: CaptureRequest,
  cause: unknown,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    `Could not capture ${request.source} at viewport ${request.viewport.name}: ${formatUnknownError(cause)}`,
    cause,
    request.variant,
    request.viewport.name,
  );

const previewUrl = (request: PageRequest): string => {
  const url = new URL(Protocol.previewRoute, request.baseUrl);
  url.searchParams.set(
    Protocol.previewModuleParameter,
    `/@fs/${request.source.replaceAll("\\", "/")}`,
  );
  url.searchParams.set(Protocol.previewActionParameter, request.action);
  if (request.variant !== undefined) {
    url.searchParams.set(Protocol.previewVariantParameter, request.variant);
  }
  return url.href;
};

const closeBrowser = (browser: PlaywrightBrowser): Effect.Effect<void> =>
  Effect.promise(() => browser.close());

const closeContext = (context: BrowserContext): Effect.Effect<void> =>
  Effect.promise(() => context.close());

const handleRoute =
  (externalRequests: Set<string>, baseOrigin: string) =>
  (route: Route): Promise<void> => {
    const requestUrl = route.request().url();
    const parsed = new URL(requestUrl);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin !== baseOrigin
    ) {
      externalRequests.add(requestUrl);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  };

interface OpenPageResult {
  readonly page: Page;
  readonly state: Protocol.BrowserPreviewReady;
}

const openPage = Effect.fnUntraced(function* (
  browser: PlaywrightBrowser,
  request: PageRequest,
): Effect.fn.Return<OpenPageResult, PreviewBrowserError, Scope.Scope> {
  const context = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        browser.newContext({
          deviceScaleFactor: request.viewport.deviceScaleFactor,
          viewport: {
            width: request.viewport.width,
            height: request.viewport.height,
          },
        }),
      catch: (cause) => renderFailure(request, cause),
    }),
    closeContext,
  );

  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) => renderFailure(request, cause),
  });
  const baseOrigin = yield* Effect.try({
    try: () => new URL(request.baseUrl).origin,
    catch: (cause) => renderFailure(request, cause),
  });
  const externalRequests = new Set<string>();

  yield* Effect.tryPromise({
    try: () => context.route("**/*", handleRoute(externalRequests, baseOrigin)),
    catch: (cause) => renderFailure(request, cause),
  });
  yield* Effect.tryPromise({
    try: () =>
      page.goto(previewUrl(request), {
        waitUntil: "commit",
        timeout: request.timeoutMs,
      }),
    catch: (cause) => renderFailure(request, cause),
  });
  yield* Effect.tryPromise({
    try: () =>
      page.waitForFunction(
        (key: string) => {
          const state = Reflect.get(globalThis, key);
          return (
            typeof state === "object" &&
            state !== null &&
            Reflect.get(state, "status") !== "loading"
          );
        },
        Protocol.previewStateKey,
        { timeout: request.timeoutMs },
      ),
    catch: (cause) =>
      cause instanceof errors.TimeoutError
        ? renderCompletionFailure(request, cause)
        : renderFailure(request, cause),
  });

  const encodedState = yield* Effect.tryPromise({
    try: () =>
      page.evaluate(
        (key: string): unknown => Reflect.get(globalThis, key),
        Protocol.previewStateKey,
      ),
    catch: (cause) => renderFailure(request, cause),
  });
  const state = yield* Schema.decodeUnknownEffect(
    Protocol.BrowserPreviewTerminalState,
  )(encodedState).pipe(
    Effect.mapError((cause) => renderFailure(request, cause)),
  );
  if (state.status === "error") {
    return yield* renderFailure(request, new Error(state.error));
  }

  if (externalRequests.size > 0) {
    return yield* renderFailure(
      request,
      new Error(
        `External requests are not allowed: ${[...externalRequests].join(", ")}`,
      ),
    );
  }

  return { page, state };
});

const captureScreenshot = Effect.fnUntraced(function* (
  page: Page,
  request: CaptureRequest,
): Effect.fn.Return<Uint8Array, PreviewBrowserError> {
  return yield* Effect.tryPromise({
    try: () =>
      page.screenshot({
        fullPage: request.capture === "fullPage",
        type: "png",
      }),
    catch: (cause) => captureFailure(request, cause),
  });
});

const capturePage = Effect.fnUntraced(function* (
  browser: PlaywrightBrowser,
  request: CaptureRequest,
): Effect.fn.Return<Uint8Array, PreviewBrowserError, Scope.Scope> {
  const opened = yield* openPage(browser, {
    ...request,
    action: "render",
  });
  if (opened.state.result.type !== "render") {
    return yield* renderFailure(
      { ...request, action: "render" },
      new Error("The preview runner returned the wrong result."),
    );
  }
  return yield* captureScreenshot(opened.page, request);
});

const launch = Effect.fn("PreviewBrowser.launch")(function* (source: string) {
  const browser = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => chromium.launch({ headless: true }),
      catch: (cause) =>
        browserFailure(
          source,
          "Could not launch Playwright Chromium. Install it with `yarn playwright install chromium`.",
          cause,
        ),
    }),
    closeBrowser,
  );

  const probe = Effect.fn("PreviewBrowser.probe")(function* (request: Request) {
    const pageRequest = { ...request, action: "probe" } as const;
    const opened = yield* Effect.scoped(openPage(browser, pageRequest));
    if (opened.state.result.type !== "probe") {
      return yield* renderFailure(
        pageRequest,
        new Error("The preview runner returned the wrong result."),
      );
    }
    return opened.state.result.targets;
  });

  const capture = Effect.fn("PreviewBrowser.capture")(function* (
    request: CaptureRequest,
  ) {
    return yield* Effect.scoped(capturePage(browser, request));
  });

  return { probe, capture } satisfies Session;
});

export class Browser extends Context.Service<Browser, Interface>()(
  "@nmnmcc/preview/PreviewBrowser",
) {}

export const layer = Layer.succeed(Browser, Browser.of({ launch }));
