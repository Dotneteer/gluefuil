// The core of APICall (step 20; design: .ai/plan/poc-20-data.md § 4): a write
// through the HTTP gate, with its own retry loop (none by default), events,
// cancellation tied to the calling handler, and invalidation. React-free; the
// APICall component (components) gives it the request and the events.
import { markWrite, signal, type ReadonlySignal } from "../reactivity/signals";
import { activeTrace, childSpan, tracing } from "../trace/core";
import type { SourceLocation } from "../trace/location";
import { currentInvocation, type Invocation } from "../render/handlers";
import { invalidate } from "./client";
import { isDataError, type DataError } from "./errors";
import { RequestCancelledError, sendRequest, type RequestSpec } from "./http";
import { runWithRetry } from "./retry";

export interface ApiCallOptions {
  retries: number;
  retryDelay: number;
  /** Paths to invalidate after success; undefined: every query (XMLUI). */
  invalidates?: string | readonly string[];
  /** Step 35: the element, for the requests' trace entries. */
  trace?: { component: string; id?: string; at?: SourceLocation };
}

/**
 * The events, as the component's handlers. `beforeRequest` returning false
 * skips the call; `success` returning false skips the invalidation. `error`
 * absent: `execute()` rejects with the error.
 */
export interface ApiCallEvents {
  beforeRequest?: (...params: unknown[]) => unknown;
  success?: (result: unknown) => unknown;
  error?: (error: DataError) => unknown;
  cancel?: (reason: string) => unknown;
}

export interface ApiCallState {
  inProgress: boolean;
  loaded: boolean;
  lastResult: unknown;
  lastError: DataError | undefined;
  cancelled: boolean;
  lastCancelReason: string | undefined;
  lastResponseHeaders: Readonly<Record<string, string>> | undefined;
}

const INITIAL: ApiCallState = Object.freeze({
  inProgress: false,
  loaded: false,
  lastResult: undefined,
  lastError: undefined,
  cancelled: false,
  lastCancelReason: undefined,
  lastResponseHeaders: undefined,
});

export class ApiCaller {
  private readonly stateSignal = signal<ApiCallState>(INITIAL);
  private readonly running = new Set<AbortController>();
  /** The number of the call started last: only its outcome sets lastResult / lastError. */
  private started = 0;
  private disposed = false;

  get state(): ReadonlySignal<ApiCallState> {
    return this.stateSignal;
  }

  /** Step 35: the call whose outcome is published next (later renders name it). */
  private lastCall: { traceId: string; spanId: string } | undefined;

  private set(patch: Partial<ApiCallState>): void {
    if (tracing && this.lastCall) markWrite(this.stateSignal, this.lastCall);
    this.stateSignal.set(Object.freeze({ ...this.stateSignal.peek(), ...patch }));
  }

  /**
   * One call: `beforeRequest`, the request (`spec` is computed with the
   * parameters), `success` or `error`, the invalidation. Resolves to the
   * result; to undefined when skipped, cancelled, or failed with an `error`
   * handler; rejects with the error when there is none. `invocation`: the
   * calling handler, when the caller awaited something first (step 27: APICall's
   * confirmation); by default the one running now.
   */
  async execute(
    params: readonly unknown[],
    spec: (params: readonly unknown[]) => RequestSpec,
    options: ApiCallOptions,
    events: ApiCallEvents,
    invocation: Invocation | undefined = currentInvocation(),
  ): Promise<unknown> {
    if (this.disposed) return undefined;
    // The handler calling execute(): its cancellation (supersede, timeout, unmount) aborts the request.
    const caller = invocation;
    if (events.beforeRequest && (await events.beforeRequest(...params)) === false) return undefined;
    const request = spec(params);
    const call = ++this.started;
    // Step 35: the call's span, in the calling handler's trace; its attempts share it.
    const context = tracing ? childSpan(caller?.trace?.context ?? activeTrace()?.context) : undefined;
    let attempt = 0;
    const controller = new AbortController();
    const unlink = caller?.cancel.onAbort((reason) => controller.abort(reason));
    this.running.add(controller);
    this.set({ inProgress: true, cancelled: false });
    try {
      let headers: Readonly<Record<string, string>> | undefined;
      const result = await runWithRetry(
        async () => {
          attempt++;
          if (context) this.lastCall = { traceId: context.traceId, spanId: context.spanId };
          const origin = context
            ? {
                component: options.trace?.component ?? "APICall",
                ...(options.trace?.id !== undefined ? { id: options.trace.id } : {}),
                ...(options.trace?.at ? { at: options.trace.at } : {}),
                context,
                attempt,
              }
            : undefined;
          const response = await sendRequest(request, controller.signal, origin);
          headers = response.headers;
          return response.data;
        },
        options,
        controller.signal,
      );
      if (call === this.started) this.set({ loaded: true, lastResult: result, lastError: undefined, lastResponseHeaders: headers });
      else this.set({ loaded: true });
      const handled = events.success ? await events.success(result) : undefined;
      if (handled !== false) await invalidate(options.invalidates);
      return result;
    } catch (error) {
      if (error instanceof RequestCancelledError || controller.signal.aborted) {
        const reason = typeof controller.signal.reason === "string" ? controller.signal.reason : "user";
        if (call === this.started) this.set({ cancelled: true, lastCancelReason: reason });
        await events.cancel?.(reason);
        return undefined;
      }
      if (!isDataError(error)) throw error;
      if (call === this.started) this.set({ lastError: error });
      if (events.error) {
        await events.error(error);
        return undefined;
      }
      throw error;
    } finally {
      unlink?.();
      this.running.delete(controller);
      if (this.running.size === 0) this.set({ inProgress: false });
    }
  }

  /** Cancels the running calls; whether there were any. */
  cancel(reason = "user"): boolean {
    if (this.running.size === 0) return false;
    for (const controller of [...this.running]) controller.abort(reason);
    return true;
  }

  /** The component unmounted: running calls are aborted ("unmount"); later calls do nothing. */
  dispose(): void {
    this.cancel("unmount");
    this.disposed = true;
  }

  /** StrictMode remounts: usable again. */
  activate(): void {
    this.disposed = false;
  }
}
