import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RcRef from "effect/RcRef";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import {
  chromium,
  type BrowserContext,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
  type PageScreenshotOptions,
  type Browser as PlaywrightBrowser,
  type Route,
} from "playwright";
import type { PreviewPlaywrightOptions } from "../../../PreviewPlugin";
import { isFullPageViewportHeight, viewportLayoutHeight } from "../../preview";
import * as Protocol from "../../protocol";
import * as Rpcs from "../../rpcs";
import * as RunnerEntry from "../../runner-entry";
import type * as Config from "../Config";
import * as PreviewRpcServer from "../PreviewRpcServer";

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
  readonly session: (
    source: string,
  ) => Effect.Effect<Session, PreviewBrowserError, Scope.Scope>;
}

export type BrowserHandle = Pick<
  PlaywrightBrowser,
  "close" | "isConnected" | "newContext"
>;

export type BrowserLauncher = (
  options: LaunchOptions,
) => Promise<BrowserHandle>;

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

class PreviewBrowserLaunchError extends Schema.TaggedErrorClass<PreviewBrowserLaunchError>(
  "@nmnmcc/preview/PreviewBrowserLaunchError",
)("PreviewBrowserLaunchError", {
  cause: Schema.Defect(),
}) {}

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

interface TargetRequest {
  readonly source: string;
  readonly variant?: string | undefined;
}

interface PageRequest extends Request {
  readonly rpcRequest: Rpcs.SandboxPreviewRequest;
}

const requestTarget = (request: TargetRequest): string =>
  request.variant === undefined
    ? request.source
    : `${request.source} variant ${JSON.stringify(request.variant)}`;

const pageVariant = (request: PageRequest): string | undefined =>
  request.rpcRequest._tag === "Render" ? request.rpcRequest.variant : undefined;

const renderFailure = (
  request: PageRequest,
  cause: unknown,
): PreviewBrowserError => {
  const variant = pageVariant(request);
  return browserFailure(
    request.source,
    `Could not run ${requestTarget({ source: request.source, variant })} at viewport ${request.viewport.name}: ${formatUnknownError(cause)}`,
    cause,
    variant,
    request.viewport.name,
  );
};

const renderCompletionFailure = (
  request: PageRequest,
  cause: unknown,
): PreviewBrowserError => {
  const variant = pageVariant(request);
  return browserFailure(
    request.source,
    request.rpcRequest._tag === "Probe"
      ? `Preview probe did not finish within ${request.timeoutMs} ms for ${request.source}.`
      : `Sandbox mount did not resolve and call ready() within ${request.timeoutMs} ms for ${requestTarget({ source: request.source, variant })} at viewport ${request.viewport.name}.`,
    cause,
    variant,
    request.viewport.name,
  );
};

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
    )} for ${requestTarget(request)} at viewport ${
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
      request,
    )} at viewport ${request.viewport.name}.`,
    cause,
    request.variant,
    request.viewport.name,
  );

const closeBrowser = (browser: BrowserHandle): Effect.Effect<void> =>
  Effect.promise(() => browser.close());

const closeContext = (context: BrowserContext): Effect.Effect<void> =>
  Effect.promise(() => context.close());

interface RunnerDocument {
  readonly html: string;
  readonly url: string;
}

const baseDirectoryUrl = (baseUrl: string): URL => {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url;
};

const appendPath = (baseUrl: string, path: string): string => {
  const url = baseDirectoryUrl(baseUrl);
  url.pathname += path;
  return url.href;
};

const previewModuleUrl = (request: Request): string =>
  appendPath(request.baseUrl, `@fs/${request.source.replaceAll("\\", "/")}`);

const runnerDocument = (baseUrl: string): RunnerDocument => {
  const runnerModuleUrl = appendPath(
    baseUrl,
    `@id/${RunnerEntry.RunnerModuleId}`,
  );
  const url = appendPath(
    baseUrl,
    `.nmnmcc-preview/${globalThis.crypto.randomUUID()}`,
  );
  return {
    url,
    html: `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="preview-root"></div>
    <script>
      // React framework plugins can add Fast Refresh code to Sandbox modules.
      window.$RefreshReg$ ??= () => {}
      window.$RefreshSig$ ??= () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
    </script>
    <script type="module" src="${runnerModuleUrl}"></script>
  </body>
</html>`,
  };
};

const handleRoute =
  (
    externalRequests: Set<string>,
    baseOrigin: string,
    runner?: RunnerDocument,
  ) =>
  (route: Route): Promise<void> => {
    const request = route.request();
    const requestUrl = request.url();
    if (
      runner !== undefined &&
      request.isNavigationRequest() &&
      requestUrl === runner.url
    ) {
      return route.fulfill({
        body: runner.html,
        contentType: "text/html; charset=utf-8",
        status: 200,
      });
    }
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

export const makeSandboxRpcSession = Effect.fnUntraced(function* (
  request: Rpcs.SandboxPreviewRequest,
) {
  const completion = yield* Deferred.make<Rpcs.SandboxPreviewExit>();
  const disposeRequested = yield* Deferred.make<void>();
  const disposed = yield* Deferred.make<void>();
  const started = yield* Ref.make(false);
  const handlers = Rpcs.SandboxRpcs.toLayer({
    SandboxRequest: () => Ref.set(started, true).pipe(Effect.as(request)),
    SandboxComplete: ({ exit }) =>
      Deferred.succeed(completion, exit).pipe(Effect.asVoid),
    SandboxAwaitDispose: () => Deferred.await(disposeRequested),
    SandboxDisposed: () =>
      Deferred.succeed(disposed, undefined).pipe(Effect.asVoid),
  });
  const dispose = Ref.get(started).pipe(
    Effect.flatMap((hasStarted) =>
      hasStarted
        ? Deferred.succeed(disposeRequested, undefined).pipe(
            Effect.andThen(Deferred.await(disposed)),
          )
        : Effect.void,
    ),
  );
  return {
    awaitCompletion: Deferred.await(completion),
    dispose,
    handlers,
  };
});

const makeApplicationRpcSession = Effect.fnUntraced(function* () {
  const ready = yield* Deferred.make<void>();
  const handlers = Rpcs.ApplicationRpcs.toLayer({
    ApplicationReady: () =>
      Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
  });
  return {
    awaitReady: Deferred.await(ready),
    handlers,
  };
});

interface OpenPageResult {
  readonly page: Page;
  readonly result: Protocol.BrowserPreviewResult;
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
  browser: BrowserHandle,
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
    closeContext,
  );
  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) => renderFailure(request, cause),
  });
  const runner = yield* Effect.try({
    try: () => runnerDocument(request.baseUrl),
    catch: (cause) => renderFailure(request, cause),
  });
  const baseOrigin = new URL(runner.url).origin;
  const externalRequests = new Set<string>();
  const session = yield* makeSandboxRpcSession(request.rpcRequest);
  yield* Layer.build(
    PreviewRpcServer.serveLayer(page, Rpcs.SandboxRpcs).pipe(
      Layer.provide(session.handlers),
    ),
  ).pipe(
    Effect.mapError((cause) => renderFailure(request, cause)),
    Effect.asVoid,
  );
  yield* Effect.addFinalizer(() =>
    session.dispose.pipe(
      Effect.interruptible,
      Effect.timeout(request.timeoutMs),
      Effect.result,
      Effect.asVoid,
    ),
  );

  yield* Effect.tryPromise({
    try: () =>
      context.route("**/*", handleRoute(externalRequests, baseOrigin, runner)),
    catch: (cause) => renderFailure(request, cause),
  });
  yield* Effect.tryPromise({
    try: () =>
      page.goto(runner.url, {
        waitUntil: "commit",
        timeout: request.timeoutMs,
      }),
    catch: (cause) => renderFailure(request, cause),
  });

  const completion = yield* session.awaitCompletion.pipe(
    Effect.timeout(request.timeoutMs),
    Effect.catchTag("TimeoutError", (cause) =>
      renderCompletionFailure(request, cause),
    ),
  );
  const result = yield* completion.pipe(
    Effect.catchCause((cause) =>
      renderFailure(request, new Error(Cause.pretty(cause))),
    ),
  );

  if (externalRequests.size > 0) {
    return yield* renderFailure(
      request,
      new Error(
        `External requests are not allowed: ${[...externalRequests].join(", ")}`,
      ),
    );
  }

  return { page, result };
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
  browser: BrowserHandle,
  request: CaptureRequest,
  options: PreviewPlaywrightOptions,
): Effect.fn.Return<Uint8Array, PreviewBrowserError, Scope.Scope> {
  const moduleUrl = yield* Effect.try({
    try: () => previewModuleUrl(request),
    catch: (cause) =>
      renderFailure(
        {
          ...request,
          rpcRequest: Rpcs.SandboxPreviewRequest.cases.Render.make({
            moduleUrl: request.source,
            ...(request.variant === undefined
              ? {}
              : { variant: request.variant }),
          }),
        },
        cause,
      ),
  });
  const rpcRequest = Rpcs.SandboxPreviewRequest.cases.Render.make({
    moduleUrl,
    ...(request.variant === undefined ? {} : { variant: request.variant }),
  });
  const pageRequest: PageRequest = { ...request, rpcRequest };
  const opened = yield* openPage(browser, pageRequest, options.context);
  if (opened.result.type !== "render") {
    return yield* renderFailure(
      pageRequest,
      new Error("The preview runner returned the wrong result."),
    );
  }
  return yield* captureScreenshot(opened.page, request, options.screenshot);
});

const applicationUrl = Effect.fnUntraced(function* (request: CaptureRequest) {
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
        throw new Error(
          "Application locations must use the Vite server origin.",
        );
      }
      return url;
    },
    catch: (cause) => applicationFailure(request, cause),
  });
});

const captureApplicationPage = Effect.fnUntraced(function* (
  browser: BrowserHandle,
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
  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) => applicationFailure(request, cause),
  });
  const externalRequests = new Set<string>();
  const session = yield* makeApplicationRpcSession();
  yield* Layer.build(
    PreviewRpcServer.serveLayer(page, Rpcs.ApplicationRpcs).pipe(
      Layer.provide(session.handlers),
    ),
  ).pipe(
    Effect.mapError((cause) => applicationFailure(request, cause)),
    Effect.asVoid,
  );
  yield* Effect.tryPromise({
    try: () => context.route("**/*", handleRoute(externalRequests, url.origin)),
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

  yield* session.awaitReady.pipe(
    Effect.timeout(request.timeoutMs),
    Effect.catchTag("TimeoutError", (cause) =>
      applicationCompletionFailure(request, cause),
    ),
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

const getBrowser = (
  browserRef: RcRef.RcRef<BrowserHandle, PreviewBrowserLaunchError>,
  source: string,
): Effect.Effect<BrowserHandle, PreviewBrowserError, Scope.Scope> =>
  RcRef.get(browserRef).pipe(
    Effect.mapError((error) =>
      browserFailure(
        source,
        "Could not launch Playwright Chromium. Install it with `yarn playwright install chromium`.",
        error.cause,
      ),
    ),
  );

const makeSession = (
  options: PreviewPlaywrightOptions,
  browserRef: RcRef.RcRef<BrowserHandle, PreviewBrowserLaunchError>,
) =>
  Effect.fn("PreviewBrowser.session")(function* (source: string) {
    let browser = yield* getBrowser(browserRef, source);
    if (!browser.isConnected()) {
      yield* RcRef.invalidate(browserRef);
      browser = yield* getBrowser(browserRef, source);
    }

    const probe = Effect.fn("PreviewBrowser.probe")(function* (
      request: Request,
    ) {
      const moduleUrl = yield* Effect.try({
        try: () => previewModuleUrl(request),
        catch: (cause) =>
          renderFailure(
            {
              ...request,
              rpcRequest: Rpcs.SandboxPreviewRequest.cases.Probe.make({
                moduleUrl: request.source,
              }),
            },
            cause,
          ),
      });
      const pageRequest: PageRequest = {
        ...request,
        rpcRequest: Rpcs.SandboxPreviewRequest.cases.Probe.make({
          moduleUrl,
        }),
      };
      const opened = yield* Effect.scoped(
        openPage(browser, pageRequest, options.context),
      );
      if (opened.result.type !== "probe") {
        return yield* renderFailure(
          pageRequest,
          new Error("The preview runner returned the wrong result."),
        );
      }
      return opened.result.targets;
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

export const layerWithLauncher = (
  launcher: BrowserLauncher,
  options: PreviewPlaywrightOptions = {},
) =>
  Layer.effect(
    Browser,
    Effect.gen(function* () {
      const browserRef = yield* RcRef.make({
        acquire: Effect.acquireRelease(
          Effect.tryPromise({
            try: () => launcher({ headless: true, ...options.launch }),
            catch: (cause) => new PreviewBrowserLaunchError({ cause }),
          }),
          closeBrowser,
        ),
        idleTimeToLive: Duration.infinity,
      });

      return Browser.of({ session: makeSession(options, browserRef) });
    }),
  );

export const layer = (options: PreviewPlaywrightOptions = {}) =>
  layerWithLauncher((launchOptions) => chromium.launch(launchOptions), options);
