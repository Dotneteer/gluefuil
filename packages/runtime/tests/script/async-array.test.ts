// $$r.arr: async-aware array methods (XMLUI expression-eval.md §5).
import { describe, expect, test } from "vitest";
import { arrayCall } from "../../src/script/async-array";

const later = <T,>(value: T, ms = 0) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("synchronous callbacks: native semantics, native results", () => {
  test.each<[name: string, callback: (x: number) => unknown, expected: unknown]>([
    ["map", (x) => x * 2, [2, 4, 6]],
    ["filter", (x) => x > 1, [2, 3]],
    ["every", (x) => x > 0, true],
    ["some", (x) => x > 2, true],
    ["find", (x) => x > 1, 2],
    ["findIndex", (x) => x > 1, 1],
    ["flatMap", (x) => [x, x], [1, 1, 2, 2, 3, 3]],
    ["forEach", () => 0, undefined],
  ])("%s", (name, callback, expected) => {
    expect(arrayCall([1, 2, 3], name, [callback])).toEqual(expected);
  });

  test("early exit is preserved (find stops at the first match)", () => {
    const visited: number[] = [];
    arrayCall([1, 2, 3, 4], "find", [(x: number) => (visited.push(x), x === 2)]);
    expect(visited).toEqual([1, 2]);
  });

  test("not an array: an ordinary call; null: undefined", () => {
    const fake = { map: (cb: (x: number) => number) => cb(10) };
    expect(arrayCall(fake, "map", [(x: number) => x + 1])).toBe(11);
    expect(arrayCall(null, "map", [() => 1])).toBeUndefined();
    expect(arrayCall({}, "map", [() => 1])).toBeUndefined();
    expect(arrayCall([3, 1, 2], "sort", [])).toEqual([1, 2, 3]);
  });
});

describe("promise-returning callbacks", () => {
  test("map awaits sequentially: each callback starts after the previous one settled", async () => {
    const log: string[] = [];
    const result = arrayCall([1, 2, 3], "map", [
      async (x: number) => {
        log.push(`start ${x}`);
        await later(null, 5 - x);
        log.push(`end ${x}`);
        return x * 10;
      },
    ]);
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual([10, 20, 30]);
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  test("filter calls all callbacks first (parallel), then applies the results", async () => {
    const log: string[] = [];
    const result = arrayCall([1, 2, 3, 4], "filter", [
      async (x: number) => {
        log.push(`start ${x}`);
        await later(null, 5 - x);
        log.push(`end ${x}`);
        return x % 2 === 0;
      },
    ]);
    expect(await result).toEqual([2, 4]);
    expect(log.slice(0, 4)).toEqual(["start 1", "start 2", "start 3", "start 4"]);
  });

  test.each<[name: string, expected: unknown]>([
    ["every", false],
    ["some", true],
    ["find", 3],
    ["findIndex", 2],
    ["flatMap", [1, 1, 2, 2, 3, 3, 4, 4]],
  ])("%s with async callbacks", async (name, expected) => {
    const callback =
      name === "flatMap" ? (x: number) => later([x, x]) : name === "every" ? (x: number) => later(x < 3) : (x: number) => later(x === 3);
    expect(await arrayCall([1, 2, 3, 4], name, [callback])).toEqual(expected);
  });

  test("switches to async at the first thenable, keeping earlier synchronous results", async () => {
    const result = arrayCall([1, 2, 3], "map", [(x: number) => (x < 2 ? x : later(x * 100))]);
    expect(await result).toEqual([1, 200, 300]);
  });

  test("a rejected callback rejects the call", async () => {
    await expect(arrayCall([1, 2], "map", [async (x: number) => { if (x === 2) throw new Error("bad"); return x; }])).rejects.toThrow("bad");
  });
});
