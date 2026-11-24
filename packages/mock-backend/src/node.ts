// The test host (Node, Vitest): MSW's request interception below `fetch`.
// The app's code is unchanged; its `fetch` calls reach the backend.
import { http, passthrough } from "msw";
import { setupServer } from "msw/node";
import type { Backend } from "./index";

/** The backend's answer; an aborted request (the client went away) has none to give, and is not an error. */
async function answer(backend: Backend, request: Request): Promise<Response> {
  try {
    return (await backend.handle(request)) ?? passthrough();
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499, statusText: "Client Closed Request" });
    throw error;
  }
}

export interface TestServer {
  close(): void;
}

/** Starts intercepting `fetch` for `backend` (call `close()` after the tests). */
export function startTestServer(backend: Backend): TestServer {
  const handlers = backend.prefixes.map((prefix) =>
    // Any origin: jsdom's page URL is http://localhost:3000.
    http.all(`*${prefix}/*`, async ({ request }) => answer(backend, request)),
  );
  const server = setupServer(...handlers);
  server.listen({ onUnhandledFrame: "bypass" });
  return { close: () => server.close() };
}
