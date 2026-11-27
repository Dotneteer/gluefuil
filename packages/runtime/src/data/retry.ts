// The retry policy (step 20; design: .ai/plan/poc-20-data.md § 2; step 33:
// .ai/plan/poc-33-errors.md § RetryPolicy): which errors are retried and how
// long to wait. DataSource gives it to the query engine; APICall runs it itself
// (runWithRetry).
//
// A policy is XMLUI's RetryPolicySpec (xmlui/src/components-core/errors/policy.ts):
// attempts, fixed/linear/exponential backoff, jitter, onlyCategories,
// Retry-After. A DataSource's `retries`/`retryDelay` and APICall's are the
// same thing: exponential backoff, `retries + 1` attempts.
import { AppError } from "../errors/app-error";
import { isDataError, withAttempts } from "./errors";
import { RequestCancelledError } from "./http";

export interface RetryOptions {
  /** Retries after the first attempt (2: three attempts in all). */
  retries: number;
  /** The first wait in ms; doubled for each further retry. */
  retryDelay: number;
}

export type Backoff = "fixed" | "linear" | "exponential";
export const BACKOFFS: readonly Backoff[] = ["fixed", "linear", "exponential"];

/** A `<RetryPolicy>` (step 33). */
export interface RetryPolicySpec {
  /** Total attempts, the first included (≥ 1). */
  attempts: number;
  backoff: Backoff;
  /** The base delay in ms. */
  delayMs: number;
  /** ±25% (default true; the global switch `setRetryJitter` can turn every jitter off). */
  jitter?: boolean;
  /** The categories that are retried (instead of each error's `retryable`). */
  onlyCategories?: readonly string[];
  /** Per attempt, when the request has no timeout of its own. */
  timeoutMs?: number;
  /** Retry-After overrides the backoff (default true; capped at 60 s). */
  honourRetryAfter?: boolean;
}

/** The longest wait between attempts, and the longest Retry-After honoured. */
export const MAX_BACKOFF_MS = 30_000;
export const MAX_RETRY_AFTER_MS = 60_000;

let jitter = true;

/** Turns the ±25% jitter off (tests) or on. */
export function setRetryJitter(enabled: boolean): void {
  jitter = enabled;
}

/** A DataSource's or APICall's `retries`/`retryDelay` as a policy. */
export function policyOf(options: RetryOptions): RetryPolicySpec {
  return { attempts: options.retries + 1, backoff: "exponential", delayMs: options.retryDelay };
}

function asSpec(options: RetryOptions | RetryPolicySpec): RetryPolicySpec {
  return "attempts" in options ? options : policyOf(options);
}

/** Whether to try again after `failures` failed attempts (the last one `error`). */
export function shouldRetry(failures: number, error: unknown, options: RetryOptions | RetryPolicySpec): boolean {
  const spec = asSpec(options);
  if (!isDataError(error) || failures >= spec.attempts) return false;
  // A fast failure of an open circuit, and a cancellation, are never retried.
  if (error.code === "circuit-open" || error.category === "user-cancelled") return false;
  return spec.onlyCategories ? spec.onlyCategories.includes(error.category) : error.retryable;
}

/** The wait before retry number `retry` (1 is the first): Retry-After, else the backoff with jitter. */
export function retryDelay(retry: number, error: unknown, options: RetryOptions | RetryPolicySpec, random: () => number = Math.random): number {
  const spec = asSpec(options);
  const retryAfter = isDataError(error) ? error.retryAfterMs : undefined;
  if (retryAfter !== undefined && spec.honourRetryAfter !== false) return Math.min(retryAfter, MAX_RETRY_AFTER_MS);
  const base = Math.max(0, spec.delayMs);
  const raw = spec.backoff === "fixed" ? base : spec.backoff === "linear" ? base * retry : base * 2 ** (retry - 1);
  const backoff = Math.min(raw, MAX_BACKOFF_MS);
  return jitter && spec.jitter !== false ? Math.round(backoff * (0.75 + random() * 0.5)) : backoff;
}

/** Resolves after `ms`; rejects with RequestCancelledError when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new RequestCancelledError(signal.reason));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RequestCancelledError(signal!.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Runs `attempt` until it succeeds, fails with an error not to retry, runs out of attempts, or `signal` aborts. */
export async function runWithRetry<T>(attempt: () => Promise<T>, options: RetryOptions | RetryPolicySpec, signal?: AbortSignal): Promise<T> {
  for (let failures = 0; ; ) {
    try {
      return await attempt();
    } catch (error) {
      failures++;
      if (!shouldRetry(failures, error, options)) throw markAttempts(error, failures);
      await sleep(retryDelay(failures, error, options), signal);
    }
  }
}

function markAttempts(error: unknown, attempts: number): unknown {
  return isDataError(error) ? withAttempts(error, attempts) : error;
}

// --- The circuit breaker ----------------------------------------------------------------

export interface CircuitBreakerSpec {
  /** Failed attempts in a row that open the circuit. */
  failureThreshold: number;
  /** How long it stays open before one probe is let through. */
  resetMs: number;
}

export type CircuitState = "closed" | "open" | "half-open";

/**
 * One per `<RetryPolicy>` instance, shared by its DataSources (XMLUI's
 * policy.ts L196–250): `failureThreshold` failed attempts in a row open it;
 * while open, a request fails at once (`circuit-open`); after `resetMs` one
 * probe goes through: its success closes the circuit, its failure opens it again.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private current: CircuitState = "closed";

  constructor(
    readonly spec: CircuitBreakerSpec,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): CircuitState {
    return this.current;
  }

  /** Before an attempt: throws `circuit-open` while open; lets one probe through after `resetMs`. */
  check(where: { method: string; url: string }): void {
    if (this.current === "closed") return;
    const elapsed = this.now() - this.openedAt;
    if (this.current === "open" && elapsed >= this.spec.resetMs) {
      this.current = "half-open";
      return;
    }
    throw new AppError({
      code: "circuit-open",
      category: "server",
      retryable: false,
      message: "The circuit breaker is open: failing fast",
      data: { resetInMs: Math.max(0, this.spec.resetMs - elapsed) },
      method: where.method,
      url: where.url,
    });
  }

  succeeded(): void {
    this.current = "closed";
    this.failures = 0;
  }

  failed(): void {
    this.failures++;
    if (this.current === "half-open" || this.failures >= Math.max(1, this.spec.failureThreshold)) {
      this.current = "open";
      this.openedAt = this.now();
    }
  }
}

/** A RetryPolicy as DataSources receive it: the spec, and the shared breaker when it has one. */
export interface RetryPolicy {
  readonly spec: RetryPolicySpec;
  readonly breaker?: CircuitBreaker;
}
