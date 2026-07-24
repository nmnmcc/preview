import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as RcRef from "effect/RcRef";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
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
import {
  cleanupInspectionPreparation,
  collectInspectionProbes,
  inspectionPreparationChanged,
  layoutFingerprint,
  prepareForInspection,
  renderInspectionArtifacts,
} from "../../browser/inspection";
import * as Inspection from "../../inspection";
import * as InspectionAnalysis from "../../inspection-analysis";
import * as InspectionArtifacts from "../../inspection-artifacts";
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
  readonly inspection?: Inspection.Definition;
  readonly reportSource?: string;
  readonly target: Protocol.BrowserPreviewTargetType;
}

interface StateCaptureRequest extends CaptureRequest {
  readonly state: string;
}

export interface CapturedInspection {
  readonly files: ReadonlyArray<InspectionArtifacts.InspectionArtifactFile>;
  readonly findings: InspectionArtifacts.InspectionArtifactTree["findings"];
  readonly checks: InspectionArtifacts.InspectionArtifactTree["checks"];
  readonly declarationFailures: number;
  readonly checkFailures: number;
}

export interface CapturedState {
  readonly state: string;
  readonly png: Uint8Array;
  readonly inspection?: CapturedInspection;
}

export type CaptureResult = readonly [
  CapturedState,
  ...ReadonlyArray<CapturedState>,
];

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
  ) => Effect.Effect<CaptureResult, PreviewBrowserError>;
}

export interface Interface {
  readonly session: (
    source: string,
  ) => Effect.Effect<Session, PreviewBrowserError, Scope.Scope>;
}

interface RpcServerRegistry {
  readonly register: (
    server: PreviewRpcServer.Interface,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly invalidate: () => void;
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
  state: Schema.optionalKey(Schema.String),
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
  state?: string,
): PreviewBrowserError =>
  new PreviewBrowserError({
    source,
    ...(variant === undefined ? {} : { variant }),
    ...(state === undefined ? {} : { state }),
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
      : `Sandbox mount did not resolve within ${request.timeoutMs} ms after done() for ${requestTarget({ source: request.source, variant })} at viewport ${request.viewport.name}.`,
    cause,
    variant,
    request.viewport.name,
  );
};

const captureFailure = (
  request: StateCaptureRequest,
  cause: unknown,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    `Could not capture state ${JSON.stringify(request.state)} for ${request.source} at viewport ${request.viewport.name}: ${formatUnknownError(cause)}`,
    cause,
    request.variant,
    request.viewport.name,
    request.state,
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

type CaptureLifecycleState =
  | {
      readonly phase: "open";
      readonly names: ReadonlySet<string>;
    }
  | {
      readonly phase: "emitting";
      readonly name: string;
      readonly names: ReadonlySet<string>;
    }
  | {
      readonly phase: "done";
      readonly names: ReadonlySet<string>;
    }
  | {
      readonly phase: "failed";
      readonly error: Rpcs.PreviewLifecycleError;
    };

interface CaptureDocumentState {
  readonly document: PreviewRpcServer.DocumentIdentity;
  readonly lifecycle: CaptureLifecycleState;
  readonly captured: ReadonlyArray<CapturedState>;
}

type CaptureLifecycleEvent =
  | {
      readonly type: "emitted" | "done";
      readonly document: PreviewRpcServer.DocumentIdentity;
    }
  | {
      readonly type: "failed";
      readonly document: PreviewRpcServer.DocumentIdentity;
      readonly error: PreviewBrowserError;
    };

interface CaptureSessionRequest extends Request {
  readonly variant?: string;
}

type EmitReservation =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly error: Rpcs.PreviewLifecycleError;
    };

type EmitCompletion =
  | { readonly completed: true }
  | {
      readonly completed: false;
      readonly error: Rpcs.PreviewLifecycleError;
    };

type DoneTransition =
  | { readonly type: "repeat" }
  | { readonly type: "done" }
  | { readonly type: "stale" }
  | {
      readonly type: "failed";
      readonly error: Rpcs.PreviewLifecycleError;
    };

interface RpcHandlerOptions {
  readonly client: {
    readonly id: number;
  };
}

interface RpcDocumentScope {
  readonly resolve: (
    options?: RpcHandlerOptions,
  ) => Effect.Effect<PreviewRpcServer.DocumentIdentity>;
  readonly current: Effect.Effect<
    Option.Option<PreviewRpcServer.DocumentIdentity>
  >;
  readonly isCurrent: (
    document: PreviewRpcServer.DocumentIdentity,
  ) => Effect.Effect<boolean>;
}

const LocalDocument: PreviewRpcServer.DocumentIdentity = {
  epoch: 0,
  documentId: "local-document",
};

const sameDocument = (
  left: PreviewRpcServer.DocumentIdentity,
  right: PreviewRpcServer.DocumentIdentity,
): boolean =>
  left.epoch === right.epoch && left.documentId === right.documentId;

const makeRpcDocumentScope = (
  server?: PreviewRpcServer.Interface,
): RpcDocumentScope => ({
  resolve: (options) =>
    server === undefined
      ? Effect.succeed(LocalDocument)
      : options === undefined
        ? Effect.interrupt
        : server.document(options.client.id).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.interrupt,
                onSome: Effect.succeed,
              }),
            ),
          ),
  current:
    server === undefined
      ? Effect.succeedSome(LocalDocument)
      : server.currentDocument,
  isCurrent: (document) =>
    server === undefined ? Effect.succeed(true) : server.isCurrent(document),
});

const lifecycleError = (
  reason: Rpcs.PreviewLifecycleFailureReason,
  detail: string,
  state?: string,
): Rpcs.PreviewLifecycleError =>
  new Rpcs.PreviewLifecycleError({
    reason,
    detail,
    ...(state === undefined ? {} : { state }),
  });

const lifecycleBrowserFailure = (
  request: CaptureSessionRequest,
  error: Rpcs.PreviewLifecycleError,
): PreviewBrowserError =>
  browserFailure(
    request.source,
    error.detail,
    error,
    request.variant,
    request.viewport.name,
    error.state,
  );

export const makeCaptureRpcSession = Effect.fnUntraced(function* (
  request: CaptureSessionRequest,
  capture: (
    name: string,
  ) => Effect.Effect<CapturedState, PreviewBrowserError, Scope.Scope>,
  rpcServer?: PreviewRpcServer.Interface,
) {
  const documents = makeRpcDocumentScope(rpcServer);
  const state = yield* Ref.make<CaptureDocumentState | undefined>(undefined);
  const events = yield* Queue.unbounded<CaptureLifecycleEvent>();

  const fail = Effect.fnUntraced(function* (
    document: PreviewRpcServer.DocumentIdentity,
    error: Rpcs.PreviewLifecycleError,
    browserError = lifecycleBrowserFailure(request, error),
  ) {
    if (!(yield* documents.isCurrent(document))) {
      return yield* Effect.interrupt;
    }
    const failed = yield* Ref.modify(state, (current) => {
      if (current === undefined || !sameDocument(current.document, document)) {
        return [false, current] as const;
      }
      return [
        true,
        {
          ...current,
          lifecycle: { phase: "failed" as const, error },
        },
      ] as const;
    });
    if (!failed) return yield* Effect.interrupt;
    yield* Queue.offer(events, {
      type: "failed",
      document,
      error: browserError,
    });
    return yield* error;
  });

  const failBrowser = Effect.fnUntraced(function* (
    document: PreviewRpcServer.DocumentIdentity,
    browserError: PreviewBrowserError,
  ) {
    if (!(yield* documents.isCurrent(document))) return;
    const error = lifecycleError(
      "capture-failed",
      browserError.detail,
      browserError.state,
    );
    const failed = yield* Ref.modify(state, (current) => {
      if (current === undefined || !sameDocument(current.document, document)) {
        return [
          true,
          {
            document,
            lifecycle: { phase: "failed" as const, error },
            captured: [],
          },
        ] as const;
      }
      return [
        true,
        {
          ...current,
          lifecycle: { phase: "failed" as const, error },
        },
      ] as const;
    });
    if (failed) {
      yield* Queue.offer(events, {
        type: "failed",
        document,
        error: browserError,
      });
    }
  });

  const CaptureEmit = (
    { name }: { readonly name: string },
    options?: RpcHandlerOptions,
  ) =>
    Effect.gen(function* () {
      const document = yield* documents.resolve(options);
      const reservation = yield* Ref.modify(
        state,
        (existing): readonly [EmitReservation, CaptureDocumentState] => {
          const current =
            existing === undefined || !sameDocument(existing.document, document)
              ? {
                  document,
                  lifecycle: {
                    phase: "open" as const,
                    names: new Set<string>(),
                  },
                  captured: [],
                }
              : existing;
          if (current.lifecycle.phase === "open") {
            if (current.lifecycle.names.has(name)) {
              const error = lifecycleError(
                "duplicate-state",
                `State ${JSON.stringify(name)} was emitted more than once.`,
                name,
              );
              return [
                { allowed: false as const, error },
                {
                  ...current,
                  lifecycle: { phase: "failed" as const, error },
                },
              ];
            }
            return [
              { allowed: true as const },
              {
                ...current,
                lifecycle: {
                  phase: "emitting" as const,
                  name,
                  names: current.lifecycle.names,
                },
              },
            ];
          }
          const error =
            current.lifecycle.phase === "emitting"
              ? lifecycleError(
                  "concurrent-emit",
                  `State ${JSON.stringify(name)} was emitted before state ${JSON.stringify(current.lifecycle.name)} finished. Await each emit() call.`,
                  name,
                )
              : current.lifecycle.phase === "done"
                ? lifecycleError(
                    "after-done",
                    `State ${JSON.stringify(name)} was emitted after done().`,
                    name,
                  )
                : current.lifecycle.error;
          return [
            { allowed: false as const, error },
            {
              ...current,
              lifecycle: { phase: "failed" as const, error },
            },
          ];
        },
      );
      if (!reservation.allowed) {
        return yield* fail(document, reservation.error);
      }

      const result = yield* Effect.result(
        capture(name).pipe(
          Effect.timeout(request.timeoutMs),
          Effect.catchTag("TimeoutError", (cause) =>
            browserFailure(
              request.source,
              `Could not capture state ${JSON.stringify(name)} for ${request.source} at viewport ${request.viewport.name}: the capture did not finish within ${request.timeoutMs} ms.`,
              cause,
              request.variant,
              request.viewport.name,
              name,
            ),
          ),
        ),
      );
      if (!(yield* documents.isCurrent(document))) {
        return yield* Effect.interrupt;
      }
      if (Result.isFailure(result)) {
        const error = lifecycleError(
          "capture-failed",
          result.failure.detail,
          name,
        );
        return yield* fail(document, error, result.failure);
      }

      const completed = yield* Ref.modify(
        state,
        (
          current,
        ): readonly [EmitCompletion, CaptureDocumentState | undefined] => {
          if (
            current === undefined ||
            !sameDocument(current.document, document)
          ) {
            return [
              {
                completed: false as const,
                error: lifecycleError(
                  "capture-failed",
                  `State ${JSON.stringify(name)} belonged to an old document.`,
                  name,
                ),
              },
              current,
            ];
          }
          if (
            current.lifecycle.phase !== "emitting" ||
            current.lifecycle.name !== name
          ) {
            const error =
              current.lifecycle.phase === "failed"
                ? current.lifecycle.error
                : lifecycleError(
                    "capture-failed",
                    `State ${JSON.stringify(name)} could not finish its capture transaction.`,
                    name,
                  );
            return [
              { completed: false as const, error },
              {
                ...current,
                lifecycle: { phase: "failed" as const, error },
              },
            ];
          }
          return [
            { completed: true as const },
            {
              ...current,
              lifecycle: {
                phase: "open" as const,
                names: new Set([...current.lifecycle.names, name]),
              },
              captured: [...current.captured, result.success],
            },
          ];
        },
      );
      if (!completed.completed) {
        if (!(yield* documents.isCurrent(document))) {
          return yield* Effect.interrupt;
        }
        return yield* fail(document, completed.error);
      }
      yield* Queue.offer(events, { type: "emitted", document });
    });

  const CaptureDone = (_payload?: unknown, options?: RpcHandlerOptions) =>
    Effect.gen(function* () {
      const document = yield* documents.resolve(options);
      const transition = yield* Ref.modify(
        state,
        (
          existing,
        ): readonly [DoneTransition, CaptureDocumentState | undefined] => {
          if (
            existing !== undefined &&
            !sameDocument(existing.document, document)
          ) {
            return [{ type: "stale" as const }, existing];
          }
          const current = existing ?? {
            document,
            lifecycle: {
              phase: "open" as const,
              names: new Set<string>(),
            },
            captured: [],
          };
          if (current.lifecycle.phase === "done") {
            return [{ type: "repeat" as const }, current];
          }
          if (
            current.lifecycle.phase === "open" &&
            current.lifecycle.names.size > 0
          ) {
            return [
              { type: "done" as const },
              {
                ...current,
                lifecycle: {
                  phase: "done" as const,
                  names: current.lifecycle.names,
                },
              },
            ];
          }
          const error =
            current.lifecycle.phase === "open"
              ? lifecycleError(
                  "empty-done",
                  "done() was called before any state was emitted.",
                )
              : current.lifecycle.phase === "emitting"
                ? lifecycleError(
                    "done-during-emit",
                    `done() was called before state ${JSON.stringify(current.lifecycle.name)} finished. Await the final emit() call.`,
                    current.lifecycle.name,
                  )
                : current.lifecycle.error;
          return [
            { type: "failed" as const, error },
            {
              ...current,
              lifecycle: { phase: "failed" as const, error },
            },
          ];
        },
      );
      if (transition.type === "repeat") return;
      if (transition.type === "stale") return yield* Effect.interrupt;
      if (transition.type === "failed") {
        return yield* fail(document, transition.error);
      }
      yield* Queue.offer(events, { type: "done", document });
    });

  const takeCurrentEvent: Effect.Effect<CaptureLifecycleEvent> = Effect.suspend(
    () =>
      Queue.take(events).pipe(
        Effect.flatMap((event) =>
          documents
            .isCurrent(event.document)
            .pipe(
              Effect.flatMap((current) =>
                current ? Effect.succeed(event) : takeCurrentEvent,
              ),
            ),
        ),
      ),
  );
  const nextEvent = takeCurrentEvent.pipe(
    Effect.timeout(request.timeoutMs),
    Effect.catchTag("TimeoutError", (cause) =>
      browserFailure(
        request.source,
        `Preview did not call emit() or done() within ${request.timeoutMs} ms for ${requestTarget(request)} at viewport ${request.viewport.name}.`,
        cause,
        request.variant,
        request.viewport.name,
      ),
    ),
  );
  const awaitDone: Effect.Effect<
    PreviewRpcServer.DocumentIdentity,
    PreviewBrowserError
  > = Effect.suspend(() =>
    nextEvent.pipe(
      Effect.flatMap((event) =>
        event.type === "failed"
          ? Effect.fail(event.error)
          : event.type === "done"
            ? Effect.succeed(event.document)
            : awaitDone,
      ),
    ),
  );
  const awaitStates: Effect.Effect<CaptureResult, PreviewBrowserError> =
    Effect.suspend(() =>
      Effect.gen(function* () {
        const document = yield* awaitDone;
        const current = yield* Ref.get(state);
        if (
          current === undefined ||
          !sameDocument(current.document, document) ||
          !(yield* documents.isCurrent(document))
        ) {
          return yield* awaitStates;
        }
        const first = current.captured[0];
        if (first === undefined) {
          return yield* browserFailure(
            request.source,
            `Preview ended without a captured state for ${requestTarget(request)} at viewport ${request.viewport.name}.`,
            new Error("The capture lifecycle returned no states."),
            request.variant,
            request.viewport.name,
          );
        }
        return [first, ...current.captured.slice(1)] as CaptureResult;
      }),
    );

  return {
    handlers: { CaptureEmit, CaptureDone },
    awaitStates,
    failBrowser,
    documents,
  };
});

export const makeSandboxRpcSession = Effect.fnUntraced(function* (
  rpcRequest: Rpcs.SandboxPreviewRequest,
  request: PageRequest,
  capture: (
    name: string,
  ) => Effect.Effect<CapturedState, PreviewBrowserError, Scope.Scope>,
  rpcServer?: PreviewRpcServer.Interface,
) {
  const documents = makeRpcDocumentScope(rpcServer);
  const completions = yield* Queue.unbounded<{
    readonly document: PreviewRpcServer.DocumentIdentity;
    readonly exit: Rpcs.SandboxPreviewExit;
  }>();
  const controls = new Map<
    number,
    {
      readonly disposeRequested: Deferred.Deferred<void>;
      readonly disposed: Deferred.Deferred<void>;
    }
  >();
  const controlsLock = yield* Semaphore.make(1);
  const controlFor = (document: PreviewRpcServer.DocumentIdentity) =>
    controlsLock.withPermits(1)(
      Effect.gen(function* () {
        const current = controls.get(document.epoch);
        if (current !== undefined) return current;
        const disposeRequested = yield* Deferred.make<void>();
        const disposed = yield* Deferred.make<void>();
        const control = { disposeRequested, disposed };
        controls.set(document.epoch, control);
        return control;
      }),
    );
  const lifecycle = yield* makeCaptureRpcSession(
    {
      source: request.source,
      baseUrl: request.baseUrl,
      viewport: request.viewport,
      timeoutMs: request.timeoutMs,
      ...(rpcRequest._tag === "Render" && rpcRequest.variant !== undefined
        ? { variant: rpcRequest.variant }
        : {}),
    },
    capture,
    rpcServer,
  );
  const handlers = Rpcs.SandboxRpcs.toLayer({
    SandboxRequest: (_payload, options) =>
      Effect.gen(function* () {
        const document = yield* documents.resolve(options);
        yield* controlFor(document);
        return rpcRequest;
      }),
    SandboxComplete: ({ exit }, options) =>
      Effect.gen(function* () {
        const document = yield* documents.resolve(options);
        yield* Queue.offer(completions, { document, exit });
        if (Exit.isFailure(exit)) {
          yield* lifecycle.failBrowser(
            document,
            renderFailure(request, new Error(Cause.pretty(exit.cause))),
          );
        }
      }),
    SandboxAwaitDispose: (_payload, options) =>
      Effect.gen(function* () {
        const document = yield* documents.resolve(options);
        const control = yield* controlFor(document);
        yield* Deferred.await(control.disposeRequested);
      }),
    SandboxDisposed: (_payload, options) =>
      Effect.gen(function* () {
        const document = yield* documents.resolve(options);
        const control = yield* controlFor(document);
        yield* Deferred.succeed(control.disposed, undefined);
      }),
    ...lifecycle.handlers,
  });
  const awaitCompletion: Effect.Effect<Rpcs.SandboxPreviewExit> =
    Effect.suspend(() =>
      Queue.take(completions).pipe(
        Effect.flatMap((completion) =>
          documents
            .isCurrent(completion.document)
            .pipe(
              Effect.flatMap((current) =>
                current ? Effect.succeed(completion.exit) : awaitCompletion,
              ),
            ),
        ),
      ),
    );
  const dispose = Effect.gen(function* () {
    const current = yield* documents.current;
    if (Option.isNone(current)) return;
    const control = controls.get(current.value.epoch);
    if (control === undefined) return;
    yield* Deferred.succeed(control.disposeRequested, undefined);
    yield* Deferred.await(control.disposed);
  });
  return {
    awaitCompletion,
    awaitStates: lifecycle.awaitStates,
    dispose,
    handlers,
  };
});

const makeApplicationRpcSession = Effect.fnUntraced(function* (
  request: CaptureRequest,
  capture: (
    name: string,
  ) => Effect.Effect<CapturedState, PreviewBrowserError, Scope.Scope>,
  rpcServer: PreviewRpcServer.Interface,
) {
  const lifecycle = yield* makeCaptureRpcSession(request, capture, rpcServer);
  const handlers = Rpcs.ApplicationRpcs.toLayer({
    ...lifecycle.handlers,
  });
  return {
    awaitStates: lifecycle.awaitStates,
    handlers,
  };
});

interface OpenPageResult {
  readonly page: Page;
  readonly result: Protocol.BrowserPreviewResult;
  readonly states?: CaptureResult;
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
  rpcServers: RpcServerRegistry,
  request: PageRequest,
  contextOptions: PreviewPlaywrightOptions["context"],
  capture?: (
    page: Page,
    name: string,
  ) => Effect.Effect<CapturedState, PreviewBrowserError, Scope.Scope>,
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
  const rpcServer = yield* PreviewRpcServer.make(page).pipe(
    Effect.mapError((cause) => renderFailure(request, cause)),
  );
  yield* rpcServers.register(rpcServer);
  const runner = yield* Effect.try({
    try: () => runnerDocument(request.baseUrl),
    catch: (cause) => renderFailure(request, cause),
  });
  const baseOrigin = new URL(runner.url).origin;
  const externalRequests = new Set<string>();
  const externalFailure = (): PreviewBrowserError =>
    renderFailure(
      request,
      new Error(
        `External requests are not allowed: ${[...externalRequests].join(", ")}`,
      ),
    );
  const captureState = (name: string) =>
    Effect.gen(function* () {
      if (externalRequests.size > 0) return yield* externalFailure();
      if (capture === undefined) {
        return yield* renderFailure(
          request,
          new Error("A Preview probe cannot emit capture states."),
        );
      }
      const result = yield* capture(page, name);
      if (externalRequests.size > 0) return yield* externalFailure();
      return result;
    });
  const session = yield* makeSandboxRpcSession(
    request.rpcRequest,
    request,
    captureState,
    rpcServer,
  );
  yield* rpcServer
    .serve(Rpcs.SandboxRpcs)
    .pipe(Effect.provide(session.handlers));
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

  const states =
    request.rpcRequest._tag === "Render"
      ? yield* session.awaitStates
      : undefined;
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
    return yield* externalFailure();
  }

  return {
    page,
    result,
    ...(states === undefined ? {} : { states }),
  };
});

const captureScreenshot = Effect.fnUntraced(function* (
  page: Page,
  request: StateCaptureRequest,
  options: PreviewPlaywrightOptions["screenshot"],
): Effect.fn.Return<Uint8Array, PreviewBrowserError> {
  return yield* Effect.tryPromise({
    try: () =>
      page.screenshot(browserScreenshotOptions(options, request.viewport)),
    catch: (cause) => captureFailure(request, cause),
  });
});

const inspectionScreenshotOptions = (
  options: PreviewPlaywrightOptions["screenshot"],
  viewport: Config.ResolvedPreviewViewport,
): PageScreenshotOptions => {
  return {
    animations: "allow",
    caret: "initial",
    ...(options?.omitBackground === undefined
      ? {}
      : { omitBackground: options.omitBackground }),
    ...(options?.scale === undefined ? {} : { scale: options.scale }),
    ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
    fullPage: isFullPageViewportHeight(viewport.height),
    type: "png",
  };
};

const pngDimensions = (
  png: Uint8Array,
): { readonly width: number; readonly height: number } => {
  if (
    png.byteLength < 24 ||
    png[0] !== 137 ||
    png[1] !== 80 ||
    png[2] !== 78 ||
    png[3] !== 71
  ) {
    throw new Error("The browser returned an invalid PNG image.");
  }
  const read = (offset: number): number =>
    ((png[offset] ?? 0) * 0x1000000 +
      (png[offset + 1] ?? 0) * 0x10000 +
      (png[offset + 2] ?? 0) * 0x100 +
      (png[offset + 3] ?? 0)) >>>
    0;
  return { width: read(16), height: read(20) };
};

const fingerprintChanged = (
  fingerprint: Awaited<ReturnType<typeof layoutFingerprint>>,
): boolean => {
  const { first, second } = fingerprint;
  if (
    Math.abs(first.width - second.width) > 0.5 ||
    Math.abs(first.height - second.height) > 0.5 ||
    first.values.length !== second.values.length
  ) {
    return true;
  }
  return first.values.some(
    (value, index) => Math.abs(value - (second.values[index] ?? value)) > 0.5,
  );
};

const prepareInspection = (
  page: Page,
  request: StateCaptureRequest,
  options: PreviewPlaywrightOptions["screenshot"],
) =>
  Effect.tryPromise({
    try: async () => {
      await Promise.all(
        page.frames().map((frame) =>
          frame.evaluate(prepareForInspection, {
            disableAnimations: options?.animations === "disabled",
            hideCaret: options?.caret !== "initial",
            ...(options?.style === undefined ? {} : { style: options.style }),
          }),
        ),
      );
      await Promise.all(
        page.frames().map((frame) =>
          frame.evaluate(async () => {
            await document.fonts.ready;
          }),
        ),
      );
    },
    catch: (cause) => captureFailure(request, cause),
  });

const cleanupInspection = (page: Page): Effect.Effect<void> =>
  Effect.promise(() =>
    Promise.all(
      page
        .frames()
        .map((frame) =>
          frame.evaluate(cleanupInspectionPreparation).catch(() => undefined),
        ),
    ),
  ).pipe(Effect.asVoid);

const captureDomSnapshot = (
  page: Page,
  request: StateCaptureRequest,
): Effect.Effect<unknown, PreviewBrowserError> =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => page.context().newCDPSession(page),
      catch: (cause) => captureFailure(request, cause),
    }),
    (session) =>
      Effect.tryPromise({
        try: () =>
          session.send("DOMSnapshot.captureSnapshot", {
            computedStyles: [...InspectionAnalysis.ComputedStyles],
            includeDOMRects: true,
            includePaintOrder: true,
          }),
        catch: (cause) => captureFailure(request, cause),
      }),
    (session) => Effect.promise(() => session.detach()).pipe(Effect.ignore),
  );

const captureInspectedPage = Effect.fnUntraced(function* (
  page: Page,
  request: StateCaptureRequest,
  options: PreviewPlaywrightOptions["screenshot"],
): Effect.fn.Return<CapturedState, PreviewBrowserError, Scope.Scope> {
  const definition = request.inspection;
  if (definition === undefined) {
    const png = yield* captureScreenshot(page, request, options);
    return { state: request.state, png };
  }

  const fingerprintValue: unknown = yield* Effect.tryPromise({
    try: () => page.evaluate(layoutFingerprint),
    catch: (cause) => captureFailure(request, cause),
  });
  const fingerprint = yield* Schema.decodeUnknownEffect(
    Inspection.BrowserLayoutFingerprint,
  )(fingerprintValue).pipe(
    Effect.mapError((cause) => captureFailure(request, cause)),
  );
  const captured = yield* Effect.acquireUseRelease(
    prepareInspection(page, request, options),
    () =>
      Effect.gen(function* () {
        const probes = yield* Effect.tryPromise({
          try: () =>
            page.evaluate(collectInspectionProbes, {
              ...definition,
              fullPage: isFullPageViewportHeight(request.viewport.height),
            }),
          catch: (cause) => captureFailure(request, cause),
        });
        const snapshot = yield* captureDomSnapshot(page, request);
        const png = yield* Effect.tryPromise({
          try: () =>
            page.screenshot(
              inspectionScreenshotOptions(options, request.viewport),
            ),
          catch: (cause) => captureFailure(request, cause),
        });
        const preparationChanged = yield* Effect.tryPromise({
          try: async () =>
            (
              await Promise.all(
                page
                  .frames()
                  .map((frame) =>
                    frame
                      .evaluate(inspectionPreparationChanged)
                      .catch(() => true),
                  ),
              )
            ).some(Boolean),
          catch: (cause) => captureFailure(request, cause),
        });
        return {
          png: new Uint8Array(png),
          probes,
          snapshot,
          preparationChanged,
        };
      }),
    () => cleanupInspection(page),
  );

  const dimensions = yield* Effect.try({
    try: () => pngDimensions(captured.png),
    catch: (cause) => captureFailure(request, cause),
  });
  const analysis = yield* InspectionAnalysis.analyze({
    source: request.reportSource ?? request.source,
    state: request.state,
    ...(request.variant === undefined ? {} : { variant: request.variant }),
    viewport: {
      name: request.viewport.name,
      width: request.viewport.width,
      height: request.viewport.height,
      layoutHeight: viewportLayoutHeight(request.viewport.height),
      deviceScaleFactor: request.viewport.deviceScaleFactor,
    },
    definition,
    snapshot: captured.snapshot,
    probes: captured.probes,
    pngWidth: dimensions.width,
    pngHeight: dimensions.height,
    screenshotScale: options?.scale ?? "device",
    unstable: fingerprintChanged(fingerprint) || captured.preparationChanged,
  }).pipe(Effect.mapError((cause) => captureFailure(request, cause)));
  const renderedValue: unknown = yield* Effect.tryPromise({
    try: () =>
      page.evaluate(renderInspectionArtifacts, {
        png: captured.png,
        capture: analysis.capture,
        nodes: analysis.nodes,
        findings: analysis.findings,
      }),
    catch: (cause) => captureFailure(request, cause),
  });
  const rendered = yield* Schema.decodeUnknownEffect(
    Inspection.RenderedInspectionArtifacts,
  )(renderedValue).pipe(
    Effect.mapError((cause) => captureFailure(request, cause)),
  );
  const artifacts = yield* Effect.try({
    try: () => InspectionArtifacts.make(analysis, rendered),
    catch: (cause) => captureFailure(request, cause),
  });
  return {
    state: request.state,
    png: captured.png,
    inspection: {
      files: artifacts.files,
      findings: artifacts.findings,
      checks: artifacts.checks,
      declarationFailures: analysis.declarationFailures,
      checkFailures: analysis.checkFailures,
    },
  };
});

const capturePage = Effect.fnUntraced(function* (
  browser: BrowserHandle,
  rpcServers: RpcServerRegistry,
  request: CaptureRequest,
  options: PreviewPlaywrightOptions,
): Effect.fn.Return<CaptureResult, PreviewBrowserError, Scope.Scope> {
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
  const opened = yield* openPage(
    browser,
    rpcServers,
    pageRequest,
    options.context,
    (page, state) =>
      captureInspectedPage(page, { ...request, state }, options.screenshot),
  );
  if (opened.result.type !== "render") {
    return yield* renderFailure(
      pageRequest,
      new Error("The preview runner returned the wrong result."),
    );
  }
  if (opened.states === undefined) {
    return yield* renderFailure(
      pageRequest,
      new Error("The preview runner returned no captured states."),
    );
  }
  return opened.states;
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
  rpcServers: RpcServerRegistry,
  request: CaptureRequest,
  options: PreviewPlaywrightOptions,
): Effect.fn.Return<CaptureResult, PreviewBrowserError, Scope.Scope> {
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
  const rpcServer = yield* PreviewRpcServer.make(page).pipe(
    Effect.mapError((cause) => applicationFailure(request, cause)),
  );
  yield* rpcServers.register(rpcServer);
  const externalRequests = new Set<string>();
  const externalFailure = (): PreviewBrowserError =>
    applicationFailure(
      request,
      new Error(
        `External requests are not allowed: ${[...externalRequests].join(", ")}`,
      ),
    );
  const session = yield* makeApplicationRpcSession(
    request,
    (state) =>
      Effect.gen(function* () {
        if (externalRequests.size > 0) return yield* externalFailure();
        const captured = yield* captureInspectedPage(
          page,
          { ...request, state },
          options.screenshot,
        );
        if (externalRequests.size > 0) return yield* externalFailure();
        return captured;
      }),
    rpcServer,
  );
  yield* rpcServer
    .serve(Rpcs.ApplicationRpcs)
    .pipe(Effect.provide(session.handlers));
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

  const states = yield* session.awaitStates;

  if (externalRequests.size > 0) {
    return yield* externalFailure();
  }

  return states;
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
  rpcServers: RpcServerRegistry,
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
        openPage(browser, rpcServers, pageRequest, options.context),
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
          ? capturePage(browser, rpcServers, request, options)
          : captureApplicationPage(browser, rpcServers, request, options),
      );
    });

    return { probe, capture } satisfies Session;
  });

export class Browser extends Context.Service<Browser, Interface>()(
  "@nmnmcc/preview/PreviewBrowser",
) {}

export const controlledLayerWithLauncher = (
  launcher: BrowserLauncher,
  options: PreviewPlaywrightOptions = {},
) => {
  const activeRpcServers = new Set<PreviewRpcServer.Interface>();
  const rpcServers: RpcServerRegistry = {
    register: (server) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          activeRpcServers.add(server);
        }),
        () =>
          Effect.sync(() => {
            activeRpcServers.delete(server);
          }),
      ),
    invalidate: () => {
      for (const server of activeRpcServers) {
        server.reloadCurrentDocument();
      }
    },
  };
  const browserLayer = Layer.effect(
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
      return Browser.of({
        session: makeSession(options, browserRef, rpcServers),
      });
    }),
  );

  return {
    layer: browserLayer,
    invalidateDocuments: rpcServers.invalidate,
  };
};

export const layerWithLauncher = (
  launcher: BrowserLauncher,
  options: PreviewPlaywrightOptions = {},
) => controlledLayerWithLauncher(launcher, options).layer;

export const controlledLayer = (options: PreviewPlaywrightOptions = {}) =>
  controlledLayerWithLauncher(
    (launchOptions) => chromium.launch(launchOptions),
    options,
  );

export const layer = (options: PreviewPlaywrightOptions = {}) =>
  controlledLayer(options).layer;
