// Step 23: code loaded on demand (render/lazy.ts).
import { expect, test } from "vitest";
import { lazyResource, noteServerLoad } from "../../src/index";
import { takeServerLoads } from "../../src/server";

test("one load per resource; the value is there once it resolved", async () => {
  let calls = 0;
  const resource = lazyResource(async () => {
    calls++;
    return { renderer: true };
  });
  expect(resource.value).toBeUndefined();
  const first = resource.load();
  expect(resource.load()).toBe(first);
  await first;
  expect(calls).toBe(1);
  expect(resource.value).toEqual({ renderer: true });
});

test("a loaded promise follows React's thenable protocol, so use() returns it without suspending", async () => {
  const resource = lazyResource(async () => 42);
  const promise = resource.load() as Promise<number> & { status?: string; value?: unknown };
  expect(promise.status).toBeUndefined();
  await promise;
  expect(promise.status).toBe("fulfilled");
  expect(promise.value).toBe(42);
});

test("server loads are recorded once each and taken (emptied) by the prerender", async () => {
  const promise = Promise.resolve();
  noteServerLoad(promise);
  noteServerLoad(promise);
  expect(takeServerLoads()).toEqual([promise]);
  expect(takeServerLoads()).toEqual([]);
});
