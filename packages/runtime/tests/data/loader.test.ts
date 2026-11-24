// DataSource's core against the mock backend (step 20, catalog rows L1–L4,
// L6, L7, O1, O3, C1, R1, X5, S3 at the core level; the component and markup:
// components/tests/data-source.test.tsx).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetDataState, setDataDefaults } from "../../src/data/client";
import { Loader, type LoaderOptions } from "../../src/data/loader";
import { backend, held, seen, useBackend } from "./backend";

useBackend();
beforeEach(() => setDataDefaults({ jitter: false }));
afterEach(() => {
  resetDataState();
  vi.useRealTimers();
});

const options = (patch: Partial<LoaderOptions> = {}): LoaderOptions => ({
  request: { url: "/api/users" },
  enabled: true,
  retries: 2,
  retryDelay: 20,
  structuralSharing: true,
  ...patch,
});

/** A mounted loader with its events recorded. */
function load(patch: Partial<LoaderOptions> = {}) {
  const loader = new Loader(options(patch));
  const events: unknown[][] = [];
  loader.events = {
    loaded: (data, isRefetch) => events.push(["loaded", data, isRefetch]),
    error: (error) => events.push(["error", error.category, error.attempts]),
    cancel: (reason) => events.push(["cancel", reason]),
  };
  loader.mount();
  return { loader, events, state: () => loader.state.peek() };
}

const names = (value: unknown) => (value as { name: string }[]).map((u) => u.name);

describe("loading", () => {
  test("pending first (also before mount: the server render), then the value (L1)", async () => {
    const before = new Loader(options());
    expect(before.state.peek()).toMatchObject({ inProgress: true, loaded: false, value: undefined });
    const { state, events } = load();
    expect(state().inProgress).toBe(true);
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    expect(state()).toMatchObject({ inProgress: false, error: undefined, cancelled: false });
    expect(names(state().value)).toEqual(["Ada", "Alan", "Grace"]);
    expect(state().responseHeaders?.["content-type"]).toBe("application/json");
    expect(events).toEqual([["loaded", state().value, false]]);
  });

  test("two loaders with the same request: one request (L2)", async () => {
    const a = load();
    const b = load();
    await vi.waitFor(() => expect(a.state().loaded && b.state().loaded).toBe(true));
    expect(seen()).toEqual(["GET /api/users"]);
    expect(a.state().value).toBe(b.state().value);
  });

  test("disabled, or the request not ready: no request, not in progress (L3)", async () => {
    const off = load({ enabled: false });
    const notReady = load({ request: undefined });
    expect([off.state().inProgress, notReady.state().inProgress]).toEqual([false, false]);
    off.loader.setOptions(options({ enabled: true }));
    await vi.waitFor(() => expect(off.state().loaded).toBe(true));
    expect(seen()).toEqual(["GET /api/users"]);
    expect(await notReady.loader.refetch()).toBeUndefined();
    expect(seen()).toEqual(["GET /api/users"]);
  });

  test("a changed request: the old one, unused, is aborted (L4)", async () => {
    backend.addFault({ route: "GET /api/users", hold: true, times: 1 });
    const { loader, state } = load({ request: { url: "/api/users", queryParams: { q: "a" } } });
    await held(1);
    loader.setOptions(options({ request: { url: "/api/users", queryParams: { q: "gr" } } }));
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    expect(names(state().value)).toEqual(["Grace"]);
    await vi.waitFor(() => expect(backend.log()[0]!.outcome).toBe("aborted"));
  });

  test("a refetch with equal data: the same value, no loaded event (L6)", async () => {
    const { loader, state, events } = load({ request: { url: "/api/same" } });
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    const first = state().value;
    await loader.refetch();
    expect(state().value).toBe(first);
    expect(seen()).toEqual(["GET /api/same", "GET /api/same"]);
    expect(events).toHaveLength(1);
  });

  test("a slow refetch keeps the value visible (S3)", async () => {
    const { loader, state } = load();
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    backend.addFault({ hold: true, times: 1 });
    const refetch = loader.refetch();
    await held(1);
    expect(state()).toMatchObject({ inProgress: true, isRefetching: true, loaded: true });
    expect(names(state().value)).toEqual(["Ada", "Alan", "Grace"]);
    backend.release(backend.holds()[0]!.id);
    await refetch;
    expect(state()).toMatchObject({ inProgress: false, isRefetching: false });
  });

  test("polling: one request per interval, none overlapping a slow one, none after unmount (L7)", async () => {
    const { loader, state } = load({ request: { url: "/api/tick" }, pollIntervalMs: 30 });
    await vi.waitFor(() => expect((state().value as { tick: number } | undefined)?.tick).toBeGreaterThanOrEqual(3));
    backend.addFault({ hold: true, times: 1 });
    await held(1);
    await new Promise((r) => setTimeout(r, 120));
    // Held for four intervals: still one request in flight.
    expect(backend.log().filter((e) => e.end === undefined)).toHaveLength(1);
    backend.release(backend.holds()[0]!.id);
    loader.unmount();
    const count = backend.log().length;
    await new Promise((r) => setTimeout(r, 120));
    expect(backend.log().length).toBe(count);
  });
});

describe("out of order (O1, O3)", () => {
  test("a changed request whose old answer comes last: the old answer never shows", async () => {
    backend.addFault({ route: "GET /api/users", hold: true });
    const { loader, state } = load({ request: { url: "/api/users", queryParams: { q: "a" } } });
    // Another user of 'q=a' keeps that request alive (else it is aborted, L4).
    const other = load({ request: { url: "/api/users", queryParams: { q: "a" } } });
    await held(1);
    loader.setOptions(options({ request: { url: "/api/users", queryParams: { q: "gr" } } }));
    const holds = await held(2);
    const values: unknown[] = [];
    const stop = setInterval(() => values.push(state().value), 1);
    backend.release(holds.find((h) => h.url.includes("q=gr"))!.id);
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    backend.release(holds.find((h) => h.url.endsWith("q=a"))?.id ?? -1);
    await new Promise((r) => setTimeout(r, 30));
    clearInterval(stop);
    expect(names(state().value)).toEqual(["Grace"]);
    await vi.waitFor(() => expect(other.state().loaded).toBe(true));
    expect(names(other.state().value)).toEqual(["Ada", "Alan", "Grace"]);
    expect(values.filter((v) => v !== undefined).every((v) => names(v).join() === "Grace")).toBe(true);
  });

  test("unmounted while loading: the request aborted, no event, no state change", async () => {
    backend.addFault({ hold: true, times: 1 });
    const { loader, state, events } = load();
    await held(1);
    loader.unmount();
    await vi.waitFor(() => expect(backend.log()[0]!.outcome).toBe("aborted"));
    expect(events).toEqual([]);
    expect(state().loaded).toBe(false);
  });
});

describe("cancel (C1, C5)", () => {
  test("cancel() while loading a refetch: cancelled, reason, event; the previous value kept", async () => {
    const { loader, state, events } = load();
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    const before = state().value;
    backend.addFault({ hold: true, times: 1 });
    void loader.refetch();
    await held(1);
    expect(await loader.cancel()).toBe(true);
    expect(state()).toMatchObject({ cancelled: true, lastCancelReason: "user", inProgress: false, error: undefined });
    expect(state().value).toBe(before);
    expect(events.at(-1)).toEqual(["cancel", "user"]);
    await vi.waitFor(() => expect(backend.log().at(-1)!.outcome).toBe("aborted"));
    // A new fetch clears it.
    await loader.refetch();
    expect(state().cancelled).toBe(false);
    expect(state().lastCancelReason).toBe("user");
  });

  test("cancel() on the first load: back to not loaded, nothing in progress", async () => {
    backend.addFault({ hold: true, times: 1 });
    const { loader, state } = load();
    await held(1);
    expect(await loader.cancel("stop")).toBe(true);
    expect(state()).toMatchObject({ cancelled: true, lastCancelReason: "stop", inProgress: false, loaded: false });
  });

  test("cancel() when nothing runs: false, no change", async () => {
    const { loader, state, events } = load();
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    expect(await loader.cancel()).toBe(false);
    expect(state().cancelled).toBe(false);
    expect(events.some((e) => e[0] === "cancel")).toBe(false);
  });
});

describe("errors and retries (R1, R2, X5)", () => {
  test("503 twice, then 200: three requests, the value, no error event", async () => {
    backend.addFault({ status: 503, times: 2 });
    const { state, events } = load();
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    expect(seen()).toEqual(["GET /api/users", "GET /api/users", "GET /api/users"]);
    expect(events.map((e) => e[0])).toEqual(["loaded"]);
  });

  test("503 every time: three requests, then the error with its attempts", async () => {
    backend.addFault({ status: 503 });
    const { state, events } = load();
    await vi.waitFor(() => expect(state().error).toBeDefined());
    expect(state().error).toMatchObject({ category: "server", status: 503, attempts: 3 });
    expect(state()).toMatchObject({ inProgress: false, loaded: false });
    expect(events).toEqual([["error", "server", 3]]);
    expect(seen()).toHaveLength(3);
  });

  test("404: one request, the error (no retry)", async () => {
    const { state } = load({ request: { url: "/api/users/9" } });
    await vi.waitFor(() => expect(state().error).toBeDefined());
    expect(state().error).toMatchObject({ category: "not-found", message: "No user 9", attempts: 1 });
    expect(seen()).toHaveLength(1);
  });

  test("a refetch fails: the old value stays, error set; the next success clears it", async () => {
    const { loader, state } = load({ retries: 0 });
    await vi.waitFor(() => expect(state().loaded).toBe(true));
    const value = state().value;
    backend.addFault({ network: "error", times: 1 });
    await loader.refetch();
    expect(state()).toMatchObject({ loaded: true, error: { category: "network" } });
    expect(state().value).toBe(value);
    await loader.refetch();
    expect(state().error).toBeUndefined();
  });

  test("a throwing transform is an internal error", async () => {
    const { state } = load({
      select: () => {
        throw new Error("Bad transform");
      },
    });
    await vi.waitFor(() => expect(state().error).toBeDefined());
    expect(state().error).toMatchObject({ category: "internal", message: "Bad transform" });
  });
});
