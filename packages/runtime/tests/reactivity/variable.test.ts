// Variables, scopes with setters, and the path helpers handlers compile to.
import { describe, expect, test, vi } from "vitest";
import { createScope } from "../../src/reactivity/scope";
import { computed, ReactivityError, signal, watch } from "../../src/reactivity/signals";
import { freezeDeep, variable } from "../../src/reactivity/variable";
import { deleteIn, mutate, setIn, updateIn } from "../../src/script/paths";

describe("variable: follows its initializer until assigned", () => {
  test("the source/mirror example (XMLUI markup.md)", () => {
    const source = variable(() => 0);
    const mirror = variable(() => source.get());
    expect(mirror.get()).toBe(0);
    source.set(1);
    expect(mirror.get()).toBe(1);
    mirror.set(999);
    expect(mirror.assigned).toBe(true);
    source.set(2);
    expect(mirror.get()).toBe(999);
  });

  test("observers are notified on both follow changes and assignment", () => {
    const source = signal(1);
    const v = variable(() => source.get() * 10);
    const seen: number[] = [];
    watch(v, () => seen.push(v.peek()));
    source.set(2);
    v.set(5);
    source.set(3);
    expect(seen).toEqual([20, 5]);
  });

  test("the initializer is lazy and tracked", () => {
    const init = vi.fn(() => 1);
    const v = variable(init);
    expect(init).not.toHaveBeenCalled();
    expect(v.get()).toBe(1);
    expect(v.get()).toBe(1);
    expect(init).toHaveBeenCalledTimes(1);
  });

  test("values are deep-frozen, whether followed or assigned", () => {
    const v = variable(() => ({ a: [1, { b: 2 }] }));
    expect(Object.isFrozen(v.get().a[1])).toBe(true);
    v.set({ a: [3, { b: 4 }] });
    expect(Object.isFrozen(v.get().a[1])).toBe(true);
    expect(() => {
      "use strict";
      (v.get().a as number[]).push(5);
    }).toThrow(TypeError);
  });
});

test("freezeDeep freezes plain objects and arrays only", () => {
  const date = new Date();
  const map = new Map();
  const value = freezeDeep({ date, map, list: [{ x: 1 }] });
  expect(Object.isFrozen(value.list[0])).toBe(true);
  expect(Object.isFrozen(date)).toBe(false);
  expect(Object.isFrozen(map)).toBe(false);
});

describe("scope objects", () => {
  test("a variable entry has a getter and a setter; a child scope shadows and writes through", () => {
    const outer = variable(() => 1);
    const inner = variable(() => "inner");
    const parent = createScope({ count: { variable: outer }, title: { value: "outer title" } });
    const child = createScope({ title: { variable: inner } }, parent) as Record<string, unknown>;
    expect(child.count).toBe(1);
    expect(child.title).toBe("inner");
    child.count = 5;
    expect(outer.get()).toBe(5);
    (child.count as number)++;
    expect(child.count).toBe(6);
    expect((parent as Record<string, unknown>).title).toBe("outer title");
  });

  test("assigning a constant entry throws (frozen scope)", () => {
    const scope = createScope({ c: { value: 1 } }) as Record<string, unknown>;
    expect(() => {
      scope.c = 2;
    }).toThrow(TypeError);
  });

  test("reads through the scope are tracked by computeds", () => {
    const v = variable(() => 2);
    const scope = createScope({ v: { variable: v } }) as Record<string, number>;
    const c = computed(() => scope.v! * 10);
    expect(c.get()).toBe(20);
    scope.v = 3;
    expect(c.get()).toBe(30);
  });
});

describe("path helpers (structural copy, then assign through the setter)", () => {
  function setup<T>(value: T) {
    const v = variable(() => value);
    const scope = createScope({ v: { variable: v } }) as Record<string, unknown>;
    return { v, scope };
  }

  test("setIn copies the path, keeps untouched branches, and returns the value", () => {
    const { v, scope } = setup({ a: { b: 1 }, keep: { k: 1 } });
    const before = v.get();
    expect(setIn(scope, "v", ["a", "b"], 2)).toBe(2);
    const after = v.get();
    expect(after).toEqual({ a: { b: 2 }, keep: { k: 1 } });
    expect(after).not.toBe(before);
    expect(after.keep).toBe(before.keep);
    expect(before.a.b).toBe(1);
    expect(Object.isFrozen(after.a)).toBe(true);
    expect(v.assigned).toBe(true);
  });

  test("setIn into arrays and new keys", () => {
    const { v, scope } = setup({ list: [1, 2] as number[], o: {} as Record<string, number> });
    setIn(scope, "v", ["list", 1], 20);
    setIn(scope, "v", ["o", "fresh"], 1);
    expect(v.get()).toEqual({ list: [1, 20], o: { fresh: 1 } });
  });

  test("deleteIn", () => {
    const { v, scope } = setup({ a: 1, b: 2 });
    expect(deleteIn(scope, "v", ["a"])).toBe(true);
    expect(v.get()).toEqual({ b: 2 });
  });

  test.each<[prefix: boolean, delta: 1 | -1, result: number, stored: number]>([
    [false, 1, 5, 6],
    [true, 1, 6, 6],
    [false, -1, 5, 4],
    [true, -1, 4, 4],
  ])("updateIn prefix=%s delta=%s returns %s", (prefix, delta, result, stored) => {
    const { v, scope } = setup({ n: 5 });
    expect(updateIn(scope, "v", ["n"], delta, prefix)).toBe(result);
    expect(v.get().n).toBe(stored);
  });

  test("mutate calls the array method on a copy and returns its result", () => {
    const { v, scope } = setup({ items: ["b", "a"] });
    const before = v.get().items;
    expect(mutate(scope, "v", ["items"], "push", ["c"])).toBe(3);
    expect(v.get().items).toEqual(["b", "a", "c"]);
    expect(before).toEqual(["b", "a"]);
    const sorted = mutate(scope, "v", ["items"], "sort", []);
    expect(sorted).toEqual(["a", "b", "c"]);
    expect(v.get().items).toBe(sorted);
  });

  test("mutate on the variable itself (empty path)", () => {
    const { v, scope } = setup([1]);
    mutate(scope, "v", [], "unshift", [0]);
    expect(v.get()).toEqual([0, 1]);
  });

  test("only plain objects and arrays can be changed through a path", () => {
    const { scope } = setup({ when: new Date(0), nothing: null });
    expect(() => setIn(scope, "v", ["when", "x"], 1)).toThrow(ReactivityError);
    expect(() => setIn(scope, "v", ["nothing", "x"], 1)).toThrow(ReactivityError);
    expect(() => mutate(scope, "v", ["when"], "push", [1])).toThrow(/not an array/);
    expect(() => mutate(scope, "v", [], "map", [])).toThrow(/not an array mutator/);
  });
});
