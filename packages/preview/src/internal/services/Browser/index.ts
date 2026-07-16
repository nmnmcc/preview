import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import {
  type Browser as PlaywrightBrowser,
  type BrowserContext,
  type BrowserContextOptions,
  chromium,
  errors,
  type Page,
  type PageScreenshotOptions,
  type Route,
} from "playwright";
import type { PreviewPlaywrightOptions } from "../../../PreviewPlugin";
import {
  isFullPageViewportHeight,
  viewportLayoutHeight,
} from "../../preview";
import * as Protocol from "../../protocol";
import type * as Config from "../Config";

export interface Request {
  readonly source: string;
  readonly baseUrl: string;
  readonly viewport: Config.ResolvedPreviewViewport;
  readonly timeoutMs: number;
}

export interface CaptureRequest extends Request {
  readonly variant?: string;
  readonly target: Protocol.BrowserPreviewTargetType;
}

export interface Target {
  readonly variant?: string;
  readonly metadata: unknown;
  readonly target: Protocol.BrowserPreviewTargetType;
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
      : `Sandbox mount did not resolve and call ready() within ${request.timeoutMs} ms for ${requestTarget(request)} at viewport ${request.viewport.name}.`,
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

const applicationFailure = (
  request: CaptureRequest,
  cause: unknown,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    `Could not run application location ${JSON.stringify(
      request.target.type === "application"
        ? request.target.location
        : "unknown",
    )} for ${requestTarget({ ...request, action: "render" })} at viewport ${
      request.viewport.name
    }: ${formatUnknownError(cause)}`,
    cause,
    request.variant,
    request.viewport.name,
  );

const applicationCompletionFailure = (
  request: CaptureRequest,
  cause: unknown,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    `Application did not call ready() within ${request.timeoutMs} ms for ${requestTarget(
      { ...request, action: "render" },
    )} at viewport ${request.viewport.name}.`,
    cause,
    request.variant,
    request.viewport.name,
  );

const previewUrl = (request: PageRequest): string => {
  const url = new URL(Protocol.PreviewRoute, request.baseUrl);
  url.searchParams.set(
    Protocol.PreviewModuleParameter,
    `/@fs/${request.source.replaceAll("\\", "/")}`,
  );
  url.searchParams.set(Protocol.PreviewActionParameter, request.action);
  if (request.variant !== undefined) {
    url.searchParams.set(Protocol.PreviewVariantParameter, request.variant);
  }
  return url.href;
};

const closeBrowser = (browser: PlaywrightBrowser): Effect.Effect<void> =>
  Effect.promise(() => browser.close());

const closeContext = (context: BrowserContext): Effect.Effect<void> =>
  Effect.promise(() => context.close());

const closeSandboxContext = (
  context: BrowserContext,
  request: PageRequest,
): Effect.Effect<void> =>
  Effect.suspend(() =>
    Effect.forEach(
      context.pages(),
      (page) =>
        Effect.tryPromise({
          try: () =>
            page.evaluate(async (key: string) => {
              const dispose = Reflect.get(globalThis, key);
              if (typeof dispose === "function") await dispose();
            }, Protocol.PreviewDisposeKey),
          catch: (cause) => renderFailure(request, cause),
        }).pipe(
          Effect.timeout(request.timeoutMs),
          Effect.result,
          Effect.asVoid,
        ),
      { concurrency: 1, discard: true },
    ),
  ).pipe(Effect.ensuring(closeContext(context)));

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

const browserViewport = (
  viewport: Config.ResolvedPreviewViewport,
): { readonly width: number; readonly height: number } => ({
  width: viewport.width,
  height: viewportLayoutHeight(viewport.height),
});

const browserContextOptions = (
  options: PreviewPlaywrightOptions["context"],
  viewport: Config.ResolvedPreviewViewport,
): BrowserContextOptions => ({
  ...(options ?? {}),
  deviceScaleFactor: viewport.deviceScaleFactor,
  javaScriptEnabled: true,
  offline: false,
  serviceWorkers: "block",
  viewport: browserViewport(viewport),
});

const browserScreenshotOptions = (
  options: PreviewPlaywrightOptions["screenshot"],
  viewport: Config.ResolvedPreviewViewport,
): PageScreenshotOptions => ({
  ...(options?.animations === undefined
    ? {}
    : { animations: options.animations }),
  ...(options?.caret === undefined ? {} : { caret: options.caret }),
  ...(options?.omitBackground === undefined
    ? {}
    : { omitBackground: options.omitBackground }),
  ...(options?.scale === undefined ? {} : { scale: options.scale }),
  ...(options?.style === undefined ? {} : { style: options.style }),
  ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
  fullPage: isFullPageViewportHeight(viewport.height),
  type: "png",
});

const openPage = Effect.fnUntraced(function* (
  browser: PlaywrightBrowser,
  request: PageRequest,
  contextOptions: PreviewPlaywrightOptions["context"],
): Effect.fn.Return<OpenPageResult, PreviewBrowserError, Scope.Scope> {
  const context = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        browser.newContext(
          browserContextOptions(contextOptions, request.viewport),
        ),
      catch: (cause) => renderFailure(request, cause),
    }),
    (context) => closeSandboxContext(context, request),
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
          return state?.status === "ready" || state?.status === "error";
        },
        Protocol.PreviewStateKey,
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
        Protocol.PreviewStateKey,
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
  options: PreviewPlaywrightOptions["screenshot"],
): Effect.fn.Return<Uint8Array, PreviewBrowserError> {
  return yield* Effect.tryPromise({
    try: () =>
      page.screenshot(browserScreenshotOptions(options, request.viewport)),
    catch: (cause) => captureFailure(request, cause),
  });
});

const capturePage = Effect.fnUntraced(function* (
  browser: PlaywrightBrowser,
  request: CaptureRequest,
  options: PreviewPlaywrightOptions,
): Effect.fn.Return<Uint8Array, PreviewBrowserError, Scope.Scope> {
  const opened = yield* openPage(
    browser,
    {
      ...request,
      action: "render",
    },
    options.context,
  );
  if (opened.state.result.type !== "render") {
    return yield* renderFailure(
      { ...request, action: "render" },
      new Error("The preview runner returned the wrong result."),
    );
  }
  return yield* captureScreenshot(opened.page, request, options.screenshot);
});

const applicationUrl = Effect.fnUntraced(function* (
  request: CaptureRequest,
) {
  if (request.target.type !== "application") {
    return yield* applicationFailure(
      request,
      new Error("The capture target is not an application."),
    );
  }
  const location = request.target.location;
  return yield* Effect.try({
    try: () => {
      const base = new URL(request.baseUrl);
      const url = new URL(location, base);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin !== base.origin
      ) {
        throw new Error("Application locations must use the Vite server origin.");
      }
      return url;
    },
    catch: (cause) => applicationFailure(request, cause),
  });
});

const captureApplicationPage = Effect.fnUntraced(function* (
  browser: PlaywrightBrowser,
  request: CaptureRequest,
  options: PreviewPlaywrightOptions,
): Effect.fn.Return<Uint8Array, PreviewBrowserError, Scope.Scope> {
  const url = yield* applicationUrl(request);
  const context = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        browser.newContext(
          browserContextOptions(options.context, request.viewport),
        ),
      catch: (cause) => applicationFailure(request, cause),
    }),
    closeContext,
  );

  yield* Effect.tryPromise({
    try: () =>
      context.addInitScript(
        ({ key, version }) => {
          Reflect.set(globalThis, Symbol.for(key), {
            version,
            status: "loading",
          });
        },
        {
          key: Protocol.ApplicationReadyStateKey,
          version: Protocol.ApplicationReadyStateVersion,
        },
      ),
    catch: (cause) => applicationFailure(request, cause),
  });

  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) => applicationFailure(request, cause),
  });
  const externalRequests = new Set<string>();

  yield* Effect.tryPromise({
    try: () =>
      context.route("**/*", handleRoute(externalRequests, url.origin)),
    catch: (cause) => applicationFailure(request, cause),
  });
  const response = yield* Effect.tryPromise({
    try: () =>
      page.goto(url.href, {
        waitUntil: "commit",
        timeout: request.timeoutMs,
      }),
    catch: (cause) => applicationFailure(request, cause),
  });
  if (response === null || !response.ok()) {
    return yield* applicationFailure(
      request,
      new Error(
        response === null
          ? "Application navigation returned no response."
          : `Application navigation returned HTTP ${response.status()}.`,
      ),
    );
  }

  const finalUrl = yield* Effect.try({
    try: () => new URL(page.url()),
    catch: (cause) => applicationFailure(request, cause),
  });
  if (finalUrl.origin !== url.origin) {
    return yield* applicationFailure(
      request,
      new Error("Application navigation left the Vite server origin."),
    );
  }

  yield* Effect.tryPromise({
    try: () =>
      page.waitForFunction(
        (key: string) => {
          const state = Reflect.get(globalThis, Symbol.for(key));
          return state?.status === "ready";
        },
        Protocol.ApplicationReadyStateKey,
        { timeout: request.timeoutMs },
      ),
    catch: (cause) =>
      cause instanceof errors.TimeoutError
        ? applicationCompletionFailure(request, cause)
        : applicationFailure(request, cause),
  });

  const encodedState = yield* Effect.tryPromise({
    try: () =>
      page.evaluate(
        (key: string): unknown =>
          Reflect.get(globalThis, Symbol.for(key)),
        Protocol.ApplicationReadyStateKey,
      ),
    catch: (cause) => applicationFailure(request, cause),
  });
  yield* Schema.decodeUnknownEffect(
    Protocol.BrowserApplicationReady,
  )(encodedState).pipe(
    Effect.mapError((cause) => applicationFailure(request, cause)),
  );

  if (externalRequests.size > 0) {
    return yield* applicationFailure(
      request,
      new Error(
        `External requests are not allowed: ${[...externalRequests].join(", ")}`,
      ),
    );
  }

  return yield* captureScreenshot(page, request, options.screenshot);
});

const makeLaunch = (options: PreviewPlaywrightOptions) =>
  Effect.fn("PreviewBrowser.launch")(function* (source: string) {
    const browser = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => chromium.launch({ headless: true, ...options.launch }),
        catch: (cause) =>
          browserFailure(
            source,
            "Could not launch Playwright Chromium. Install it with `yarn playwright install chromium`.",
            cause,
          ),
      }),
      closeBrowser,
    );

    const probe = Effect.fn("PreviewBrowser.probe")(function* (
      request: Request,
    ) {
      const pageRequest = { ...request, action: "probe" } as const;
      const opened = yield* Effect.scoped(
        openPage(browser, pageRequest, options.context),
      );
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
      return yield* Effect.scoped(
        request.target.type === "sandbox"
          ? capturePage(browser, request, options)
          : captureApplicationPage(browser, request, options),
      );
    });

    return { probe, capture } satisfies Session;
  });

export class Browser extends Context.Service<Browser, Interface>()(
  "@nmnmcc/preview/PreviewBrowser",
) {}

export const layer = (options: PreviewPlaywrightOptions = {}) =>
  Layer.succeed(Browser, Browser.of({ launch: makeLaunch(options) }));
