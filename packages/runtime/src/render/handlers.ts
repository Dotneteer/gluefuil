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

import { reportRuntimeError, scheduleMicrotask } from "../errors";
import { batch, endBatch, startBatch } from "../reactivity/signals";

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

  constructor() {
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
    current = this;
  }

  /** Before an `await`, or at the end of a function that resumed: closes the segment's batch. */
  close(): void {
    if (current === this) current = undefined;
    endBatch();
  }
}

/** The invocation whose code is running synchronously right now (for cancel-aware services). */
let current: Invocation | undefined;

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

/**
 * The running and queued invocations of one handler of one element instance,
 * applying its policy.
 */
export class HandlerSlot {
  private readonly running = new Set<Invocation>();
  private readonly queued: (() => void)[] = [];
  private disposed = false;

  constructor(
    private readonly handler: HandlerFunction,
    private readonly policy: HandlerPolicy = "parallel",
    private readonly timeoutMs?: number,
  ) {}

  /** Called by the component on each event. */
  invoke(args: unknown[]): void {
    if (this.disposed) return;
    switch (this.policy) {
      case "drop-while-running":
        if (this.running.size > 0) return;
        break;
      case "single-flight":
        for (const invocation of [...this.running]) invocation.abort("supersede");
        break;
      case "queue":
        if (this.running.size > 0 || this.queued.length > 0) {
          this.queued.push(() => this.start(args));
          return;
        }
        break;
      case "parallel":
        break;
    }
    this.start(args);
  }

  /** The element (re)mounted: accept invocations. */
  activate(): void {
    this.disposed = false;
  }

  /** The element unmounted: abort everything, drop the queue. */
  dispose(): void {
    this.disposed = true;
    this.queued.length = 0;
    for (const invocation of [...this.running]) invocation.abort("unmount");
  }

  /** The number of invocations in flight (for tests). */
  get runningCount(): number {
    return this.running.size;
  }

  private start(args: unknown[]): void {
    const invocation = new Invocation();
    this.running.add(invocation);
    const timeoutMs = this.timeoutMs ?? defaultTimeout;
    const timer = timeoutMs > 0 ? setTimeout(() => invocation.abort("timeout"), timeoutMs) : undefined;
    let settled = false;
    const done = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      this.running.delete(invocation);
      if (error !== undefined && !(error instanceof HandlerCancelledError)) reportRuntimeError(error);
      const next = this.queued.shift();
      if (next) scheduleMicrotask(next);
    };
    let result: unknown;
    // The first synchronous run is one batch; later runs batch themselves.
    const outer = current;
    try {
      current = invocation;
      result = batch(() => this.handler(invocation)(...args));
    } catch (error) {
      done(error ?? new Error("A handler threw undefined"));
      return;
    } finally {
      current = outer;
    }
    if (isThenable(result)) {
      result.then(
        () => done(),
        (error: unknown) => done(error ?? new Error("A handler rejected with undefined")),
      );
    } else {
      done();
    }
  }
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
