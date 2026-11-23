// The compile cache: hits, misses, invalidation, and that it never breaks loading.
import { describe, expect, test } from "vitest";
import { CompileCache, type StorageLike } from "../src/cache";
import { hashText } from "../src/hash";

/** An in-memory Storage, optionally with a size quota (in characters) or failing calls. */
class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  constructor(
    private readonly quota = Infinity,
    private readonly failing = false,
  ) {}
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    if (this.failing) throw new Error("SecurityError");
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failing) throw new Error("SecurityError");
    const size = [...this.items].filter(([k]) => k !== key).reduce((sum, [, v]) => sum + v.length, 0);
    if (size + value.length > this.quota) throw new Error("QuotaExceededError");
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const entry = (hash: string, code = "return Main;") => ({ hash, code });

test("hashText is deterministic and sensitive to every character", () => {
  expect(hashText("<App/>")).toBe(hashText("<App/>"));
  expect(hashText("<App/>")).not.toBe(hashText("<App />"));
  expect(hashText("")).toMatch(/^[0-9a-z]+$/);
});

describe("hits and misses", () => {
  test("a stored entry is a hit for the same hash", () => {
    const cache = new CompileCache(new MemoryStorage(), "b1");
    expect(cache.get("Main.pfui", "h1")).toBeUndefined();
    expect(cache.set("Main.pfui", entry("h1"))).toBe(true);
    expect(cache.get("Main.pfui", "h1")).toEqual(entry("h1"));
  });

  test("changed source (another hash) is a miss", () => {
    const cache = new CompileCache(new MemoryStorage(), "b1");
    cache.set("Main.pfui", entry("h1"));
    expect(cache.get("Main.pfui", "h2")).toBeUndefined();
  });

  test("another engine build is a miss, and its entries are removed on the next write", () => {
    const storage = new MemoryStorage();
    new CompileCache(storage, "old").set("Main.pfui", entry("h1"));
    const cache = new CompileCache(storage, "new");
    expect(cache.get("Main.pfui", "h1")).toBeUndefined();
    cache.set("Main.pfui", entry("h1"));
    expect([...storage.items.keys()]).toEqual(["pfui:new:Main.pfui"]);
  });

  test("entries of other apps' keys are left alone", () => {
    const storage = new MemoryStorage();
    storage.setItem("someone-else", "x");
    new CompileCache(storage, "b1").set("Main.pfui", entry("h1"));
    expect(storage.getItem("someone-else")).toBe("x");
  });
});

describe("never breaks loading", () => {
  test.each<[label: string, stored: string]>([
    ["invalid JSON", "{not json"],
    ["wrong shape", JSON.stringify({ hash: "h1" })],
    ["null", "null"],
  ])("a corrupted entry (%s) is a miss and can be overwritten", (_, stored) => {
    const storage = new MemoryStorage();
    storage.setItem("pfui:b1:Main.pfui", stored);
    const cache = new CompileCache(storage, "b1");
    expect(cache.get("Main.pfui", "h1")).toBeUndefined();
    expect(cache.set("Main.pfui", entry("h1"))).toBe(true);
    expect(cache.get("Main.pfui", "h1")).toEqual(entry("h1"));
  });

  test("a full quota evicts our other entries, then retries", () => {
    const storage = new MemoryStorage(60);
    const cache = new CompileCache(storage, "b1");
    expect(cache.set("A.pfui", entry("h", "x".repeat(20)))).toBe(true);
    expect(cache.set("B.pfui", entry("h", "y".repeat(20)))).toBe(true);
    expect(storage.getItem("pfui:b1:A.pfui")).toBeNull();
    expect(cache.get("B.pfui", "h")).toBeDefined();
  });

  test("an entry that can never fit is simply not cached", () => {
    const cache = new CompileCache(new MemoryStorage(10), "b1");
    expect(cache.set("Main.pfui", entry("h", "z".repeat(100)))).toBe(false);
    expect(cache.get("Main.pfui", "h")).toBeUndefined();
  });

  test("throwing storage (privacy modes) and no storage both mean no cache, without errors", () => {
    for (const storage of [new MemoryStorage(Infinity, true), undefined]) {
      const cache = new CompileCache(storage, "b1");
      expect(cache.set("Main.pfui", entry("h1"))).toBe(false);
      expect(cache.get("Main.pfui", "h1")).toBeUndefined();
    }
  });
});
