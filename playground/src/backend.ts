// The playground's mock backend (step 20): people, for the Data scenario;
// members with server-side validation, for the Forms scenario (step 22B).
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
    members: [
      { id: 1, name: "Ada Lovelace", email: "ada@example.com", address: { city: "London" }, role: "admin", newsletter: true },
      { id: 2, name: "Alan Turing", email: "alan@example.com", address: { city: "Wilmslow" }, role: "member", newsletter: false },
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
    "GET /api/members": ({ db }) => db.members!.list(),
    "GET /api/members/:id": ({ db, params }) => db.members!.get(params.id) ?? status(404, { message: `No member ${params.id}` }),
    // Server-side validation as RFC 7807 problem details: the form puts each message on its input.
    "PUT /api/members/:id": ({ db, params, body }) => {
      const member = body as { name?: string; email?: string; address?: { city?: string } };
      const problems = [
        ...(member.email === "taken@example.com" ? [{ name: "email", reason: "Already registered" }] : []),
        ...(member.address?.city === "Atlantis" ? [{ name: "address.city", reason: "We don't deliver to Atlantis" }] : []),
        ...(member.name === "Nobody" ? [{ name: "nickname", reason: "Nobody needs a nickname" }] : []),
      ];
      if (problems.length > 0) return status(422, { title: "Invalid member", detail: "The server rejected some values", "invalid-params": problems });
      if (member.name === "Crash") return status(500, { message: "The server crashed (on purpose)" });
      return db.members!.update(params.id, member as Record<string, unknown>) ?? status(404, { message: `No member ${params.id}` });
    },
  },
});
