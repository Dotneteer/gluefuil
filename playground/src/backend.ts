// The playground's mock backend (step 20): people, for the Data scenario.
// The app doesn't import this file; the mock backend plugin starts it in a
// service worker before the app (vite.config.ts). The network conditions
// panel steers it through /__mock, like a test would.
import { defineBackend, status } from "@patchfuil/mock-backend";

export default defineBackend({
  seed: {
    people: [
      { id: 1, name: "Ada Lovelace", field: "Mathematics" },
      { id: 2, name: "Alan Turing", field: "Computer science" },
      { id: 3, name: "Grace Hopper", field: "Computer science" },
      { id: 4, name: "Edsger Dijkstra", field: "Computer science" },
      { id: 5, name: "Emmy Noether", field: "Mathematics" },
      { id: 6, name: "Barbara Liskov", field: "Computer science" },
      { id: 7, name: "Katherine Johnson", field: "Mathematics" },
      { id: 8, name: "Donald Knuth", field: "Computer science" },
    ],
  },
  routes: {
    "GET /api/people": ({ db, query }) => {
      const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
      return db.people!.list((person) => String(person.name).toLowerCase().includes(q));
    },
    "GET /api/people/:id": ({ db, params }) => db.people!.get(params.id) ?? status(404, { message: `No person ${params.id}` }),
    "PUT /api/people/:id": ({ db, params, body }) => {
      const field = (body as { field?: unknown } | undefined)?.field;
      if (typeof field !== "string" || field.trim() === "") return status(422, { message: "The field is required", errors: { field: "Required" } });
      return db.people!.update(params.id, { field }) ?? status(404, { message: `No person ${params.id}` });
    },
  },
});
