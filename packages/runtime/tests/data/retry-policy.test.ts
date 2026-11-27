// The retry policy of <RetryPolicy> (step 33, .ai/plan/poc-33-errors.md
// § RetryPolicy): backoff kinds, onlyCategories, Retry-After, the circuit
// breaker; and a Loader using a policy against the mock backend.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetDataState, setDataDefaults } from "../../src/data/client";
import { Loader, type LoaderOptions } from "../../src/data/loader";
import { CircuitBreaker, policyOf, retryDelay, shouldRetry, type RetryPolicySpec } from "../../src/data/retry";
import { AppError, type AppErrorCategory } from "../../src/errors/app-error";
import { backend, seen, useBackend } from "./backend";

const err = (category: AppErrorCategory, patch: Partial<ConstructorParameters<typeof AppError>[0]> = {}) => new AppError({ category, code: category, ...patch });
const spec = (patch: Partial<RetryPolicySpec> = {}): RetryPolicySpec => ({ attempts: 4, backoff: "exponential", delayMs: 100, jitter: false, ...patch });

describe("delays", () => {
  test.each<[RetryPolicySpec["backoff"], number[]]>([
    ["fixed", [100, 100, 100, 100]],
    ["linear", [100, 200, 300, 400]],
    ["exponential", [100, 200, 400, 800]],
  ])("%s backoff: retries 1–4", (backoff, delays) => {
    expect([1, 2, 3, 4].map((retry) => retryDelay(retry, err("server"), spec({ backoff })))).toEqual(delays);
  });

  test("one backoff is capped at 30 s; Retry-After wins (capped at 60 s) unless honourRetryAfter is false", () => {
    expect(retryDelay(20, err("server"), spec())).toBe(30_000);
    expect(retryDelay(1, err("rate-limit", { retryAfterMs: 5000 }), spec())).toBe(5000);
    expect(retryDelay(1, err("rate-limit", { retryAfterMs: 90_000 }), spec())).toBe(60_000);
    expect(retryDelay(1, err("rate-limit", { retryAfterMs: 5000 }), spec({ honourRetryAfter: false }))).toBe(100);
  });

  test("jitter: ±25% unless the policy turns it off", () => {
    setDataDefaults({ jitter: true });
    try {
      expect([0, 1].map((r) => retryDelay(1, err("server"), spec({ jitter: true }), () => r))).toEqual([75, 125]);
      expect(retryDelay(1, err("server"), spec({ jitter: false }), () => 0)).toBe(100);
    } finally {
      setDataDefaults({ jitter: false });
    }
  });

  test("retries/retryDelay are the same policy: exponential, retries + 1 attempts", () => {
    expect(policyOf({ retries: 2, retryDelay: 500 })).toEqual({ attempts: 3, backoff: "exponential", delayMs: 500 });
  });
});

describe("which errors are retried", () => {
  test.each<[string, Partial<RetryPolicySpec>, AppError, number, boolean]>([
    ["retryable, attempts left", {}, err("server"), 1, true],
    ["retryable, last attempt used", {}, err("server"), 4, false],
    ["not retryable", {}, err("conflict"), 1, false],
    ["onlyCategories excludes a retryable one", { onlyCategories: ["network"] }, err("server"), 1, false],
    ["onlyCategories adds one that isn't retryable (XMLUI can only narrow)", { onlyCategories: ["conflict"] }, err("conflict"), 1, true],
    ["an open circuit's fast failure, even when its category is listed", { onlyCategories: ["server"] }, err("server", { code: "circuit-open" }), 1, false],
    ["user-cancelled, even when listed", { onlyCategories: ["user-cancelled"] }, err("user-cancelled"), 1, false],
    ["attempts 1: never", { attempts: 1 }, err("server"), 1, false],
  ])("%s", (_, patch, error, failures, expected) => {
    expect(shouldRetry(failures, error, spec(patch))).toBe(expected);
  });

  test("a thrown value that isn't an AppError is not retried", () => {
    expect(shouldRetry(1, new Error("bug"), spec())).toBe(false);
  });
});

describe("the circuit breaker", () => {
  const where = { method: "GET", url: "/x" };

  test("closed → open after the threshold → fails fast → half-open after resetMs → closed on success", () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 1000 }, () => now);
    const steps: string[] = [];
    const step = (outcome?: "ok" | "fail") => {
      try {
        breaker.check(where);
      } catch (error) {
        steps.push(`${(error as AppError).code}:${(error as AppError).data.resetInMs}`);
        return;
      }
      if (outcome === "ok") breaker.succeeded();
      else breaker.failed();
      steps.push(breaker.state);
    };
    step("fail");
    step("fail");
    step("fail");
    now = 400;
    step();
    now = 1000;
    step("ok");
    expect(steps).toEqual(["closed", "closed", "open", "circuit-open:600", "closed"]);
  });

  test("a failed probe opens it again at once; a success resets the count", () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetMs: 100 }, () => now);
    breaker.failed();
    breaker.succeeded();
    breaker.failed();
    expect(breaker.state).toBe("closed");
    breaker.failed();
    expect(breaker.state).toBe("open");
    now = 100;
    breaker.check(where);
    expect(breaker.state).toBe("half-open");
    breaker.failed();
    expect(breaker.state).toBe("open");
    expect(() => breaker.check(where)).toThrow(AppError);
  });

  test("the fast failure: code circuit-open, category server, not retryable", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetMs: 1000 }, () => 0);
    breaker.failed();
    let error: unknown;
    try {
      breaker.check(where);
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ code: "circuit-open", category: "server", retryable: false, method: "GET", url: "/x" });
  });
});

describe("a Loader with a policy (mock backend)", () => {
  useBackend();
  beforeEach(() => setDataDefaults({ jitter: false }));
  afterEach(() => resetDataState());

  const options = (patch: Partial<LoaderOptions>): LoaderOptions => ({ request: { url: "/api/users" }, enabled: true, retries: 0, retryDelay: 10, structuralSharing: true, ...patch });

  function load(patch: Partial<LoaderOptions>) {
    const loader = new Loader(options(patch));
    const errors: AppError[] = [];
    loader.events = { error: (error) => errors.push(error) };
    loader.mount();
    return { loader, errors, state: () => loader.state.peek() };
  }

  test("the policy replaces retries/retryDelay: 503 twice, then the data, in three attempts", async () => {
    backend.addFault({ route: "GET /api/users", status: 503, times: 2 });
    const { state } = load({ policy: { spec: spec({ attempts: 3, backoff: "fixed", delayMs: 5 }) } });
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    expect(seen()).toEqual(["GET /api/users", "GET /api/users", "GET /api/users"]);
  });

  test("exhausted: the last real error (http-503, not retry-exhausted) with its attempts", async () => {
    backend.addFault({ route: "GET /api/users", status: 503 });
    const { errors } = load({ policy: { spec: spec({ attempts: 2, delayMs: 5 }) } });
    await vi.waitFor(() => expect(errors.length).toBe(1));
    expect(errors[0]).toMatchObject({ code: "http-503", category: "server", attempts: 2 });
  });

  test("onlyCategories: a 409 is retried when listed", async () => {
    backend.addFault({ route: "GET /api/users", status: 409, times: 1 });
    const { state } = load({ policy: { spec: spec({ attempts: 2, delayMs: 5, onlyCategories: ["conflict"] }) } });
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    expect(seen().length).toBe(2);
  });

  test("the correlation id of a failed response reaches the error", async () => {
    backend.addFault({ route: "GET /api/users", status: 500, headers: { "X-Correlation-Id": "req-42" } });
    const { errors } = load({});
    await vi.waitFor(() => expect(errors.length).toBe(1));
    expect(errors[0]!.correlationId).toBe("req-42");
  });

  test("a circuit shared by two loaders: it opens after the threshold, and the next request fails fast without reaching the server", async () => {
    backend.addFault({ route: "GET /api/users/:id", status: 503 });
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetMs: 60_000 });
    const policy = { spec: spec({ attempts: 2, delayMs: 5 }), breaker };
    const first = load({ request: { url: "/api/users/1" }, policy });
    await vi.waitFor(() => expect(first.errors.length).toBe(1));
    expect(breaker.state).toBe("open");
    const second = load({ request: { url: "/api/users/2" }, policy });
    await vi.waitFor(() => expect(second.errors.length).toBe(1));
    expect(second.errors[0]).toMatchObject({ code: "circuit-open", attempts: 1 });
    expect(seen()).toEqual(["GET /api/users/1", "GET /api/users/1"]);
  });
});
