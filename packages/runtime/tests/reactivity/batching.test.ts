// Fault tolerance of the store's batching (step 7): segment batches,
// the watchdog for leaked batches, and robust notification delivery.
import { afterEach, describe, expect, test, vi } from "vitest";
import { setErrorReporter } from "../../src/errors";
import { batch, endBatch, isBatching, ReactivityError, signal, startBatch, watch } from "../../src/reactivity/signals";

let restore: (() => void) | undefined;
const reported: unknown[] = [];
function captureErrors() {
  reported.length = 0;
  restore = setErrorReporter((error) => reported.push(error));
}
afterEach(() => restore?.());

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("startBatch / endBatch", () => {
  test("notifications are delivered once, at the matching endBatch", () => {
    const s = signal(0);
    const cb = vi.fn();
    watch(s, cb);
    startBatch();
    s.set(1);
    s.set(2);
    expect(cb).not.toHaveBeenCalled();
    endBatch();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(isBatching()).toBe(false);
  });

  test("nests with batch()", () => {
    const s = signal(0);
    const cb = vi.fn();
    watch(s, cb);
    startBatch();
    batch(() => s.set(1));
    expect(cb).not.toHaveBeenCalled();
    endBatch();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("an unbalanced endBatch is ignored", () => {
    expect(() => endBatch()).not.toThrow();
    expect(isBatching()).toBe(false);
  });

  test("a balanced batch does not trigger the watchdog", async () => {
    captureErrors();
    startBatch();
    endBatch();
    await microtask();
    expect(reported).toEqual([]);
  });
});

describe("watchdog: a batch left open past its synchronous run", () => {
  test("is force-closed at the next microtask, delivers its notifications, and is reported", async () => {
    captureErrors();
    const s = signal(0);
    const cb = vi.fn();
    watch(s, cb);
    startBatch(); // leaked: never closed
    s.set(1);
    expect(cb).not.toHaveBeenCalled();
    await microtask();
    expect(isBatching()).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(ReactivityError);
    // The store works normally afterwards.
    s.set(2);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test("a later, balanced batch is not affected by an earlier watchdog", async () => {
    captureErrors();
    startBatch();
    endBatch();
    startBatch();
    endBatch();
    await microtask();
    expect(reported).toEqual([]);
  });
});

describe("notification delivery", () => {
  test("a throwing watcher does not stop the others; its error is reported", () => {
    captureErrors();
    const s = signal(0);
    const order: string[] = [];
    watch(s, () => {
      order.push("first");
      throw new Error("watcher failed");
    });
    watch(s, () => order.push("second"));
    s.set(1);
    expect(order).toEqual(["first", "second"]);
    expect(reported.map((e) => (e as Error).message)).toEqual(["watcher failed"]);
    s.set(2);
    expect(order).toEqual(["first", "second", "first", "second"]);
  });

  test("watchers that keep writing each other are stopped and reported", () => {
    captureErrors();
    const a = signal(0);
    const b = signal(0);
    watch(a, () => b.set(a.peek() + 1));
    watch(b, () => a.set(b.peek() + 1));
    a.set(1);
    expect(reported).toHaveLength(1);
    expect(String((reported[0] as Error).message)).toMatch(/100 rounds/);
    expect(isBatching()).toBe(false);
  });

  test("a batch whose function throws still delivers", () => {
    const s = signal(0);
    const cb = vi.fn();
    watch(s, cb);
    expect(() =>
      batch(() => {
        s.set(1);
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(isBatching()).toBe(false);
  });
});
