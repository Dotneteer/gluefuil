// The dev-server host (Node): Connect middleware that answers the backend's
// prefixes over real HTTP. No service worker, nothing in the page.
// No MSW here: Node's own Request and Response.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Backend } from "./index";

export type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

/** Middleware for `backend` (`backend` may be a promise: loaded on first use). */
export function backendMiddleware(backend: Backend | Promise<Backend>): Middleware {
  return (incoming, outgoing, next) => {
    void (async () => {
      const resolved = await backend;
      const host = incoming.headers.host ?? "localhost";
      const url = new URL(incoming.url ?? "/", `http://${host}`);
      if (!resolved.prefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return next();
      // The client going away aborts the request (a hang or a hold ends).
      const controller = new AbortController();
      outgoing.on("close", () => {
        if (!outgoing.writableFinished) controller.abort(new DOMException("The client went away", "AbortError"));
      });
      const method = incoming.method ?? "GET";
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(chunk as Buffer);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) for (const v of value) headers.append(name, v);
      }
      const request = new Request(url, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" || chunks.length === 0 ? undefined : Buffer.concat(chunks),
        signal: controller.signal,
      });
      let response: Response | undefined;
      try {
        response = await resolved.handle(request);
      } catch {
        // Aborted by the client: nothing to answer.
        return;
      }
      if (!response) return next();
      if (response.type === "error") {
        // A network error: drop the connection.
        incoming.socket.destroy();
        return;
      }
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    })();
  };
}
