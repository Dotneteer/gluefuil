// Structured errors in the component tree (step 33; design:
// .ai/plan/poc-33-errors.md § Fallback, § RetryPolicy):
//
//   RenderBoundary  the built-in boundary around each Page and the App's
//                   content: a failing part shows a small panel, the shell stays,
//                   and the error goes to the pipeline (App onError, the toast)
//   Fallback        errorTemplate instead of its children after a render error
//                   or an unhandled DataSource error inside it; reset()
//   RetryPolicy     a retry policy (and a circuit breaker) for the DataSources inside
//
// Boundaries don't run in a server render (React's renderToString ignores
// them), so Fallback puts a Suspense boundary inside itself: a child that throws
// in the prerender leaves that section to the client, and the rest of the page
// is prerendered (measured: .ai/plan/poc-33-errors.md, option A).
import {
  AppError,
  BACKOFFS,
  CircuitBreaker,
  reportRuntimeError,
  signal,
  trace,
  traceError,
  useComponentApi,
  useSignal,
  type Backoff,
  type RegisterApi,
  type RetryPolicy as RetryPolicyValue,
  type RetryPolicySpec,
  type TemplateRenderer, useFrameworkText
} from "@gluefuil/runtime";
import { Component, createContext, Suspense, useContext, useMemo, useState, type ReactNode } from "react";

// --- Boundaries ---------------------------------------------------------------------------

interface BoundaryProps {
  /** Called once per caught error (after the commit). */
  onCatch: (error: AppError) => void;
  /** What to show instead of the children; nothing when absent. */
  fallback?: (error: AppError, reset: () => void) => ReactNode;
  /** A change shows the children again (the route, for the App's content). */
  resetKey?: unknown;
  children?: ReactNode;
}

interface BoundaryState {
  error: AppError | undefined;
  resetKey: unknown;
}

/** A React error boundary: render errors of the children as AppErrors. */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: undefined, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: AppError.from(error) };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: undefined, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown): void {
    this.props.onCatch(this.state.error ?? AppError.from(error));
  }

  private readonly reset = () => this.setState({ error: undefined });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return this.props.fallback ? this.props.fallback(error, this.reset) : null;
  }
}

// After the commit: on a first render a boundary catches before the App's layout effect registers its sink.
const reportRender = (error: AppError) => queueMicrotask(() => reportRuntimeError(error, "render"));

/** The panel a built-in boundary shows: the message and "Try again". */
function ErrorPanel({ error, reset }: { error: AppError; reset: () => void }) {
  const t = useFrameworkText();
  return (
    <div className="gfui-ErrorPanel" role="alert">
      <strong className="gfui-ErrorPanel-title">{t("gfui.error.title")}</strong>
      <span className="gfui-ErrorPanel-message">{error.message || t("gfui.error.render")}</span>
      <button type="button" className="gfui-ErrorPanel-retry" onClick={reset}>
        {t("gfui.error.retry")}
      </button>
    </div>
  );
}

/** The built-in boundary (each Page; the App's content, reset by `resetKey`). */
export function RenderBoundary({ resetKey, children }: { resetKey?: unknown; children?: ReactNode }) {
  return (
    <ErrorBoundary onCatch={reportRender} resetKey={resetKey} fallback={(error, reset) => <ErrorPanel error={error} reset={reset} />}>
      {children}
    </ErrorBoundary>
  );
}

// --- Fallback -------------------------------------------------------------------------------

/** The nearest Fallback's report function (DataSources report unhandled errors to it). */
const FallbackContext = createContext<((error: AppError) => void) | undefined>(undefined);

/** Step 33: where a DataSource sends an error its own onError didn't handle: the nearest Fallback, else the pipeline. */
export function useLoaderErrorReport(): (error: AppError) => void {
  const fallback = useContext(FallbackContext);
  return fallback ?? reportLoaderError;
}

const reportLoaderError = (error: AppError) => reportRuntimeError(error, "loader");

export interface FallbackProps {
  isLoading?: unknown;
  errorTemplate?: TemplateRenderer;
  loadingTemplate?: TemplateRenderer;
  registerApi?: RegisterApi;
  children?: ReactNode;
}

export function Fallback({ isLoading, errorTemplate, loadingTemplate, registerApi, children }: FallbackProps) {
  const [state] = useState(() => ({ error: signal<AppError | undefined>(undefined), generation: signal(0) }));
  const error = useSignal(state.error);
  const generation = useSignal(state.generation);
  const api = useMemo(() => {
    // The first error wins: later ones (the same section) are not shown.
    const show = (next: AppError) => {
      if (state.error.peek() === undefined) state.error.set(next);
    };
    // Step 35: while tracing, an error this Fallback handles is an entry (a DataSource's, or a render error).
    const report = (next: AppError) => {
      if (trace.enabled) traceError(next, "loader", "fallback");
      show(next);
    };
    const caught = (next: AppError) => {
      if (trace.enabled) traceError(next, "render", "fallback");
      show(next);
    };
    return {
      report,
      caught,
      reset: () => {
        if (state.error.peek() === undefined) return;
        state.error.set(undefined);
        state.generation.set(state.generation.peek() + 1);
      },
      get error() {
        return state.error.get();
      },
    };
  }, [state]);
  const published = useMemo(
    () => ({
      reset: api.reset,
      get error() {
        return api.error;
      },
    }),
    [api],
  );
  useComponentApi(registerApi, published);
  // The templates are outside the provider and the boundary: their errors go to the next Fallback out.
  if (error) return errorTemplate ? errorTemplate({ $error: error }, "error") : null;
  if (isLoading === true || isLoading === "true") return loadingTemplate ? loadingTemplate({}, "loading") : null;
  return (
    <FallbackContext.Provider value={api.report}>
      <Suspense fallback={null}>
        <ErrorBoundary key={generation} onCatch={api.caught}>
          {children}
        </ErrorBoundary>
      </Suspense>
    </FallbackContext.Provider>
  );
}

// --- RetryPolicy ---------------------------------------------------------------------------

const RetryPolicyContext = createContext<RetryPolicyValue | undefined>(undefined);

/** The nearest RetryPolicy (a DataSource without retries/retryDelay of its own uses it). */
export function useRetryPolicy(): RetryPolicyValue | undefined {
  return useContext(RetryPolicyContext);
}

export interface RetryPolicyProps {
  attempts?: unknown;
  backoff?: unknown;
  delayMs?: unknown;
  jitter?: unknown;
  onlyCategories?: unknown;
  timeoutMs?: unknown;
  honourRetryAfter?: unknown;
  circuitBreaker?: unknown;
  children?: ReactNode;
}

const toNumber = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const notFalse = (value: unknown) => value !== false && value !== "false";

/** `"network, server"` or an array → the category list; anything else: none. */
export function categoryList(value: unknown): string[] | undefined {
  const parts = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(",") : [];
  const list = parts.map((p) => p.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/** The props as a policy spec (XMLUI's defaults: RetryPolicy.defaults.ts). */
export function retryPolicySpec(props: RetryPolicyProps): RetryPolicySpec {
  const backoff = BACKOFFS.includes(props.backoff as Backoff) ? (props.backoff as Backoff) : "exponential";
  const timeoutMs = toNumber(props.timeoutMs);
  const onlyCategories = categoryList(props.onlyCategories);
  return {
    attempts: Math.max(1, Math.floor(toNumber(props.attempts) ?? 3)),
    backoff,
    delayMs: Math.max(0, toNumber(props.delayMs) ?? 500),
    jitter: notFalse(props.jitter),
    honourRetryAfter: notFalse(props.honourRetryAfter),
    ...(timeoutMs !== undefined && timeoutMs > 0 ? { timeoutMs } : {}),
    ...(onlyCategories ? { onlyCategories } : {}),
  };
}

export function RetryPolicy(props: RetryPolicyProps) {
  const spec = retryPolicySpec(props);
  const key = JSON.stringify(spec);
  const cb = props.circuitBreaker !== null && typeof props.circuitBreaker === "object" ? (props.circuitBreaker as Record<string, unknown>) : undefined;
  const threshold = toNumber(cb?.failureThreshold);
  const resetMs = toNumber(cb?.resetMs);
  // One breaker per instance, kept while its settings stay the same.
  const breaker = useMemo(
    () => (threshold !== undefined && resetMs !== undefined ? new CircuitBreaker({ failureThreshold: Math.max(1, threshold), resetMs: Math.max(0, resetMs) }) : undefined),
    [threshold, resetMs],
  );
  // `spec` is captured through its serialized key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<RetryPolicyValue>(() => (breaker ? { spec, breaker } : { spec }), [key, breaker]);
  return <RetryPolicyContext.Provider value={value}>{props.children}</RetryPolicyContext.Provider>;
}
