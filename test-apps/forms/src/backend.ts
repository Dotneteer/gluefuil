// The forms fixture's backend (step 22B): people to edit, with server-side
// validation answered as RFC 7807 problem details. The app doesn't import this
// file: the mock backend plugin hosts it (vite.config.ts).
import { defineBackend, status } from "@patchfuil/mock-backend";

export default defineBackend({
  seed: {
    people: [
      { id: 1, name: "Ada", email: "ada@example.com", address: { city: "London" } },
      { id: 2, name: "Alan", email: "alan@example.com", address: { city: "Wilmslow" } },
    ],
  },
  routes: {
    "GET /api/people": ({ db }) => db.people!.list(),
    "GET /api/people/:id": ({ db, params }) => db.people!.get(params.id) ?? status(404, { message: `No person ${params.id}` }),
    "PUT /api/people/:id": ({ db, params, body }) => {
      const person = body as { email?: string; address?: { city?: string } };
      const problems = [
        ...(person.email === "taken@example.com" ? [{ name: "email", reason: "Already registered" }] : []),
        ...(person.address?.city === "Atlantis" ? [{ name: "address.city", reason: "Unknown city" }] : []),
      ];
      if (problems.length > 0) return status(422, { title: "Invalid", detail: "Please check the form", "invalid-params": problems });
      return db.people!.update(params.id, person as Record<string, unknown>) ?? status(404);
    },
  },
});
