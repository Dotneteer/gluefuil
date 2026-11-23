// Signal store conformance.
import { describe, expect, test, vi } from "vitest";
import { batch, computed, observerCount, ReactivityError, signal, untracked, watch } from "../../src/reactivity/signals";

describe("signal", () => {
  test("get, peek and set", () => {
    const s = signal(1);
    expect(s.get()).toBe(1);
    s.set(2);
    expect(s.peek()).toBe(2);
  });

  test("setting an equal value notifies nobody", () => {
    const s = signal(1);
    const cb = vi.fn();
    watch(s, cb);
    s.set(1);
    expect(cb).not.toHaveBeenCalled();
    s.set(NaN);
    s.set(NaN);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("custom equality", () => {
    const s = signal({ id: 1 }, { equals: (a, b) => a.id === b.id });
    const cb = vi.fn();
    watch(s, cb);
    s.set({ id: 1 });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("computed", () => {
  test("is lazy and cached", () => {
    const s = signal(1);
    const fn = vi.fn(() => s.get() * 2);
    const c = computed(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(c.get()).toBe(2);
    expect(c.get()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(5);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.get()).toBe(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a chain of computeds", () => {
    const s = signal(1);
    const a = computed(() => s.get() + 1);
    const b = computed(() => a.get() * 10);
    expect(b.get()).toBe(20);
    s.set(2);
    expect(b.get()).toBe(30);
  });

  test("diamond: evaluated once per change, never with a mix of old and new values", () => {
    const s = signal(1);
    const left = computed(() => s.get() + 1);
    const right = computed(() => s.get() * 2);
    const seen: string[] = [];
    const bottom = computed(() => {
      const value = `${left.get()}/${right.get()}`;
      seen.push(value);
      return value;
    });
    watch(bottom, () => bottom.get());
    s.set(2);
    s.set(3);
    expect(seen).toEqual(["2/2", "3/4", "4/6"]);
  });

  test("equality cutoff: an unchanged intermediate value stops propagation", () => {
    const s = signal(1);
    const parity = computed(() => s.get() % 2);
    const fn = vi.fn(() => (parity.get() === 0 ? "even" : "odd"));
    const label = computed(fn);
    watch(label, () => label.get());
    s.set(3);
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(4);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("dynamic dependencies: a branch no longer taken is no longer a dependency", () => {
    const useA = signal(true);
    const a = signal("a");
    const b = signal("b");
    const c = computed(() => (useA.get() ? a.get() : b.get()));
    watch(c, () => c.get());
    expect(observerCount(a)).toBe(1);
    expect(observerCount(b)).toBe(0);
    useA.set(false);
    c.get();
    expect(observerCount(a)).toBe(0);
    expect(observerCount(b)).toBe(1);
  });

  test("an unobserved computed is not linked to its sources, and stays correct", () => {
    const s = signal(1);
    const c = computed(() => s.get() + 1);
    expect(c.get()).toBe(2);
    expect(observerCount(s)).toBe(0);
    s.set(10);
    expect(c.get()).toBe(11);
  });

  test("errors are cached and rethrown; the computed recovers", () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      if (s.get() === 0) throw new Error("zero");
      return 1 / s.get();
    });
    const c = computed(fn);
    expect(() => c.get()).toThrow("zero");
    expect(() => c.get()).toThrow("zero");
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(4);
    expect(c.get()).toBe(0.25);
  });

  test("writing state inside a computation throws", () => {
    const s = signal(1);
    const c = computed(() => {
      s.set(2);
      return 1;
    });
    expect(() => c.get()).toThrow(ReactivityError);
  });

  test("a cycle throws instead of looping", () => {
    const c: { self?: () => number } = {};
    const node = computed((): number => c.self!() + 1);
    c.self = () => node.get();
    expect(() => node.get()).toThrow(/Cycle/);
  });

  test("untracked reads are not dependencies", () => {
    const a = signal(1);
    const b = signal(1);
    const fn = vi.fn(() => a.get() + untracked(() => b.get()));
    const c = computed(fn);
    watch(c, () => c.get());
    b.set(5);
    expect(c.get()).toBe(2);
    a.set(2);
    expect(c.get()).toBe(7);
  });
});

describe("watch and batch", () => {
  test("a watcher is called after every change", () => {
    const s = signal(1);
    const cb = vi.fn();
    watch(s, cb);
    s.set(2);
    s.set(3);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test("a batch notifies each watcher once, after the batch", () => {
    const a = signal(1);
    const b = signal(1);
    const sum = computed(() => a.get() + b.get());
    const values: number[] = [];
    watch(sum, () => values.push(sum.get()));
    batch(() => {
      a.set(2);
      b.set(3);
      expect(values).toEqual([]);
      batch(() => a.set(4));
      expect(values).toEqual([]);
    });
    expect(values).toEqual([7]);
  });

  test("batch returns the function's value and still notifies when it throws", () => {
    const s = signal(1);
    const cb = vi.fn();
    watch(s, cb);
    expect(batch(() => 42)).toBe(42);
    expect(() =>
      batch(() => {
        s.set(2);
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("unwatching releases every link", () => {
    const s = signal(1);
    const a = computed(() => s.get() + 1);
    const b = computed(() => a.get() + 1);
    const stop = watch(b, () => {});
    expect(observerCount(s)).toBe(1);
    expect(observerCount(a)).toBe(1);
    stop();
    expect(observerCount(s)).toBe(0);
    expect(observerCount(a)).toBe(0);
  });

  test("a watcher may write; the new notifications are delivered too", () => {
    const a = signal(1);
    const b = signal(0);
    watch(a, () => b.set(a.peek() * 10));
    const seen: number[] = [];
    watch(b, () => seen.push(b.peek()));
    a.set(2);
    expect(seen).toEqual([20]);
  });

  test("watching a computed that throws does not throw", () => {
    const c = computed(() => {
      throw new Error("bad");
    });
    expect(() => watch(c, () => {})).not.toThrow();
  });

  test("re-linking after a period without observers revalidates", () => {
    const s = signal(1);
    const c = computed(() => s.get() * 2);
    const stop = watch(c, () => {});
    stop();
    s.set(5);
    const cb = vi.fn();
    watch(c, cb);
    expect(c.get()).toBe(10);
    s.set(6);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(c.get()).toBe(12);
  });
});
