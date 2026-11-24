// The retry policy (step 20; design: .ai/plan/poc-20-data.md § 2): which
// errors are retried and how long to wait. DataSource gives it to the query
// engine; APICall runs it itself (runWithRetry).
import { isDataError, withAttempts } from "./errors";
import { RequestCancelledError } from "./http";

export interface RetryOptions {
  /** Retries after the first attempt (2: three attempts in all). */
  retries: number;
  /** The first wait in ms; doubled for each further retry. */
  retryDelay: number;
}

/** The longest wait between attempts, and the longest Retry-After honoured. */
export const MAX_BACKOFF_MS = 30_000;
export const MAX_RETRY_AFTER_MS = 60_000;

let jitter = true;

/** Turns the ±25% jitter off (tests) or on. */
export function setRetryJitter(enabled: boolean): void {
  jitter = enabled;
}

/** Whether to try again after `failures` failures (the last one `error`). */
export function shouldRetry(failures: number, error: unknown, options: RetryOptions): boolean {
  return isDataError(error) && error.retryable && failures <= options.retries;
}

/** The wait before retry number `retry` (1 is the first): Retry-After, else exponential backoff with jitter. */
export function retryDelay(retry: number, error: unknown, options: RetryOptions, random: () => number = Math.random): number {
  const retryAfter = isDataError(error) ? error.retryAfterMs : undefined;
  if (retryAfter !== undefined) return Math.min(retryAfter, MAX_RETRY_AFTER_MS);
  const backoff = Math.min(options.retryDelay * 2 ** (retry - 1), MAX_BACKOFF_MS);
  return jitter ? Math.round(backoff * (0.75 + random() * 0.5)) : backoff;
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

/** Runs `attempt` until it succeeds, fails with a non-retryable error, runs out of retries, or `signal` aborts. */
export async function runWithRetry<T>(attempt: () => Promise<T>, options: RetryOptions, signal?: AbortSignal): Promise<T> {
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
