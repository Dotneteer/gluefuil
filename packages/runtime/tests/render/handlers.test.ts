// Handler runtime (step 7): segments across await, fault tolerance,
// cancellation, policies, timeouts. Handlers are compiled by the real compiler.
import { compileHandler, parseStatements } from "@patchfuil/compiler";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setErrorReporter } from "../../src/errors";
import { createScope } from "../../src/reactivity/scope";
import { computed, isBatching, watch } from "../../src/reactivity/signals";
import { variable, type Variable } from "../../src/reactivity/variable";
import { APP_GLOBAL_NAMES, createAppScope } from "../../src/render/app-globals";
import { delay, HandlerCancelledError, HandlerSlot, HandlerTimeoutError, type HandlerFunction, type HandlerPolicy } from "../../src/render/handlers";
import { loadBinding } from "../../src/script/load";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let reported: unknown[] = [];
let restore: () => void;
beforeEach(() => {
  reported = [];
  restore = setErrorReporter((error) => reported.push(error));
});
afterEach(() => {
  restore();
  expect(isBatching()).toBe(false); // no test may leave the store batching
});

/** Variables named in `vars`, plus helper functions; compiles handlers against that scope. */
function setup(vars: Record<string, unknown>, functions: Record<string, unknown> = {}) {
  const variables: Record<string, Variable<unknown>> = {};
  for (const [name, value] of Object.entries(vars)) variables[name] = variable(() => value);
  const scope = createScope({
    ...Object.fromEntries(Object.entries(variables).map(([n, v]) => [n, { variable: v }])),
    ...Object.fromEntries(Object.entries({ delay, ...functions }).map(([n, f]) => [n, { value: f }])),
  });
  const compile = (source: string): HandlerFunction => {
    const { program, diagnostics } = parseStatements(source);
    expect(diagnostics).toEqual([]);
    const result = compileHandler(program, {
      scope: new Set([...Object.keys(vars), "delay", ...Object.keys(functions)]),
      variables: new Set(Object.keys(vars)),
    });
    expect(result.diagnostics).toEqual([]);
    return loadBinding(result.code)(scope) as HandlerFunction;
  };
  const slot = (source: string, policy?: HandlerPolicy, timeout?: number) => new HandlerSlot(compile(source), policy, timeout);
  const value = (name: string) => variables[name]!.peek();
  return { variables, slot, value };
}

describe("segments: one batch per synchronous stretch", () => {
  test("a handler without async work runs synchronously, in one batch", () => {
    const { variables, slot, value } = setup({ a: 0, b: 0 });
    const sum = computed(() => (variables.a!.get() as number) + (variables.b!.get() as number));
    const seen: number[] = [];
    watch(sum, () => seen.push(sum.peek()));
    slot("a++; b++; a++").invoke([]);
    expect(seen).toEqual([3]); // delivered before invoke returned, once
    expect(value("a")).toBe(2);
  });

  test("writes before an await are delivered before waiting; the rest as one more batch", async () => {
    const { variables, slot } = setup({ loading: false, data: "", count: 0 });
    const view = computed(() => `${variables.loading!.get()}|${variables.data!.get()}|${variables.count!.get()}`);
    const seen: string[] = [];
    watch(view, () => seen.push(view.peek()));
    slot("loading = true; await delay(5); data = 'x'; loading = false; count++").invoke([]);
    expect(seen).toEqual(["true||0"]); // the loading state shows while waiting
    await wait(20);
    expect(seen).toEqual(["true||0", "false|x|1"]); // three writes, one notification
  });

  test("implicit await: a promise-returning call is waited for without `await`", async () => {
    const load = () => wait(5).then(() => ["a", "b"]);
    const { slot, value } = setup({ items: [], count: 0 }, { load });
    slot("items = load(); count = items.length").invoke([]);
    await wait(20);
    expect(value("items")).toEqual(["a", "b"]);
    expect(value("count")).toBe(2);
  });

  test("async-aware map inside a handler: sequential, and its result awaited", async () => {
    const log: string[] = [];
    const work = (x: number) => wait(3 - x).then(() => (log.push(`done ${x}`), x * 10));
    const { slot, value } = setup({ results: [] }, { work });
    slot("results = [1, 2, 3].map(x => work(x))").invoke([]);
    await wait(30);
    expect(value("results")).toEqual([10, 20, 30]);
    expect(log).toEqual(["done 1", "done 2", "done 3"]);
  });

  test("a nested function with an explicit await gets its own segments", async () => {
    const { variables, slot } = setup({ total: 0 });
    const seen: unknown[] = [];
    watch(variables.total!, () => seen.push(variables.total!.peek()));
    slot("const add = (n) => { await delay(2); total += n; total += n }; await add(1); await add(2)").invoke([]);
    await wait(20);
    expect(seen).toEqual([2, 6]); // each segment's two writes notified once
  });
});

describe("fault tolerance", () => {
  test("a promise that never settles leaves no batch open; other handlers keep working", async () => {
    const never = () => new Promise(() => {});
    const { slot, value } = setup({ status: "", count: 0 }, { never });
    const stuck = slot("status = 'waiting'; never(); status = 'never'");
    stuck.invoke([]);
    expect(isBatching()).toBe(false);
    slot("count++").invoke([]);
    expect(value("count")).toBe(1);
    expect(value("status")).toBe("waiting");
    expect(stuck.runningCount).toBe(1);
    stuck.dispose(); // unmount aborts it
  });

  test("an error after an await is reported; nothing stays open", async () => {
    const { slot, value } = setup({ step: 0 }, { fail: () => wait(2).then(() => Promise.reject(new Error("boom"))) });
    slot("step = 1; fail(); step = 2").invoke([]);
    await wait(15);
    expect(value("step")).toBe(1);
    expect(reported.map((e) => (e as Error).message)).toEqual(["boom"]);
  });

  test("a synchronous error is reported too (not thrown at the caller)", async () => {
    const { slot } = setup({}, { fail: () => { throw new Error("sync boom"); } });
    expect(() => slot("fail()").invoke([])).not.toThrow();
    await wait(0);
    expect(reported.map((e) => (e as Error).message)).toEqual(["sync boom"]);
  });

  test("an error caught by the handler itself is not reported", async () => {
    const { slot, value } = setup({ msg: "" }, { fail: () => wait(1).then(() => Promise.reject(new Error("e"))) });
    slot("try { fail() } catch (e) { msg = e.message }").invoke([]);
    await wait(10);
    expect(value("msg")).toBe("e");
    expect(reported).toEqual([]);
  });
});

describe("cancellation and policies", () => {
  test("single-flight: a new call supersedes the running one, which stops before writing", async () => {
    const { slot, value } = setup({ log: [] });
    const handler = slot("log.push('start ' + $param); await delay(10); log.push('end ' + $param)", "single-flight");
    handler.invoke([1]);
    handler.invoke([2]);
    await wait(30);
    expect(value("log")).toEqual(["start 1", "start 2", "end 2"]);
    expect(reported).toEqual([]); // cancellation is an outcome, not an error
  });

  test("queue: calls run one after another, in order", async () => {
    const { slot, value } = setup({ log: [] });
    const handler = slot("log.push('start ' + $param); await delay(5); log.push('end ' + $param)", "queue");
    handler.invoke([1]);
    handler.invoke([2]);
    handler.invoke([3]);
    await wait(50);
    expect(value("log")).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  test("drop-while-running: calls during a running one are ignored", async () => {
    const { slot, value } = setup({ log: [] });
    const handler = slot("log.push($param); await delay(5)", "drop-while-running");
    handler.invoke([1]);
    handler.invoke([2]);
    await wait(15);
    handler.invoke([3]);
    await wait(15);
    expect(value("log")).toEqual([1, 3]);
  });

  test("parallel (default): calls overlap", async () => {
    const { slot, value } = setup({ log: [] });
    const handler = slot("log.push('start ' + $param); await delay(5); log.push('end ' + $param)");
    handler.invoke([1]);
    handler.invoke([2]);
    await wait(20);
    expect(value("log")).toEqual(["start 1", "start 2", "end 1", "end 2"]);
  });

  test("timeout aborts with reason 'timeout'", async () => {
    const reasons: unknown[] = [];
    const { slot, value } = setup({ done: false }, { record: (r: unknown) => reasons.push(r) });
    slot("$cancel.onAbort(record); await delay(1000); done = true", "parallel", 10).invoke([]);
    await wait(30);
    expect(reasons).toEqual(["timeout"]);
    expect(value("done")).toBe(false);
    expect(reported).toEqual([]);
  });

  test("unmount (dispose) aborts with reason 'unmount' and drops the queue", async () => {
    const reasons: unknown[] = [];
    const { slot, value } = setup({ log: [] }, { record: (r: unknown) => reasons.push(r) });
    const handler = slot("$cancel.onAbort(record); await delay(5); log.push($param)", "queue");
    handler.invoke([1]);
    handler.invoke([2]);
    handler.dispose();
    handler.invoke([3]); // after unmount: ignored
    await wait(20);
    expect(reasons).toEqual(["unmount"]);
    expect(value("log")).toEqual([]);
  });

  test("a cancelled handler awaiting a non-cancel-aware promise stops when it resumes", async () => {
    const { slot, value } = setup({ log: [] }, { slow: () => wait(5) });
    const handler = slot("slow(); log.push($param)", "single-flight");
    handler.invoke([1]);
    handler.invoke([2]);
    await wait(20);
    expect(value("log")).toEqual([2]);
  });

  test("$cancel is visible to handler code", async () => {
    const { slot, value } = setup({ state: "" });
    slot("state = String($cancel.aborted) + ':' + $cancel.reason").invoke([]);
    expect(value("state")).toBe("false:undefined");
  });
});

describe("delay", () => {
  test("outside a handler it simply resolves", async () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      void delay(100).then(done);
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects with HandlerCancelledError when its handler is aborted", async () => {
    const errors: unknown[] = [];
    const { slot } = setup({}, { keep: (e: unknown) => errors.push(e) });
    const handler = slot("try { await delay(1000) } catch (e) { keep(e) }", "single-flight");
    handler.invoke([]);
    handler.invoke([]); // supersedes the first; the second is then disposed
    handler.dispose();
    await wait(10);
    expect(errors[0]).toBeInstanceOf(HandlerCancelledError);
    expect((errors[0] as HandlerCancelledError).reason).toBe("supersede");
  });
});

test("the app scope provides exactly the app globals", () => {
  const scope = createAppScope() as Record<string, unknown>;
  expect(Object.keys(scope).sort()).toEqual([...APP_GLOBAL_NAMES].sort());
  expect(scope.delay).toBe(delay);
});

describe("HandlerSlot.call (emitEvent, component methods): a promise of the result", () => {
  /** A handler function that returns `body(args)`; `body` may be async. */
  const raw = (body: (...args: unknown[]) => unknown): HandlerFunction => () => (...args) => body(...args);

  test("resolves with the handler's result, sync or async", async () => {
    expect(await new HandlerSlot(raw((a) => `got ${String(a)}`)).call([1])).toBe("got 1");
    expect(await new HandlerSlot(raw(async () => (await wait(1), 42))).call([])).toBe(42);
  });

  test("an error rejects the call and is not reported (the caller has it)", async () => {
    const slot = new HandlerSlot(raw(() => {
      throw new Error("boom");
    }));
    await expect(slot.call([])).rejects.toThrow("boom");
    expect(reported).toEqual([]);
  });

  test("a timeout rejects the call at once with HandlerTimeoutError, even if the handler never resumes (step 21)", async () => {
    const hanging = new HandlerSlot(raw(() => new Promise(() => {})), "parallel", 15);
    const started = Date.now();
    const error = await hanging.call([]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HandlerTimeoutError);
    expect((error as HandlerTimeoutError).timeoutMs).toBe(15);
    expect(Date.now() - started).toBeLessThan(500);
    expect(reported).toEqual([]);
    // invoke() (no caller waiting) is unchanged: the handler is cancelled, nothing reported.
    const fire = new HandlerSlot(raw(() => delay(50)), "parallel", 15);
    fire.invoke([]);
    await wait(80);
    expect(reported).toEqual([]);
  });

  test("dropped, cancelled or disposed calls resolve to undefined", async () => {
    const dropping = new HandlerSlot(raw(() => delay(20).then(() => "done")), "drop-while-running");
    const first = dropping.call([]);
    expect(await dropping.call([])).toBeUndefined();
    expect(await first).toBe("done");

    const single = new HandlerSlot(raw(() => delay(20).then(() => "done")), "single-flight");
    const superseded = single.call([]);
    const winner = single.call([]);
    expect(await superseded).toBeUndefined();
    expect(await winner).toBe("done");

    const queue = new HandlerSlot(raw(() => delay(20)), "queue");
    const running = queue.call([]);
    const queued = queue.call([]);
    queue.dispose();
    expect(await queued).toBeUndefined();
    expect(await running).toBeUndefined();
    expect(await queue.call([])).toBeUndefined();
    expect(reported).toEqual([]);
  });

  test("invoke still reports errors", async () => {
    new HandlerSlot(raw(() => {
      throw new Error("reported");
    })).invoke([]);
    expect(reported).toEqual([new Error("reported")]);
  });
});
