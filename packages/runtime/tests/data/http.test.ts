// The HTTP gate, errors and the retry policy (step 20, catalog rows X1–X4,
// R2–R4, R6, S2, C2, C5 at the unit level): a scripted fetch, fake timers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { categoryOfStatus } from "../../src/data/errors";
import { AppError } from "../../src/errors/app-error";
import { buildUrl, parseRetryAfter, RequestCancelledError, sendRequest } from "../../src/data/http";
import { retryDelay, runWithRetry, setRetryJitter, shouldRetry } from "../../src/data/retry";

type Answer = Response | Error | ((init: RequestInit) => Promise<Response>);
let answers: Answer[];
let calls: { url: string; init: RequestInit }[];

beforeEach(() => {
  answers = [];
  calls = [];
  setRetryJitter(false);
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = answers.shift() ?? new Response("[]", { headers: { "content-type": "application/json" } });
    if (answer instanceof Error) return Promise.reject(answer);
    if (typeof answer === "function") return answer(init);
    return Promise.resolve(answer);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setRetryJitter(true);
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A fetch that never answers until its signal aborts (a hung server). */
const hang = (init: RequestInit) =>
  new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

describe("the request", () => {
  test("URL, query parameters (arrays repeat; null and undefined are left out), method, JSON body, headers", async () => {
    answers.push(json({ ok: true }));
    await sendRequest({ url: "/api/users", method: "post", queryParams: { q: "ad", tag: ["a", "b"], none: null, skip: undefined }, body: { name: "Ada" }, headers: { "x-a": 1 } });
    const [call] = calls;
    expect(call!.url).toBe("http://localhost:3000/api/users?q=ad&tag=a&tag=b");
    expect(call!.init.method).toBe("POST");
    expect(call!.init.body).toBe('{"name":"Ada"}');
    expect(call!.init.headers).toEqual({ "x-a": "1", "content-type": "application/json" });
  });

  test("a string body as it is; no body on a GET", async () => {
    await sendRequest({ url: "/a", method: "put", body: "raw" });
    await sendRequest({ url: "/a", body: { x: 1 } });
    expect([calls[0]!.init.body, calls[1]!.init.body]).toEqual(["raw", undefined]);
  });

  test("buildUrl resolves against the page", () => {
    expect(buildUrl("/x", { a: { b: 1 } })).toBe("http://localhost:3000/x?a=%7B%22b%22%3A1%7D");
  });
});

describe("the response", () => {
  test("JSON, text, 204, headers as a frozen plain object", async () => {
    answers.push(json({ a: 1 }, 200, { "x-total": "4" }), new Response("plain", { headers: { "content-type": "text/plain" } }), new Response(null, { status: 204 }));
    const first = await sendRequest({ url: "/a" });
    expect([first.data, first.headers["x-total"], Object.isFrozen(first.headers)]).toEqual([{ a: 1 }, "4", true]);
    expect((await sendRequest({ url: "/a" })).data).toBe("plain");
    expect((await sendRequest({ url: "/a" })).data).toBeUndefined();
  });
});

describe("errors (X1–X3)", () => {
  test.each<[number, string, boolean]>([
    [400, "validation", false],
    [422, "validation", false],
    [401, "authorization", false],
    [403, "authorization", false],
    [404, "not-found", false],
    [409, "conflict", false],
    [429, "rate-limit", true],
    [500, "server", true],
    [503, "server", true],
    [418, "internal", false],
  ])("status %i → %s (retryable %s)", async (status, category, retryable) => {
    expect(categoryOfStatus(status)).toBe(category);
    answers.push(json({ message: `Status ${status}`, errors: { name: "Required" } }, status));
    const error = await sendRequest({ url: "/api/x" }).catch((e: unknown) => e);
    // Step 33: an AppError with step 20's fields and XMLUI's data.
    expect(error).toBeInstanceOf(AppError);
    const body = { message: `Status ${status}`, errors: { name: "Required" } };
    expect((error as AppError).toJSON()).toEqual({
      name: "AppError",
      message: `Status ${status}`,
      category,
      code: `http-${status}`,
      status,
      statusText: expect.any(String),
      retryable,
      body,
      method: "GET",
      url: "http://localhost:3000/api/x",
      data: { statusCode: status, response: body },
    });
    // Frozen, body and data included: script can't change a shared error (X6).
    expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen((error as AppError).body)).toBe(true);
    expect(Object.isFrozen((error as AppError).data)).toBe(true);
  });

  test("without a message in the body: the status and its text", async () => {
    answers.push(new Response(null, { status: 503, statusText: "Service Unavailable" }));
    expect(await sendRequest({ url: "/a" }).catch((e: { message: string }) => e.message)).toBe("503 Service Unavailable");
  });

  test("a failed connection is a retryable network error (X2)", async () => {
    answers.push(new TypeError("Failed to fetch"));
    expect(await sendRequest({ url: "/a" }).catch((e: unknown) => e)).toMatchObject({ category: "network", code: "network", retryable: true, message: "Failed to fetch" });
  });

  test("invalid JSON, or an HTML page where data was expected, is a parse error (X3)", async () => {
    answers.push(new Response("{oops", { headers: { "content-type": "application/json" } }), new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }));
    expect(await sendRequest({ url: "/a" }).catch((e: unknown) => e)).toMatchObject({ category: "parse", retryable: false, body: "{oops" });
    expect(await sendRequest({ url: "/a" }).catch((e: unknown) => e)).toMatchObject({ category: "parse", message: "Expected data, got an HTML page" });
  });

  test("Retry-After: seconds or an HTTP date, in ms", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect([parseRetryAfter(null), parseRetryAfter("soon")]).toEqual([undefined, undefined]);
  });
});

describe("timeout and cancellation (S2, C5)", () => {
  test("no answer within timeoutMs: a retryable timeout error", async () => {
    vi.useFakeTimers();
    answers.push(hang);
    const pending = sendRequest({ url: "/a", timeoutMs: 500 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toMatchObject({ category: "timeout", code: "timeout", retryable: true, message: "No answer within 500 ms" });
  });

  test("the caller's signal: a RequestCancelledError with the reason, not a DataError", async () => {
    answers.push(hang);
    const controller = new AbortController();
    const pending = sendRequest({ url: "/a" }, controller.signal).catch((e: unknown) => e);
    controller.abort("user");
    const error = await pending;
    expect(error).toBeInstanceOf(RequestCancelledError);
    expect((error as RequestCancelledError).reason).toBe("user");
    const early = await sendRequest({ url: "/a" }, AbortSignal.abort("gone")).catch((e: unknown) => e);
    expect((early as RequestCancelledError).reason).toBe("gone");
  });
});

describe("the retry policy (R2–R4, R6, C2)", () => {
  const options = { retries: 2, retryDelay: 500 };

  test("which errors are retried, and how often", () => {
    const server = new AppError({ category: "server", code: "http-503" });
    const missing = new AppError({ category: "not-found" });
    expect([1, 2, 3].map((failures) => shouldRetry(failures, server, options))).toEqual([true, true, false]);
    expect(shouldRetry(1, missing, options)).toBe(false);
    expect(shouldRetry(1, new Error("bug"), options)).toBe(false);
    expect(shouldRetry(1, server, { ...options, retries: 0 })).toBe(false);
  });

  test("exponential backoff, capped; Retry-After wins, capped at 60 s; jitter ±25%", () => {
    const error = new AppError({ category: "server", code: "x" });
    expect([1, 2, 3, 10].map((retry) => retryDelay(retry, error, options))).toEqual([500, 1000, 2000, 30000]);
    expect(retryDelay(1, new AppError({ category: "server", retryAfterMs: 2000 }), options)).toBe(2000);
    expect(retryDelay(1, new AppError({ category: "server", retryAfterMs: 120_000 }), options)).toBe(60_000);
    setRetryJitter(true);
    expect([0, 1].map((r) => retryDelay(2, error, options, () => r))).toEqual([750, 1250]);
  });

  test("503, 503, 200: three attempts, waits of 500 and 1000 ms (R1, R2)", async () => {
    vi.useFakeTimers();
    answers.push(json({}, 503), json({}, 503), json({ ok: 1 }));
    let done = false;
    const pending = runWithRetry(() => sendRequest({ url: "/a" }), options).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect([calls.length, done]).toEqual([3, true]);
    expect((await pending).data).toEqual({ ok: 1 });
  });

  test("503 every time: gives up after three attempts, with attempts on the error", async () => {
    vi.useFakeTimers();
    answers.push(json({}, 503), json({}, 503), json({}, 503));
    const pending = runWithRetry(() => sendRequest({ url: "/a" }), options).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toMatchObject({ category: "server", attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  test("429 with Retry-After: 2 waits 2 s, not the backoff (R3)", async () => {
    vi.useFakeTimers();
    answers.push(json({}, 429, { "retry-after": "2" }));
    runWithRetry(() => sendRequest({ url: "/a" }), options).catch(() => {});
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
  });

  test("404: no retry (R4); retries 0: one attempt (R6)", async () => {
    answers.push(json({}, 404));
    expect(await runWithRetry(() => sendRequest({ url: "/a" }), options).catch((e: { attempts: number }) => e.attempts)).toBe(1);
    answers.push(json({}, 503));
    expect(await runWithRetry(() => sendRequest({ url: "/a" }), { ...options, retries: 0 }).catch((e: { attempts: number }) => e.attempts)).toBe(1);
    expect(calls).toHaveLength(2);
  });

  test("cancelled while waiting between attempts: no further attempt (C2)", async () => {
    vi.useFakeTimers();
    answers.push(json({}, 503));
    const controller = new AbortController();
    const pending = runWithRetry((() => sendRequest({ url: "/a" }, controller.signal)) as () => Promise<unknown>, options, controller.signal).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort("user");
    expect(await pending).toBeInstanceOf(RequestCancelledError);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
  });
});
