// APICall's core against the mock backend (step 20, catalog rows O2, C3, C4,
// R5, X7, W1–W4 at the core level; the component and markup:
// components/tests/api-call.test.tsx).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiCaller, type ApiCallEvents, type ApiCallOptions } from "../../src/data/api-call";
import { resetDataState, setDataDefaults } from "../../src/data/client";
import { Loader } from "../../src/data/loader";
import { Invocation } from "../../src/render/handlers";
import { backend, held, seen, useBackend } from "./backend";

useBackend();
beforeEach(() => setDataDefaults({ jitter: false }));
afterEach(() => resetDataState());

const put = (params: readonly unknown[]) => ({ url: `/api/users/${(params[0] as { id: number }).id}`, method: "put", body: params[0] });
const options = (patch: Partial<ApiCallOptions> = {}): ApiCallOptions => ({ retries: 0, retryDelay: 20, invalidates: "/api/users", ...patch });

function caller(events: ApiCallEvents = {}) {
  const log: unknown[][] = [];
  const recorded: ApiCallEvents = {
    beforeRequest: events.beforeRequest,
    success: (result) => {
      log.push(["success", result]);
      return events.success?.(result);
    },
    cancel: (reason) => log.push(["cancel", reason]),
    ...(events.error ? { error: (error) => (log.push(["error", error.category]), events.error!(error)) } : {}),
  };
  return { api: new ApiCaller(), events: recorded, log };
}

const usersLoader = () => {
  const loader = new Loader({ request: { url: "/api/users" }, enabled: true, retries: 0, retryDelay: 20, structuralSharing: true });
  loader.mount();
  return loader;
};

describe("a call", () => {
  test("execute(params): the request from the params, the result, success, invalidation refetches the list (W1, W5)", async () => {
    const list = usersLoader();
    await vi.waitFor(() => expect(list.state.peek().loaded).toBe(true));
    const { api, events, log } = caller();
    const pending = api.execute([{ id: 2, name: "Alan Turing" }], put, options(), events);
    expect(api.state.peek().inProgress).toBe(true);
    expect(await pending).toEqual({ id: 2, name: "Alan Turing", role: "editor" });
    expect(api.state.peek()).toMatchObject({ inProgress: false, loaded: true, lastResult: { id: 2, name: "Alan Turing" }, lastError: undefined });
    expect(log).toEqual([["success", { id: 2, name: "Alan Turing", role: "editor" }]]);
    await vi.waitFor(() => expect((list.state.peek().value as { name: string }[])[1]!.name).toBe("Alan Turing"));
    expect(seen()).toEqual(["GET /api/users", "PUT /api/users/2", "GET /api/users"]);
  });

  test("beforeRequest returning false: no request (W2)", async () => {
    const { api, events } = caller({ beforeRequest: (user) => (user as { id: number }).id !== 2 });
    expect(await api.execute([{ id: 2, name: "X" }], put, options(), events)).toBeUndefined();
    expect(seen()).toEqual([]);
  });

  test("success returning false: no invalidation (W3)", async () => {
    const list = usersLoader();
    await vi.waitFor(() => expect(list.state.peek().loaded).toBe(true));
    const { api, events } = caller({ success: () => false });
    await api.execute([{ id: 1, name: "Ada L." }], put, options(), events);
    await new Promise((r) => setTimeout(r, 30));
    expect(seen()).toEqual(["GET /api/users", "PUT /api/users/1"]);
  });

  test("no invalidates: every query is invalidated, as in XMLUI (W4)", async () => {
    const list = usersLoader();
    const one = new Loader({ request: { url: "/api/users/3" }, enabled: true, retries: 0, retryDelay: 20, structuralSharing: true });
    one.mount();
    await vi.waitFor(() => expect(list.state.peek().loaded && one.state.peek().loaded).toBe(true));
    const { api, events } = caller();
    await api.execute([{ id: 1, name: "Ada L." }], put, options({ invalidates: undefined }), events);
    await vi.waitFor(() => expect(seen().filter((s) => s.startsWith("GET"))).toHaveLength(4));
  });
});

describe("errors (R5, X7)", () => {
  test("with an error handler: execute() resolves undefined; lastError set; no retry by default", async () => {
    backend.addFault({ route: "PUT /api/users/:id", status: 503, times: 1 });
    const { api, events, log } = caller({ error: () => undefined });
    expect(await api.execute([{ id: 1, name: "A" }], put, options(), events)).toBeUndefined();
    expect(api.state.peek().lastError).toMatchObject({ category: "server", attempts: 1 });
    expect(log).toEqual([["error", "server"]]);
    expect(seen()).toEqual(["PUT /api/users/1"]);
  });

  test("retries opt in: 503 then 200 succeeds", async () => {
    backend.addFault({ route: "PUT /api/users/:id", status: 503, times: 1 });
    const { api, events } = caller();
    expect(await api.execute([{ id: 1, name: "A" }], put, options({ retries: 2 }), events)).toMatchObject({ name: "A" });
    // Two attempts; no list is loaded, so the invalidation refetches nothing.
    expect(seen()).toEqual(["PUT /api/users/1", "PUT /api/users/1"]);
  });

  test("without an error handler: execute() rejects with the error (the handler stops, the error is reported)", async () => {
    const { api, events } = caller();
    await expect(api.execute([{ id: 1, name: "" }], put, options(), events)).rejects.toMatchObject({
      category: "validation",
      status: 422,
      body: { message: "Invalid user", errors: { name: "Required" } },
    });
  });

  test("a later success clears lastError", async () => {
    const { api, events } = caller({ error: () => undefined });
    await api.execute([{ id: 1, name: "" }], put, options(), events);
    expect(api.state.peek().lastError).toBeDefined();
    await api.execute([{ id: 1, name: "Ada" }], put, options(), events);
    expect(api.state.peek().lastError).toBeUndefined();
  });
});

describe("overlapping calls and cancellation (O2, C3, C4)", () => {
  test("the call started last owns lastResult, even when the first finishes last", async () => {
    backend.addFault({ route: "PUT /api/users/:id", hold: true });
    const { api, events } = caller({ success: () => false });
    const first = api.execute([{ id: 1, name: "First" }], put, options(), events);
    const second = api.execute([{ id: 1, name: "Second" }], put, options(), events);
    const holds = await held(2);
    backend.release(holds[1]!.id);
    await second;
    backend.release(holds[0]!.id);
    await first;
    expect(api.state.peek().lastResult).toMatchObject({ name: "Second" });
    expect(api.state.peek().inProgress).toBe(false);
  });

  test("cancel(): execute() resolves undefined, cancel event, no success or error", async () => {
    backend.addFault({ route: "PUT /api/users/:id", hold: true });
    const { api, events, log } = caller({ error: () => undefined });
    const pending = api.execute([{ id: 1, name: "A" }], put, options(), events);
    await held(1);
    expect(api.cancel()).toBe(true);
    expect(await pending).toBeUndefined();
    expect(api.state.peek()).toMatchObject({ inProgress: false, cancelled: true, lastCancelReason: "user" });
    expect(log).toEqual([["cancel", "user"]]);
    await vi.waitFor(() => expect(backend.log()[0]!.outcome).toBe("aborted"));
    expect(api.cancel()).toBe(false);
  });

  test("the calling handler is superseded: its request is aborted with that reason", async () => {
    backend.addFault({ route: "PUT /api/users/:id", hold: true });
    const { api, events, log } = caller();
    const invocation = new Invocation();
    invocation.open();
    const pending = api.execute([{ id: 1, name: "A" }], put, options(), events);
    invocation.close();
    await held(1);
    invocation.abort("supersede");
    expect(await pending).toBeUndefined();
    expect(api.state.peek().lastCancelReason).toBe("supersede");
    expect(log).toEqual([["cancel", "supersede"]]);
  });

  test("dispose (unmount): running calls aborted; later calls do nothing", async () => {
    backend.addFault({ route: "PUT /api/users/:id", hold: true, times: 1 });
    const { api, events } = caller();
    const pending = api.execute([{ id: 1, name: "A" }], put, options(), events);
    await held(1);
    api.dispose();
    expect(await pending).toBeUndefined();
    expect(api.state.peek().lastCancelReason).toBe("unmount");
    expect(await api.execute([{ id: 1, name: "B" }], put, options(), events)).toBeUndefined();
    expect(seen()).toEqual(["PUT /api/users/1"]);
  });
});
