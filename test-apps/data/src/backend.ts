// The data fixture's backend (step 20): users with search, one user, updates,
// a slowly changing status. The app doesn't import this file: the mock
// backend plugin hosts it (vite.config.ts).
import { defineBackend, status } from "@patchfuil/mock-backend";

let ticks = 0;

export default defineBackend({
  seed: {
    users: [
      { id: 1, name: "Ada Lovelace", role: "admin" },
      { id: 2, name: "Alan Turing", role: "editor" },
      { id: 3, name: "Grace Hopper", role: "editor" },
      { id: 4, name: "Edsger Dijkstra", role: "viewer" },
    ],
  },
  routes: {
    "GET /api/users": ({ db, query }) => {
      const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
      return db.users!.list((user) => String(user.name).toLowerCase().includes(q));
    },
    "GET /api/users/:id": ({ db, params }) => db.users!.get(params.id) ?? status(404, { message: `No user ${params.id}` }),
    "PUT /api/users/:id": ({ db, params, body }) => {
      const name = (body as { name?: unknown } | undefined)?.name;
      if (typeof name !== "string" || name.trim() === "") return status(422, { message: "Invalid user", errors: { name: "Required" } });
      return db.users!.update(params.id, { name }) ?? status(404, { message: `No user ${params.id}` });
    },
    "GET /api/status": () => ({ tick: ++ticks }),
  },
});
