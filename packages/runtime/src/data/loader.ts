// The core of DataSource (step 20; design: .ai/plan/poc-20-data.md § 3): a
// query-core QueryObserver whose result is bridged into one signal, so
// `users.value` and `users.inProgress` are reactive like any other value.
// React-free; the DataSource component (components) mounts it.
//
// Query-core gives: one request per key (deduplication), the cache, aborting
// a request no one uses any more (a changed key, an unmount), retries with
// our delays, structural sharing, polling without overlap. This file adds
// the state shape, the events and cancel().
import { QueryObserver, type QueryObserverOptions, type QueryObserverResult } from "@tanstack/query-core";
import { signal, type ReadonlySignal } from "../reactivity/signals";
import { queryClient, queryKey } from "./client";
import { isDataError, toDataError, withAttempts, type DataError } from "./errors";
import { buildUrl, sendRequest, type HttpResult, type RequestSpec } from "./http";
import { policyOf, retryDelay, shouldRetry, type RetryPolicy } from "./retry";

export interface LoaderOptions {
  /** The request; undefined while it can't be made yet (an unresolved part of the URL). */
  request: RequestSpec | undefined;
  /** False: no request (`when` is false). */
  enabled: boolean;
  retries: number;
  retryDelay: number;
  /** Step 33: a `<RetryPolicy>` (and its circuit breaker) instead of `retries`/`retryDelay`. */
  policy?: RetryPolicy;
  /** Refetch every this many ms (0 or undefined: no polling). */
  pollIntervalMs?: number;
  structuralSharing: boolean;
  /** The response data → the value (resultSelector, then transformResult). May throw. */
  select?: (data: unknown) => unknown;
}

export interface LoaderEvents {
  loaded?: (data: unknown, isRefetch: boolean) => void;
  error?: (error: DataError) => void;
  cancel?: (reason: string) => void;
}

export interface LoaderState {
  value: unknown;
  inProgress: boolean;
  isRefetching: boolean;
  loaded: boolean;
  error: DataError | undefined;
  cancelled: boolean;
  lastCancelReason: string | undefined;
  responseHeaders: Readonly<Record<string, string>> | undefined;
}

/** What the query caches: the data and the response's headers. */
interface Envelope {
  data: unknown;
  headers: Readonly<Record<string, string>>;
}

const DISABLED_KEY = ["gfui", "disabled"] as const;

export class Loader {
  private readonly stateSignal = signal<LoaderState>(Object.freeze({ ...EMPTY }));
  private readonly observer: QueryObserver<Envelope, DataError, unknown, Envelope, readonly unknown[]>;
  private options: LoaderOptions;
  private unsubscribe: (() => void) | undefined;
  private cancelled: { reason: string } | undefined;
  private lastData: unknown = undefined;
  private lastDataUpdatedAt = 0;
  private lastErrorUpdatedAt = 0;
  private wasFetching = false;
  /** The events of the current render (the component updates them). */
  events: LoaderEvents = {};

  constructor(options: LoaderOptions) {
    this.options = options;
    this.observer = new QueryObserver(queryClient(), this.queryOptions(options));
    // The first state is the optimistic one: "pending" when a fetch will start
    // on mount, the same on the server and in the first client render.
    this.publish(this.observer.getOptimisticResult(this.optimisticOptions(options)));
  }

  get state(): ReadonlySignal<LoaderState> {
    return this.stateSignal;
  }

  setOptions(options: LoaderOptions): void {
    this.options = options;
    this.observer.setOptions(this.queryOptions(options));
    if (!this.unsubscribe) this.publish(this.observer.getOptimisticResult(this.optimisticOptions(options)));
  }

  /** Starts observing (and fetching when enabled). */
  mount(): void {
    if (this.unsubscribe) return;
    this.lastDataUpdatedAt = 0;
    this.lastErrorUpdatedAt = 0;
    this.unsubscribe = this.observer.subscribe((result) => this.update(result));
    this.update(this.observer.getCurrentResult());
  }

  /** Stops observing; query-core aborts a request no one else uses. No event fires afterwards. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Fetches again (joins a fetch that is running). Settles when it ends; never rejects. */
  async refetch(): Promise<void> {
    if (!this.active()) return;
    await this.observer.refetch({ cancelRefetch: false });
  }

  /** Cancels the running fetch (also its retries): the previous value stays. */
  async cancel(reason = "user"): Promise<boolean> {
    if (!this.active() || !this.observer.getCurrentResult().isFetching) return false;
    this.cancelled = { reason };
    await queryClient().cancelQueries({ queryKey: this.key(), exact: true });
    this.publish(this.observer.getCurrentResult());
    if (this.unsubscribe) this.events.cancel?.(reason);
    return true;
  }

  /** The defaulted options for an optimistic result (as React Query's useBaseQuery does). */
  private optimisticOptions(options: LoaderOptions) {
    const defaulted = queryClient().defaultQueryOptions(this.queryOptions(options));
    defaulted._optimisticResults = "optimistic";
    return defaulted;
  }

  private active(): boolean {
    return this.options.enabled && this.options.request !== undefined;
  }

  private key(): readonly unknown[] {
    return this.options.request ? queryKey(this.options.request) : DISABLED_KEY;
  }

  private queryOptions(options: LoaderOptions): QueryObserverOptions<Envelope, DataError, unknown, Envelope, readonly unknown[]> {
    const request = options.request;
    const retry = options.policy?.spec ?? policyOf({ retries: options.retries, retryDelay: options.retryDelay });
    const breaker = options.policy?.breaker;
    const where = () => ({ method: (request?.method ?? "get").toUpperCase(), url: request ? buildUrl(request.url, request.queryParams) : "" });
    return {
      queryKey: this.keyOf(request),
      enabled: options.enabled && request !== undefined,
      queryFn: async ({ signal }) => {
        // Step 33: an open circuit fails at once; every attempt's outcome moves the breaker.
        breaker?.check(where());
        let result: HttpResult;
        try {
          result = await sendRequest(request!, signal);
        } catch (error) {
          if (isDataError(error)) breaker?.failed();
          throw error;
        }
        breaker?.succeeded();
        return { data: result.data, headers: result.headers };
      },
      // query-core counts failures from 0; ours from 1.
      retry: (failures, error) => shouldRetry(failures + 1, error, retry),
      retryDelay: (failures, error) => retryDelay(failures + 1, error, retry),
      refetchInterval: options.pollIntervalMs && options.pollIntervalMs > 0 ? options.pollIntervalMs : false,
      structuralSharing: options.structuralSharing,
      select: (envelope) => {
        try {
          return options.select ? options.select(envelope.data) : envelope.data;
        } catch (error) {
          throw toDataError(error, where());
        }
      },
    };
  }

  private keyOf(request: RequestSpec | undefined): readonly unknown[] {
    return request ? queryKey(request) : DISABLED_KEY;
  }

  /** A new result: the state, and the events it implies. */
  private update(result: QueryObserverResult<unknown, DataError>): void {
    const fetching = result.fetchStatus === "fetching";
    // A new fetch clears the previous cancellation.
    if (fetching && !this.wasFetching) this.cancelled = undefined;
    this.wasFetching = fetching;
    const previousData = this.lastData;
    const dataChanged = result.data !== undefined && result.dataUpdatedAt !== this.lastDataUpdatedAt && result.data !== previousData;
    const errorChanged = result.error !== null && result.errorUpdatedAt !== this.lastErrorUpdatedAt && !fetching;
    this.lastDataUpdatedAt = result.dataUpdatedAt;
    this.lastErrorUpdatedAt = result.errorUpdatedAt;
    this.publish(result);
    if (dataChanged) {
      this.lastData = result.data;
      this.events.loaded?.(result.data, previousData !== undefined);
    }
    if (errorChanged) this.events.error?.(this.stateSignal.peek().error!);
  }

  private errorSource: { error: unknown; attempts: number; converted: DataError } | undefined;

  /** The result's error as a DataError with its attempts; the same object while the error is the same. */
  private errorOf(result: QueryObserverResult<unknown, DataError>): DataError | undefined {
    if (!result.error) return undefined;
    const attempts = Math.max(1, result.failureCount);
    if (this.errorSource?.error === result.error && this.errorSource.attempts === attempts) return this.errorSource.converted;
    const converted = withAttempts(toDataError(result.error, { method: "GET", url: "" }), attempts);
    this.errorSource = { error: result.error, attempts, converted };
    return converted;
  }

  private publish(result: QueryObserverResult<unknown, DataError>): void {
    const raw = this.observer.getCurrentQuery().state.data as Envelope | undefined;
    const error = this.errorOf(result);
    const next: LoaderState = {
      value: result.data,
      inProgress: this.active() && result.fetchStatus === "fetching",
      isRefetching: this.active() && result.isRefetching,
      loaded: result.data !== undefined || result.isSuccess,
      error: this.active() ? error : undefined,
      cancelled: this.cancelled !== undefined,
      lastCancelReason: this.cancelled?.reason ?? this.stateSignal.peek().lastCancelReason,
      responseHeaders: raw?.headers,
    };
    if (!sameState(this.stateSignal.peek(), next)) this.stateSignal.set(Object.freeze(next));
  }
}

const EMPTY: LoaderState = {
  value: undefined,
  inProgress: false,
  isRefetching: false,
  loaded: false,
  error: undefined,
  cancelled: false,
  lastCancelReason: undefined,
  responseHeaders: undefined,
};

function sameState(a: LoaderState, b: LoaderState): boolean {
  for (const key of Object.keys(b) as (keyof LoaderState)[]) if (a[key] !== b[key]) return false;
  return true;
}
