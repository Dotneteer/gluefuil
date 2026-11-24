// The mock backend (step 20, catalog row M1): a Request in, a Response out.
// Routes and collections, faults, holds, the request log, the control
// endpoints. Hosts: hosts.test.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { created, defineBackend, noContent, status, type Backend } from "../src/index";

const ORIGIN = "http://localhost";

function testBackend(): Backend {
  return defineBackend({
    seed: {
      users: [
        { id: 1, name: "Ada", role: "admin" },
        { id: 2, name: "Alan", role: "editor" },
      ],
    },
    routes: {
      "GET /api/users": ({ db, query }) => db.users!.list((u) => !query.q || String(u.name).toLowerCase().includes(String(query.q))),
      "GET /api/users/:id": ({ db, params }) => db.users!.get(params.id) ?? status(404, { message: "No such user" }),
      "POST /api/users": ({ db, body }) =>
        (body as { name?: string })?.name ? created(db.users!.insert(body as never)) : status(422, { errors: { name: "Required" } }),
      "PUT /api/users/:id": ({ db, params, body }) => db.users!.update(params.id, body as never) ?? status(404),
      "DELETE /api/users/:id": ({ db, params }) => (db.users!.remove(params.id) ? noContent() : status(404)),
      "GET /api/echo": ({ query, request }) => ({ query, header: request.headers.get("x-test") }),
      "GET /api/boom": () => {
        throw new Error("Boom");
      },
      "GET /api/text": () => new Response("plain", { headers: { "content-type": "text/plain" } }),
    },
  });
}

let backend: Backend;
beforeEach(() => {
  backend = testBackend();
});
afterEach(() => {
  vi.useRealTimers();
});

const request = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);
const send = (path: string, init?: RequestInit) => backend.handle(request(path, init)).then((r) => r!);
const body = async (response: Response) => (response.status === 204 ? undefined : response.json());
const post = (path: string, data: unknown) => send(path, { method: "POST", body: JSON.stringify(data), headers: { "content-type": "application/json" } });

describe("routes and collections", () => {
  test("list, get, insert, update, remove", async () => {
    expect(await body(await send("/api/users"))).toEqual([
      { id: 1, name: "Ada", role: "admin" },
      { id: 2, name: "Alan", role: "editor" },
    ]);
    expect(await body(await send("/api/users/2"))).toEqual({ id: 2, name: "Alan", role: "editor" });
    const insert = await post("/api/users", { name: "Grace" });
    expect([insert.status, await body(insert)]).toEqual([201, { id: 3, name: "Grace" }]);
    const update = await send("/api/users/3", { method: "PUT", body: JSON.stringify({ role: "admin", id: 99 }), headers: { "content-type": "application/json" } });
    expect(await body(update)).toEqual({ id: 3, name: "Grace", role: "admin" });
    expect((await send("/api/users/3", { method: "DELETE" })).status).toBe(204);
    expect((await send("/api/users/3", { method: "DELETE" })).status).toBe(404);
    expect((await body(await send("/api/users"))).map((u: { id: number }) => u.id)).toEqual([1, 2]);
  });

  test("statuses and bodies from helpers; validation", async () => {
    const missing = await send("/api/users/9");
    expect([missing.status, await body(missing)]).toEqual([404, { message: "No such user" }]);
    const invalid = await post("/api/users", {});
    expect([invalid.status, await body(invalid)]).toEqual([422, { errors: { name: "Required" } }]);
  });

  test("query parameters (a repeated key is an array) and headers reach the route", async () => {
    const response = await send("/api/echo?a=1&b=2&b=3", { headers: { "x-test": "yes" } });
    expect(await body(response)).toEqual({ query: { a: "1", b: ["2", "3"] }, header: "yes" });
    expect(await body(await send("/api/users?q=ad"))).toEqual([{ id: 1, name: "Ada", role: "admin" }]);
  });

  test("a route that throws is a 500; an unknown path under a prefix is a 404; other paths are not the backend's", async () => {
    const boom = await send("/api/boom");
    expect([boom.status, await body(boom)]).toEqual([500, { message: "Boom" }]);
    const unknown = await send("/api/nothing");
    expect(unknown.status).toBe(404);
    expect(await backend.handle(request("/index.html"))).toBeUndefined();
    expect(backend.prefixes).toEqual(["/api", "/__mock"]);
  });

  test("a route may return its own Response", async () => {
    const response = await send("/api/text");
    expect([response.headers.get("content-type"), await response.text()]).toEqual(["text/plain", "plain"]);
  });

  test("the UI can't hold a reference into the backend: values are copied in and out", async () => {
    const list = await body(await send("/api/users"));
    list[0].name = "Changed";
    expect((await body(await send("/api/users/1"))).name).toBe("Ada");
  });
});

describe("faults", () => {
  test("a status with headers and a body, `times` times", async () => {
    backend.addFault({ route: "GET /api/users", times: 2, status: 503, headers: { "Retry-After": "2" }, body: { message: "Busy" } });
    for (let i = 0; i < 2; i++) {
      const response = await send("/api/users");
      expect([response.status, response.headers.get("retry-after"), await body(response)]).toEqual([503, "2", { message: "Busy" }]);
    }
    expect((await send("/api/users")).status).toBe(200);
  });

  test("a route pattern matches only its method and path; no route means every route", async () => {
    backend.addFault({ route: "GET /api/users/:id", status: 500 });
    expect((await send("/api/users")).status).toBe(200);
    expect((await send("/api/users/1")).status).toBe(500);
    expect((await send("/api/users/1", { method: "DELETE" })).status).toBe(204);
    backend.clearFaults();
    backend.addFault({ status: 418 });
    expect((await send("/api/users")).status).toBe(418);
  });

  test("a network error is Response.error() (fetch rejects in every host)", async () => {
    backend.addFault({ network: "error", times: 1 });
    const response = await send("/api/users");
    expect(response.type).toBe("error");
    expect(backend.log()[0]!.outcome).toBe("network-error");
  });

  test("a broken body: HTML where JSON was expected", async () => {
    backend.addFault({ status: 502, contentType: "text/html", body: "<html>Bad gateway</html>" });
    const response = await send("/api/users");
    expect([response.status, response.headers.get("content-type"), await response.text()]).toEqual([502, "text/html", "<html>Bad gateway</html>"]);
  });

  test("latency delays the answer; a range is seeded", async () => {
    vi.useFakeTimers();
    backend.addFault({ latency: 1500, times: 1 });
    let done = false;
    const pending = send("/api/users").then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
  });

  test("a hang never answers; aborting the request ends it", async () => {
    backend.addFault({ network: "hang" });
    const controller = new AbortController();
    const pending = backend.handle(request("/api/users", { signal: controller.signal }));
    await new Promise((r) => setTimeout(r, 10));
    expect(backend.log()[0]!.outcome).toBe("hang");
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(backend.log()[0]!.outcome).toBe("aborted");
  });

  test("probability is seeded: the same sequence on every run, and after a reset", async () => {
    const sequence = async () => {
      backend.reset();
      backend.addFault({ probability: 0.5, status: 500 });
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await send("/api/users")).status);
      return statuses;
    };
    const first = await sequence();
    expect(first).toContain(500);
    expect(first).toContain(200);
    expect(await sequence()).toEqual(first);
  });
});

describe("holds: the test decides the order", () => {
  test("held requests wait; released in any order, optionally with a fault", async () => {
    backend.addFault({ route: "GET /api/users", hold: true });
    const a = send("/api/users?q=a");
    const b = send("/api/users?q=al");
    await new Promise((r) => setTimeout(r, 10));
    expect(backend.holds()).toEqual([
      { id: 1, method: "GET", url: "/api/users?q=a" },
      { id: 2, method: "GET", url: "/api/users?q=al" },
    ]);
    const order: string[] = [];
    void a.then(() => order.push("a"));
    void b.then(() => order.push("b"));
    backend.release(2);
    expect(await body(await b)).toEqual([{ id: 2, name: "Alan", role: "editor" }]);
    backend.release(1, { status: 500 });
    expect((await a).status).toBe(500);
    expect(order).toEqual(["b", "a"]);
    expect(backend.release(1)).toBe(false);
  });
});

describe("the control endpoints", () => {
  const control = (path: string, method = "GET", data?: unknown) =>
    send(`/__mock${path}`, { method, body: data === undefined ? undefined : JSON.stringify(data), headers: { "content-type": "application/json" } });

  test("faults, the log, latency and reset over HTTP; control requests are not logged", async () => {
    const added = await control("/faults", "POST", { route: "GET /api/users", status: 503, times: 1 });
    expect([added.status, await body(added)]).toEqual([201, { id: 1 }]);
    expect(await body(await control("/faults"))).toEqual([{ id: 1, route: "GET /api/users", status: 503, times: 1 }]);
    expect((await send("/api/users")).status).toBe(503);
    expect((await send("/api/users")).status).toBe(200);
    const log = await body(await control("/requests"));
    expect(log.map((e: { url: string; outcome: string; status: number; fault?: number }) => [e.url, e.outcome, e.status, e.fault])).toEqual([
      ["/api/users", "fault", 503, 1],
      ["/api/users", "ok", 200, undefined],
    ]);
    await post("/api/users", { name: "Grace" });
    expect((await control("/reset", "POST")).status).toBe(200);
    expect(await body(await control("/requests"))).toEqual([]);
    expect((await body(await send("/api/users"))).length).toBe(2);
  });

  test("holds over HTTP", async () => {
    await control("/faults", "POST", { hold: true });
    const pending = send("/api/users/1");
    await new Promise((r) => setTimeout(r, 10));
    expect(await body(await control("/holds"))).toEqual([{ id: 1, method: "GET", url: "/api/users/1" }]);
    await control("/holds/1/release", "POST", { status: 409, body: { message: "Changed" } });
    expect((await pending).status).toBe(409);
    expect((await control("/holds/1/release", "POST")).status).toBe(404);
  });

  test("latency for every request", async () => {
    vi.useFakeTimers();
    await control("/latency", "PUT", { latency: 300 });
    let done = false;
    const pending = send("/api/users").then(() => (done = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });
});
