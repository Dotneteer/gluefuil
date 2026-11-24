// The Node hosts (step 20): the same backend behind real `fetch` calls.
// The test server (MSW interception, Vitest) and the dev-server middleware
// (real HTTP over a socket). The service-worker host is tested in a browser
// (e2e/data-*.spec.ts).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { defineBackend } from "../src/index";
import { backendMiddleware } from "../src/middleware";
import { startTestServer } from "../src/node";

const backend = () =>
  defineBackend({
    seed: { users: [{ id: 1, name: "Ada" }] },
    routes: {
      "GET /api/users": ({ db }) => db.users!.list(),
      "POST /api/users": ({ db, body }) => db.users!.insert(body as never),
    },
  });

/** The same checks for every host: data, a write, a status fault, a network error, a hang ended by an abort. */
async function behaves(base: string, control: ReturnType<typeof backend>) {
  expect(await (await fetch(`${base}/api/users`)).json()).toEqual([{ id: 1, name: "Ada" }]);
  const posted = await fetch(`${base}/api/users`, { method: "POST", body: JSON.stringify({ name: "Grace" }), headers: { "content-type": "application/json" } });
  expect(await posted.json()).toEqual({ id: 2, name: "Grace" });
  control.addFault({ status: 503, times: 1 });
  expect((await fetch(`${base}/api/users`)).status).toBe(503);
  control.addFault({ network: "error", times: 1 });
  await expect(fetch(`${base}/api/users`)).rejects.toThrow(TypeError);
  control.addFault({ network: "hang", times: 1 });
  const controller = new AbortController();
  const hanging = fetch(`${base}/api/users`, { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await expect(hanging).rejects.toThrow(/abort/i);
  // Not the backend's: untouched (the test server lets it through).
  expect((await fetch(`${base}/api/users`)).status).toBe(200);
}

describe("the test server (MSW interception below fetch)", () => {
  const control = backend();
  let server: ReturnType<typeof startTestServer>;
  beforeAll(() => {
    server = startTestServer(control);
  });
  afterAll(() => server.close());

  test("fetch reaches the backend at any origin", async () => {
    await behaves("http://localhost:3000", control);
  });
});

describe("the dev-server middleware (real HTTP)", () => {
  const control = backend();
  let http: Server;
  let base = "";
  beforeAll(async () => {
    const middleware = backendMiddleware(control);
    http = createServer((request, response) =>
      middleware(request, response, () => {
        response.statusCode = 404;
        response.end("not the backend");
      }),
    );
    await new Promise<void>((resolve) => http.listen(0, resolve));
    const address = http.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())));

  test("fetch reaches the backend over a socket", async () => {
    await behaves(base, control);
    // The client going away ended the hang on the server, too.
    await new Promise((r) => setTimeout(r, 50));
    expect(control.log().find((e) => e.outcome === "aborted")).toBeDefined();
  });

  test("other paths go to the next middleware", async () => {
    const response = await fetch(`${base}/index.html`);
    expect([response.status, await response.text()]).toEqual([404, "not the backend"]);
  });
});
