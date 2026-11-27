// The playground's mock backend (step 20): people, for the Data scenario;
// members with server-side validation, for the Forms scenario (step 22B).
// The app doesn't import this file; the mock backend plugin starts it in a
// service worker before the app (vite.config.ts). The network conditions
// panel steers it through /__mock, like a test would.
import { defineBackend, file, status } from "@gluefuil/mock-backend";

/** Step 32B: what the backend received, with files as { name, size, type }. */
function received(value: unknown): unknown {
  if (value instanceof Blob) return { name: (value as File).name ?? "", size: value.size, type: value.type };
  if (Array.isArray(value)) return value.map(received);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, received(v)]));
  return value;
}

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
    // The Toasts and confirm scenario (step 27): APICall adds a person.
    "POST /api/people": ({ db, body }) => {
      const name = (body as { name?: unknown } | undefined)?.name;
      if (typeof name !== "string" || name.trim() === "") return status(422, { message: "A name is required", errors: { name: "Required" } });
      return db.people!.insert({ name, field: "Unknown" });
    },
    "GET /api/people/:id": ({ db, params }) => db.people!.get(params.id) ?? status(404, { message: `No person ${params.id}` }),
    "PUT /api/people/:id": ({ db, params, body }) => {
      const field = (body as { field?: unknown } | undefined)?.field;
      if (typeof field !== "string" || field.trim() === "") return status(422, { message: "The field is required", errors: { field: "Required" } });
      return db.people!.update(params.id, { field }) ?? status(404, { message: `No person ${params.id}` });
    },
    // Markdown for the Display scenario (step 23): Markdown data="/api/docs/markdown".
    "GET /api/docs/markdown": () =>
      "### Loaded from the server\n\nThis text came from `GET /api/docs/markdown` through the data layer (`data` is a URL).",
    // Step 32B: uploads (multipart or the file itself) answer with what arrived; a download.
    "POST /api/tickets": ({ body, request }) => ({ contentType: (request.headers.get("content-type") ?? "").split(";")[0], received: received(body) }),
    "POST /api/receipts": async ({ body }) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { received: received(body) };
    },
    "GET /api/files/people.csv": ({ db }) =>
      file(["name,field\n", ...db.people!.list().map((p) => `${p.name},${p.field}\n`)], { type: "text/csv", name: "people.csv" }),
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
