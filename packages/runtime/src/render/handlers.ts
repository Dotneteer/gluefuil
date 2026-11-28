// Running event handlers: invocation context, cancellation, policies, timeouts.
// Design: .ai/plan/poc-07-async-handlers.md
//
// A compiled handler is `($$s) => ($$x) => handlerFunction`. `$$x` (an
// Invocation) is created per call: it carries the `$cancel` token and opens
// a batch each time the handler resumes after an `await` (see `open`).
//
// Batching across `await` ("segments"): the first synchronous run of a call
// is batched by `runHandler`; every later run starts at a resume (`$$x.open()`,
// which opens a batch) and ends at the next suspension or at the end of the
// function (`$$x.close()`), within the same synchronous run. Each function
// activation closes only what it opened, so batches are balanced by
// construction; the store's watchdog (signals.ts `startBatch`) recovers if
// that is ever violated.

import { reportRuntimeError, scheduleMicrotask, type ErrorSource } from "../errors";
import { batch, endBatch, startBatch } from "../reactivity/signals";
import { activeTrace, childSpan, emit, setActiveTrace, traceFields, traceNow, tracing, type ActiveTrace } from "../trace/core";
import type { HandlerOutcome } from "../trace/entries";
import type { SourceLocation } from "../trace/location";
import { MASK, preview } from "../trace/preview";
import { traceError } from "../trace/emitters";

export type CancelReason = "user" | "supersede" | "timeout" | "unmount";

export type HandlerPolicy = "parallel" | "single-flight" | "queue" | "drop-while-running";

export const HANDLER_POLICIES: ReadonlySet<string> = new Set(["parallel", "single-flight", "queue", "drop-while-running"]);

/** Thrown at the next suspension point of a cancelled handler; never reported. */
export class HandlerCancelledError extends Error {
  override name = "HandlerCancelledError";
  constructor(readonly reason: CancelReason) {
    super(`The handler was cancelled (${reason})`);
  }
}

/**
 * A handler whose caller waits for its result (`HandlerSlot.call`) ran past its
 * timeout: the caller's promise rejects with this at once (step 21: a guard
 * that times out cancels the navigation), while the handler itself is
 * cancelled at its next suspension point.
 */
export class HandlerTimeoutError extends Error {
  override name = "HandlerTimeoutError";
  constructor(readonly timeoutMs: number) {
    super(`The handler did not finish within ${timeoutMs} ms`);
  }
}

/** `$cancel` in handler code. */
export interface CancellationToken {
  readonly aborted: boolean;
  readonly reason: CancelReason | undefined;
  /** A standard AbortSignal, for APIs that accept one. */
  readonly signal: AbortSignal;
  throwIfAborted(): void;
  /** Calls `callback(reason)` on abort (at once if already aborted); returns an unsubscribe function. */
  onAbort(callback: (reason: CancelReason) => void): () => void;
}

/** The invocation context of one handler call (`$$x` in compiled code). */
export class Invocation {
  private readonly controller = new AbortController();
  private cancelReason: CancelReason | undefined;
  private readonly listeners = new Set<(reason: CancelReason) => void>();
  readonly cancel: CancellationToken;

  /** Step 35: this call's trace (set only while tracing). */
  constructor(readonly trace?: ActiveTrace) {
    const self = this;
    this.cancel = Object.freeze({
      get aborted() {
        return self.cancelReason !== undefined;
      },
      get reason() {
        return self.cancelReason;
      },
      get signal() {
        return self.controller.signal;
      },
      throwIfAborted() {
        if (self.cancelReason !== undefined) throw new HandlerCancelledError(self.cancelReason);
      },
      onAbort(callback: (reason: CancelReason) => void) {
        if (self.cancelReason !== undefined) {
          callback(self.cancelReason);
          return () => {};
        }
        self.listeners.add(callback);
        return () => self.listeners.delete(callback);
      },
    });
  }

  abort(reason: CancelReason): void {
    if (this.cancelReason !== undefined) return;
    this.cancelReason = reason;
    this.controller.abort(reason);
    for (const listener of [...this.listeners]) {
      try {
        listener(reason);
      } catch (error) {
        reportRuntimeError(error);
      }
    }
    this.listeners.clear();
  }

  /**
   * After an `await`: stops a cancelled handler (it must not write into a
   * superseded or unmounted UI), then opens the batch of this segment.
   */
  open(): void {
    if (this.cancelReason !== undefined) throw new HandlerCancelledError(this.cancelReason);
    startBatch();
    setCurrent(this);
  }

  /** Before an `await`, or at the end of a function that resumed: closes the segment's batch. */
  close(): void {
    if (current === this) setCurrent(undefined);
    endBatch();
  }
}

/** The invocation whose code is running synchronously right now (for cancel-aware services). */
let current: Invocation | undefined;

/** `current`, and the trace's view of it (step 35). */
function setCurrent(invocation: Invocation | undefined): void {
  current = invocation;
  // Only while tracing (disableTrace clears it): off, a handler call does no trace work.
  if (tracing) setActiveTrace(invocation?.trace);
}

export function currentInvocation(): Invocation | undefined {
  return current;
}

let defaultTimeout = 30_000;

/** The timeout of handlers without `handlerTimeoutMs` (XMLUI's default is 30 s); 0 disables. */
export function setDefaultHandlerTimeout(ms: number): () => void {
  const previous = defaultTimeout;
  defaultTimeout = ms;
  return () => {
    defaultTimeout = previous;
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export type HandlerFunction = (invocation: Invocation) => (...args: unknown[]) => unknown;

/** Step 33: where a slot's errors go. */
export interface HandlerErrorOptions {
  /** The element's `onError`: receives the errors nothing waits for (and those of `call`, which then resolves to undefined). */
  onError?: (error: unknown) => void;
  /** The source the error pipeline reports without `onError` (default "handler"). */
  source?: ErrorSource;
}

/** Step 35: what the trace says about a slot's calls. */
export interface HandlerTraceInfo {
  /** The event (`click`, `mount`). */
  event?: string;
  /** The element. */
  at?: SourceLocation;
  /** The element's id. */
  id?: string;
  /** A password input: arguments and the writes of its handlers are masked. */
  sensitive?: boolean;
}

/**
 * The running and queued invocations of one handler of one element instance,
 * applying its policy.
 */
export class HandlerSlot {
  private readonly running = new Set<Invocation>();
  /** Queued calls (policy "queue"): `drop` settles a call that will never run. */
  private readonly queued: { run: () => void; drop: () => void }[] = [];
  private disposed = false;

  constructor(
    private readonly handler: HandlerFunction,
    private readonly policy: HandlerPolicy = "parallel",
    private readonly timeoutMs?: number,
    private readonly errors: HandlerErrorOptions = {},
    private readonly info: HandlerTraceInfo = {},
  ) {}

  /** Called by the component on each event. Errors are reported (`reportRuntimeError`). */
  invoke(args: unknown[]): void {
    this.dispatch(args);
  }

  /**
   * Like `invoke`, but resolves with the handler's result (`emitEvent`,
   * component methods). It resolves to `undefined` when the policy drops the
   * call, or the call is cancelled. A handler error rejects the promise and is
   * not reported here: the caller receives it. A timeout rejects it at once
   * with `HandlerTimeoutError`.
   */
  call(args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => this.dispatch(args, { resolve, reject }));
  }

  private dispatch(args: unknown[], settle?: Settle): void {
    if (this.disposed) {
      settle?.resolve(undefined);
      return;
    }
    switch (this.policy) {
      case "drop-while-running":
        if (this.running.size > 0) {
          if (tracing) this.traceCall(childSpan(activeTrace()?.context), traceNow(), "dropped", args);
          settle?.resolve(undefined);
          return;
        }
        break;
      case "single-flight":
        for (const invocation of [...this.running]) invocation.abort("supersede");
        break;
      case "queue":
        if (this.running.size > 0 || this.queued.length > 0) {
          this.queued.push({ run: () => this.start(args, settle), drop: () => settle?.resolve(undefined) });
          return;
        }
        break;
      case "parallel":
        break;
    }
    this.start(args, settle);
  }

  /** The element (re)mounted: accept invocations. */
  activate(): void {
    this.disposed = false;
  }

  /** The element unmounted: abort everything, drop the queue. */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.queued.splice(0)) entry.drop();
    for (const invocation of [...this.running]) invocation.abort("unmount");
  }

  /** The number of invocations in flight (for tests). */
  get runningCount(): number {
    return this.running.size;
  }

  /** Step 35: the handler entry of one call. */
  private traceCall(context: ActiveTrace["context"], start: number, outcome: HandlerOutcome, args: unknown[], detail?: unknown): void {
    const info = this.info;
    emit({
      kind: "handler",
      ...traceFields(context),
      ...(info.at ? { at: info.at } : {}),
      event: info.event ?? "handler",
      ...(info.id !== undefined ? { id: info.id } : {}),
      ...(this.policy !== "parallel" ? { policy: this.policy } : {}),
      outcome,
      ...(outcome === "cancelled" && detail instanceof HandlerCancelledError ? { reason: detail.reason } : {}),
      ...(outcome === "error" ? { error: detail instanceof Error ? `${detail.name}: ${detail.message}` : String(detail) } : {}),
      start,
      durationMs: traceNow() - start,
      ...(args.length > 0 ? { args: info.sensitive ? args.map(() => MASK) : args.map(preview) } : {}),
    });
  }

  private start(args: unknown[], caller?: Settle): void {
    // Step 35: a call inside another handler's segment is a span of its trace; else a new trace.
    const trace: ActiveTrace | undefined = tracing ? { context: childSpan(activeTrace()?.context), at: this.info.at, sensitive: this.info.sensitive } : undefined;
    const started = trace ? traceNow() : 0;
    const invocation = new Invocation(trace);
    this.running.add(invocation);
    const timeoutMs = this.timeoutMs ?? defaultTimeout;
    let settle = caller;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            // A waiting caller learns of the timeout now, not when the handler next resumes.
            const waiting = settle;
            settle = undefined;
            waiting?.reject(new HandlerTimeoutError(timeoutMs));
            invocation.abort("timeout");
          }, timeoutMs)
        : undefined;
    let settled = false;
    const done = (failed: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      this.running.delete(invocation);
      if (trace) {
        if (tracing) this.traceCall(trace.context, started, !failed ? "ok" : value instanceof HandlerCancelledError ? "cancelled" : "error", args, value);
        // Errors are reported in the call's trace.
        const outerTrace = setActiveTrace(trace);
        try {
          this.settleCall(failed, value, settle, caller);
        } finally {
          setActiveTrace(outerTrace);
        }
      } else this.settleCall(failed, value, settle, caller);
      const next = this.queued.shift();
      if (next) scheduleMicrotask(next.run);
    };
    let result: unknown;
    // The first synchronous run is one batch; later runs batch themselves.
    const outer = current;
    try {
      setCurrent(invocation);
      result = batch(() => this.handler(invocation)(...args));
    } catch (error) {
      done(true, error ?? new Error("A handler threw undefined"));
      return;
    } finally {
      setCurrent(outer);
    }
    if (isThenable(result)) {
      result.then(
        (value) => done(false, value),
        (error: unknown) => done(true, error ?? new Error("A handler rejected with undefined")),
      );
    } else {
      done(false, result);
    }
  }

  /** Resolves or rejects the caller, or hands the error to `onError` or the pipeline. */
  private settleCall(failed: boolean, value: unknown, settle: Settle | undefined, caller: Settle | undefined): void {
    if (!failed) settle?.resolve(value);
      else if (value instanceof HandlerCancelledError) settle?.resolve(undefined);
    else if (this.errors.onError) {
      // Step 33: the element's onError handles it (a waiting caller gets undefined).
      settle?.resolve(undefined);
      if (settle || caller === undefined) {
        if (tracing) traceError(value, "action", "onError");
        this.errors.onError(value);
      }
    } else if (settle) settle.reject(value);
    else if (caller === undefined) reportRuntimeError(value, this.errors.source ?? "handler");
  }
}

interface Settle {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

/** `delay(ms)`: resolves after `ms`; rejects at once if the calling handler is cancelled. */
export function delay(ms: number): Promise<void> {
  const invocation = current;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve();
    }, ms);
    const unsubscribe = invocation
      ? invocation.cancel.onAbort((reason) => {
          clearTimeout(timer);
          reject(new HandlerCancelledError(reason));
        })
      : () => {};
  });
}
