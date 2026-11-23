// A minimal static file server for the standalone E2E tests (no dependencies).
//
//   node tools/static-server.mjs --port 5175 --site <fixture dir> --work <temp dir> --bundle <dir with pfui.js>
//
// On start it copies the fixture site into the work directory (so tests can edit
// files without touching the repository) and serves it, plus pfui.js and its map
// from the bundle directory. Responses are not cached by the browser.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const port = Number(args.port ?? 5175);
const work = resolve(args.work);
const bundle = resolve(args.bundle);

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
cpSync(resolve(args.site), work, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json", ".pfui": "text/plain", ".json": "application/json" };

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const relative = normalize(path === "/" ? "/index.html" : path).replace(/^([/\\])+/, "");
  if (relative.startsWith("..")) {
    response.writeHead(403).end();
    return;
  }
  const base = relative.startsWith("pfui.js") ? bundle : work;
  const file = join(base, relative);
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  response.end(readFileSync(file));
}).listen(port, () => console.log(`static server: http://localhost:${port} (site: ${work})`));
