// The service-worker host (browser): MSW's worker answers the backend's
// prefixes; every other request goes to the network. The page's `fetch`
// is untouched: requests leave it as usual and the service worker answers
// them (DevTools and Playwright see them as requests). Started once per page,
// never stopped (XMLUI's per-test start/stop raced: interception/apiInterceptorWorker.ts).
import { http, passthrough } from "msw";
import { setupWorker } from "msw/browser";
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

export interface WorkerOptions {
  /** The URL of MSW's worker script. Default "/mockServiceWorker.js". */
  url?: string;
}

/** Starts the service worker for `backend`; resolves when requests are intercepted. */
export async function startWorker(backend: Backend, options: WorkerOptions = {}): Promise<void> {
  const handlers = backend.prefixes.map((prefix) =>
    http.all(`${prefix}/*`, async ({ request }) => answer(backend, request)),
  );
  const worker = setupWorker(...handlers);
  await worker.start({ serviceWorker: { url: options.url ?? "/mockServiceWorker.js" }, quiet: true, onUnhandledFrame: "bypass" });
}
