// Step 35: one table per entry kind, through the real code paths (handler slots,
// variables, the HTTP gate, the router, the error pipeline, diagnostics, the
// sandbox's console), and "off means off".
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiCaller } from "../../src/data/api-call";
import { RequestCancelledError, sendRequest } from "../../src/data/http";
import { setRetryJitter } from "../../src/data/retry";
import { pushErrorSink, reportDiagnostic, reportRuntimeError, resetErrorSinks, setDiagnosticReporter, setErrorReporter } from "../../src/errors";
import { lastWrite } from "../../src/reactivity/signals";
import { variable } from "../../src/reactivity/variable";
import { HandlerCancelledError, HandlerSlot, setDefaultHandlerTimeout } from "../../src/render/handlers";
import { navigate, resetRouter, setNavigationHandlers } from "../../src/render/router";
import { scriptGlobals } from "../../src/script/sandbox";
import { enableTrace, entries, resetTrace } from "../../src/trace/core";
import type { TraceEntry } from "../../src/trace/entries";
import { locations } from "../../src/trace/location";
import { MASK } from "../../src/trace/preview";

const L = locations("src/Main.gui", ["Button", 3, 5, "PasswordInput", 4, 5, "count", 1, 6, "DataSource", 6, 3]);
const of = <K extends TraceEntry["kind"]>(kind: K) => entries().filter((e): e is Extract<TraceEntry, { kind: K }> => e.kind === kind);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

let restore: (() => void)[] = [];
beforeEach(() => {
  resetTrace();
  enableTrace();
  setRetryJitter(false);
  restore = [setErrorReporter(() => {}), setDiagnosticReporter(() => {}), setDefaultHandlerTimeout(0)];
});
afterEach(() => {
  for (const r of restore) r();
  resetErrorSinks();
  resetTrace();
  resetRouter();
  vi.unstubAllGlobals();
  setRetryJitter(true);
});

/** A slot over a handler body; `info` as Bound gives it. */
const slot = (body: (...args: unknown[]) => unknown, info = { event: "click", at: L[0] }, policy?: "single-flight" | "drop-while-running") =>
  new HandlerSlot((_x) => body, policy, undefined, {}, info);

describe("handler entries", () => {
  test("ok: the element, event, arguments, duration, a new trace", () => {
    slot(() => 1).invoke([{ x: 1 }]);
    const [h] = of("handler");
    expect(h).toMatchObject({ event: "click", at: L[0], outcome: "ok", args: [{ x: 1 }] });
    expect(h!.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(h!.parentSpanId).toBeUndefined();
    expect(h!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("error: the error's name and message (and an error entry: the pipeline reported it)", () => {
    slot(() => {
      throw new TypeError("bad");
    }).invoke([]);
    expect(of("handler")[0]).toMatchObject({ outcome: "error", error: "TypeError: bad" });
    expect(of("error")[0]).toMatchObject({ source: "handler", message: "bad", handledBy: "console", traceId: of("handler")[0]!.traceId });
  });

  test("cancelled: superseded by a newer call (single-flight)", async () => {
    let release!: () => void;
    const s = new HandlerSlot(
      (x) => async () => {
        await new Promise<void>((r) => (release = r));
        x.open();
        x.close();
      },
      "single-flight",
      undefined,
      {},
      { event: "click" },
    );
    s.invoke([]);
    const first = release;
    s.invoke([]);
    first();
    release();
    await settle();
    expect(of("handler").map((h) => [h.outcome, h.reason])).toEqual([
      ["cancelled", "supersede"],
      ["ok", undefined],
    ]);
  });

  test("dropped: a call while one runs (drop-while-running)", async () => {
    let release!: () => void;
    const s = slot(() => new Promise<void>((r) => (release = r)), { event: "click", at: L[0] }, "drop-while-running");
    s.invoke([]);
    s.invoke([]);
    release();
    await settle();
    expect(of("handler").map((h) => h.outcome)).toEqual(["dropped", "ok"]);
  });

  test("a handler called inside another is a span of its trace", () => {
    const inner = slot(() => 2, { event: "method go", at: L[0] });
    slot(() => inner.invoke([])).invoke([]);
    const [child, parent] = of("handler");
    expect(child!.event).toBe("method go");
    expect(child!.traceId).toBe(parent!.traceId);
    expect(child!.parentSpanId).toBe(parent!.spanId);
  });

  test("concurrent async handlers keep their own traces across await (no shared stack)", async () => {
    const count = variable(() => 0, { name: "count", at: L[2] });
    const gates: (() => void)[] = [];
    const s = new HandlerSlot(
      (x) => async () => {
        await new Promise<void>((r) => gates.push(r));
        x.open();
        count.set(count.peek() + 1);
        x.close();
      },
      "parallel",
      undefined,
      {},
      { event: "click" },
    );
    s.invoke([]);
    s.invoke([]);
    gates[1]!();
    await settle();
    gates[0]!();
    await settle();
    const handlers = of("handler");
    const states = of("state");
    expect(handlers).toHaveLength(2);
    expect(new Set(handlers.map((h) => h.traceId)).size).toBe(2);
    // Each write is in the trace of the call that made it (the second call's write came first).
    for (const state of states) expect(handlers.map((h) => h.spanId)).toContain(state.spanId);
    expect(states[0]!.spanId).toBe(handlers[0]!.spanId);
  });

  test("a sensitive element (a password input): arguments and writes masked", () => {
    const password = variable(() => "", { name: "password", at: L[2] });
    slot((value) => password.set(value as string), { event: "didChange", at: L[1], sensitive: true } as never).invoke(["hunter2"]);
    expect(of("handler")[0]!.args).toEqual([MASK]);
    expect(of("state")[0]).toMatchObject({ before: MASK, after: MASK });
    expect(JSON.stringify(entries())).not.toContain("hunter2");
  });

  test("the element's onError handles it: an error entry handled by onError, in the call's trace", () => {
    const s = new HandlerSlot(
      () => () => {
        throw new Error("nope");
      },
      "parallel",
      undefined,
      { onError: () => {} },
      { event: "click" },
    );
    s.invoke([]);
    expect(of("error")[0]).toMatchObject({ source: "action", handledBy: "onError", traceId: of("handler")[0]!.traceId });
    expect(HandlerCancelledError).toBeDefined();
  });
});

describe("state entries", () => {
  test("a write: the variable, its position, previews of before and after, the writer's trace", () => {
    const count = variable(() => 1, { name: "count", at: L[2] });
    slot(() => count.set(2)).invoke([]);
    const [state] = of("state");
    expect(state).toMatchObject({ variable: "count", at: L[2], before: 1, after: 2, spanId: of("handler")[0]!.spanId });
    expect(lastWrite(count as never)).toBeUndefined(); // the mark is on the variable's own signal
  });

  test("a write outside a handler starts its own trace", () => {
    variable(() => 1, { name: "n" }).set(2);
    expect(of("state")[0]!.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("fetch entries", () => {
  const stub = (answer: Response | Error | ((init: RequestInit) => Promise<Response>)) =>
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => (answer instanceof Error ? Promise.reject(answer) : typeof answer === "function" ? answer(init) : Promise.resolve(answer)));

  test.each<[label: string, answer: () => Response | Error | ((init: RequestInit) => Promise<Response>), expected: object, timeoutMs?: number]>([
    ["ok", () => json([1]), { status: 200, outcome: "ok" }],
    ["an HTTP error, with the server's correlation id", () => json({}, 500, { "x-correlation-id": "c-42" }), { status: 500, outcome: "http", correlationId: "c-42" }],
    ["a network failure", () => new TypeError("Failed to fetch"), { outcome: "network" }],
    ["a parse error", () => new Response("{oops", { headers: { "content-type": "application/json" } }), { outcome: "parse" }],
    [
      "a timeout",
      () => (init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
      { outcome: "timeout" },
      20,
    ],
  ])("%s: a start and an end entry, one span", async (_, answer, expected, timeoutMs) => {
    stub(answer());
    await sendRequest({ url: "/api/x", ...(timeoutMs ? { timeoutMs } : {}) }, undefined, { component: "DataSource", id: "users", at: L[3], attempt: 1 }).catch(() => {});
    const [start, end] = of("fetch");
    expect(start).toMatchObject({ phase: "start", method: "GET", owner: { component: "DataSource", id: "users" }, at: L[3], attempt: 1 });
    expect(start!.url).toMatch(/\/api\/x$/);
    expect(end).toMatchObject({ phase: "end", ...expected });
    expect(end!.spanId).toBe(start!.spanId);
    expect(end!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("cancelled by the caller", async () => {
    stub((init) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const controller = new AbortController();
    const pending = sendRequest({ url: "/api/x" }, controller.signal);
    controller.abort("user");
    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
    expect(of("fetch")[1]).toMatchObject({ outcome: "cancelled" });
  });

  test("an APICall in a handler: a span of the handler's trace; its retries share it", async () => {
    let n = 0;
    vi.stubGlobal("fetch", () => Promise.resolve(++n === 1 ? json({}, 503) : json({ ok: true })));
    const caller = new ApiCaller();
    await new Promise<void>((resolve) => {
      slot(() => caller.execute([], () => ({ url: "/api/save", method: "put" }), { retries: 1, retryDelay: 1, trace: { component: "APICall", id: "save" } }, {}).then(() => resolve())).invoke([]);
    });
    await settle(); // the handler's entry: when its promise settles
    const handler = of("handler")[0]!;
    const fetches = of("fetch");
    expect(fetches.map((f) => [f.phase, f.attempt, f.outcome])).toEqual([
      ["start", 1, undefined],
      ["end", 1, "http"],
      ["start", 2, undefined],
      ["end", 2, "ok"],
    ]);
    expect(new Set(fetches.map((f) => f.spanId)).size).toBe(1);
    expect(fetches[0]!.traceId).toBe(handler.traceId);
    expect(fetches[0]!.parentSpanId).toBe(handler.spanId);
    expect(fetches[0]!.owner).toEqual({ component: "APICall", id: "save" });
  });
});

describe("navigate entries", () => {
  test("done, in the calling handler's trace; the guard's refusal: cancelled", async () => {
    slot(() => navigate("/orders")).invoke([]);
    await settle();
    setNavigationHandlers({ willNavigate: () => false });
    await navigate("/admin");
    const [done, cancelled] = of("navigate");
    expect(done).toMatchObject({ to: "/orders", outcome: "done", traceId: of("handler")[0]!.traceId, at: L[0] });
    expect(cancelled).toMatchObject({ from: "/orders", to: "/admin", outcome: "cancelled" });
  });
});

describe("error and diagnostic entries", () => {
  test("an error the App's sink handles; one with no App goes to the console", () => {
    reportRuntimeError(new Error("alone"), "render");
    const remove = pushErrorSink(() => {});
    reportRuntimeError(new Error("with an app"), "loader");
    remove();
    expect(of("error").map((e) => [e.message, e.source, e.handledBy])).toEqual([
      ["alone", "render", "console"],
      ["with an app", "loader", "app"],
    ]);
  });

  test("a diagnostic: its category and the element's position", () => {
    reportDiagnostic("Table: the 'id' values must be unique", { category: "component", at: L[3] });
    reportDiagnostic("plain");
    expect(of("diagnostic")).toMatchObject([
      { message: "Table: the 'id' values must be unique", category: "component", at: L[3] },
      { message: "plain", category: "general" },
    ]);
  });
});

describe("log entries", () => {
  test("console.* from script: the level, previews, the handler's trace and element", () => {
    // (The sandbox copied the host console when it loaded: the call still goes to it.)
    const scriptConsole = scriptGlobals.console as { debug(...args: unknown[]): void };
    slot(() => scriptConsole.debug("low stock", { sku: "A1" })).invoke([]);
    expect(of("log")[0]).toMatchObject({ level: "debug", args: ["low stock", { sku: "A1" }], at: L[0], traceId: of("handler")[0]!.traceId });
  });
});

describe("off means off", () => {
  test("with tracing off, nothing is recorded and no write is marked", async () => {
    resetTrace();
    vi.stubGlobal("fetch", () => Promise.resolve(json([])));
    const count = variable(() => 0, { name: "count" });
    slot(() => {
      count.set(1);
      (scriptGlobals.console as { debug(...a: unknown[]): void }).debug("x");
    }).invoke([]);
    await sendRequest({ url: "/api/x" });
    await navigate("/somewhere");
    reportDiagnostic("d");
    reportRuntimeError(new Error("e"));
    expect(entries()).toEqual([]);
  });
});
