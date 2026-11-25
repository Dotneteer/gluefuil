// The mock backend the data tests talk to through real `fetch` (MSW's
// interception in Node: @gluefuil/mock-backend/node). The tests steer it
// directly: faults, holds, the request log.
import { defineBackend, status } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import { afterAll, afterEach, beforeAll } from "vitest";

let ticks = 0;

export const backend = defineBackend({
  seed: {
    users: [
      { id: 1, name: "Ada", role: "admin" },
      { id: 2, name: "Alan", role: "editor" },
      { id: 3, name: "Grace", role: "editor" },
    ],
  },
  routes: {
    "GET /api/users": ({ db, query }) => db.users!.list((u) => String(u.name).toLowerCase().includes(String(query.q ?? "").toLowerCase())),
    "GET /api/users/:id": ({ db, params }) => db.users!.get(params.id) ?? status(404, { message: `No user ${params.id}` }),
    "PUT /api/users/:id": ({ db, params, body }) => {
      const name = (body as { name?: unknown } | undefined)?.name;
      if (typeof name !== "string" || name === "") return status(422, { message: "Invalid user", errors: { name: "Required" } });
      return db.users!.update(params.id, { name }) ?? status(404);
    },
    "GET /api/tick": () => ({ tick: ++ticks }),
    "GET /api/same": () => ({ items: [1, 2, 3] }),
  },
});

/** Starts the test server around a test file; resets the backend after each test. */
export function useBackend(): void {
  let server: ReturnType<typeof startTestServer>;
  beforeAll(() => {
    server = startTestServer(backend);
  });
  afterEach(() => {
    backend.reset();
    ticks = 0;
  });
  afterAll(() => server.close());
}

/** The URLs (path and query) the backend saw, in order. */
export const seen = () => backend.log().map((entry) => `${entry.method} ${entry.url}`);

/** Waits until `count` requests are held. */
export async function held(count: number): Promise<{ id: number; url: string }[]> {
  for (let i = 0; i < 200; i++) {
    const holds = backend.holds();
    if (holds.length >= count) return holds;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Expected ${count} held requests, have ${backend.holds().length}`);
}
