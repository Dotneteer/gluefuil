// Build-time compilation (step 12): a production build of test-apps/hello
// ships no compiler, needs no eval, and maps back to Main.gui when asked to.
// Static generation (step 13): its index.html contains the prerendered app.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const configFile = fileURLToPath(new URL("../test-apps/hello/vite.config.ts", import.meta.url));

type Output = readonly (Rolldown.OutputChunk | Rolldown.OutputAsset)[];

async function buildHello(sourcemap: boolean): Promise<Output> {
  const result = await build({
    configFile,
    configLoader: "runner",
    logLevel: "silent",
    build: { write: false, sourcemap, minify: true },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((o) => ("output" in o ? o.output : []));
}

const chunks = (output: Output) => output.filter((o): o is Rolldown.OutputChunk => o.type === "chunk");
const relative = (id: string) => id.split("\\").join("/").replace(repoRoot.split("\\").join("/"), "");
/** Every module the bundler included, even when tree-shaking dropped all its code. */
const relativeIds = (chunk: Rolldown.OutputChunk) => chunk.moduleIds.map(relative);
/** The modules that contribute code to the chunk. */
const renderedIds = (chunk: Rolldown.OutputChunk) =>
  Object.entries(chunk.modules)
    .filter(([, info]) => info.renderedLength > 0)
    .map(([id]) => relative(id));

describe("a production build (no source maps)", () => {
  let output: Output;
  beforeAll(async () => {
    output = await buildHello(false);
  }, 60_000);

  test("is one entry chunk with the app's compiled markup, the runtime and the components, plus lazy chunks: Markdown's renderer, the date inputs", () => {
    const entries = chunks(output).filter((chunk) => chunk.isEntry);
    expect(entries).toHaveLength(1);
    const ids = relativeIds(entries[0]!);
    expect(ids).toContain("test-apps/hello/src/Main.gui");
    expect(ids.some((id) => id.startsWith("packages/runtime/src/"))).toBe(true);
    expect(ids.some((id) => id.startsWith("packages/components/src/"))).toBe(true);
    // Step 23: the Markdown parser and renderer are a chunk of their own, loaded on demand.
    expect(ids).not.toContain("packages/components/src/markdown-render.tsx");
    expect(ids.some((id) => id.includes("micromark") || id.includes("mdast-util"))).toBe(false);
    // Lazy: the chunks only dynamic imports reach (step 23: Markdown; step 26: the date and time inputs,
    // with @mantine/dates and dayjs). Modules the entry shares with them are a chunk the entry imports
    // statically: eager. The bundler's small runtime (rolldown-runtime) is a chunk of its own too.
    const eager = new Set(entries[0]!.imports);
    const lazy = chunks(output).filter((chunk) => !chunk.isEntry && !eager.has(chunk.fileName) && chunk.moduleIds.some((id) => !id.includes("rolldown")));
    expect(lazy).toHaveLength(2);
    expect(lazy.map((chunk) => ["markdown-render.tsx", "dates-native.tsx"].find((file) => relativeIds(chunk).includes(`packages/components/src/${file}`))).sort()).toEqual([
      "dates-native.tsx",
      "markdown-render.tsx",
    ]);
    const eagerIds = chunks(output).filter((chunk) => chunk.isEntry || eager.has(chunk.fileName)).flatMap(relativeIds);
    // Only their stylesheet is eager (MANTINE_STYLESHEET: the prerender inlines it).
    expect(eagerIds.filter((id) => (id.includes("@mantine/dates") || id.includes("dayjs")) && !id.includes(".css"))).toEqual([]);
  });

  test("contains no compiler module", () => {
    const ids = chunks(output).flatMap(relativeIds);
    expect(ids.filter((id) => id.includes("packages/compiler/") || id.includes("@gluefuil/compiler"))).toEqual([]);
    // The React-free metadata module is included since step 17: App needs the
    // components' theme variable defaults at runtime. It is data, not compiler.
  });

  test("needs no eval: no `new Function`, no `eval(`", () => {
    for (const chunk of chunks(output)) {
      expect(chunk.code).not.toMatch(/new Function\b/);
      expect(chunk.code).not.toMatch(/\beval\(/);
    }
  });

  test("the runtime's standalone loader (loadModule, loadBinding) is tree-shaken away", () => {
    const ids = chunks(output).flatMap(renderedIds);
    expect(ids).toContain("packages/runtime/src/render/elements.ts");
    expect(ids).not.toContain("packages/runtime/src/render/module.ts");
    expect(ids).not.toContain("packages/runtime/src/script/load.ts");
  });

  test("the prerender stays in the build: no react-dom/server, no runtime/server", () => {
    const ids = chunks(output).flatMap(renderedIds);
    expect(ids.filter((id) => /react-dom[/\\](cjs[/\\]react-dom-server|server)/.test(id))).toEqual([]);
    expect(ids).not.toContain("packages/runtime/src/server.ts");
  });

  test("index.html contains the prerendered app, marked for takeover at xs", () => {
    const html = output.find((o) => o.fileName === "index.html") as Rolldown.OutputAsset;
    const source = String(html.source);
    // The stylesheet (React 19 hoisted <style>) comes first, then the themed App.
    expect(source).toContain('<div id="root" data-gfui-prerendered="xs" data-gfui-path="/"><style data-precedence="gfui" data-href="gfui-mantine gfui-base">');
    expect(source).toMatch(/<div class="gfui-App" data-tone="light" data-mantine-color-scheme="light" style="--gfui-/);
    expect(source).toContain('<span class="gfui-Text">Count: 0</span>');
    expect(source).toContain('<span class="gfui-Text">Todo #1: Write tests</span>');
    // Rendered for xs: the compact text, not the wide one.
    expect(source).toContain("Layout: compact");
    expect(source).not.toContain("Layout: wide");
  });

  test("contains no source-map marker characters and no source map", () => {
    for (const chunk of chunks(output)) {
      expect(chunk.code).not.toMatch(/[\uE000\uE001]/);
      expect(chunk.map).toBeNull();
    }
  });
});

describe("a production build with build.sourcemap", () => {
  test("maps back to Main.gui", async () => {
    const output = await buildHello(true);
    const chunk = chunks(output)[0]!;
    expect(chunk.code).not.toMatch(/[\uE000\uE001]/);
    const sources = chunk.map!.sources.map((s) => s.split("\\").join("/"));
    expect(sources.some((s) => s.endsWith("src/Main.gui"))).toBe(true);
    const index = sources.findIndex((s) => s.endsWith("src/Main.gui"));
    expect(chunk.map!.sourcesContent?.[index]).toContain("<App");
  }, 60_000);
});

describe("prerender failures fail the build", () => {
  // A throwaway app inside the repo, so it resolves the workspace packages.
  const app = join(repoRoot, ".tmp", "prerender-failure");
  beforeAll(() => {
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "index.html"), '<div id="root"></div><script type="module" src="/src/main.ts"></script>');
    writeFileSync(join(app, "src", "main.ts"), 'import Main from "./Main.gui";\nconsole.log(Main);\n');
  });
  afterAll(() => rmSync(app, { recursive: true, force: true }));

  async function buildApp(markup: string, html?: string) {
    writeFileSync(join(app, "src", "Main.gui"), markup);
    if (html) writeFileSync(join(app, "index.html"), html);
    const { gfui } = await import("../packages/vite-plugin/src/index");
    return build({
      configFile: false,
      root: app,
      logLevel: "silent",
      plugins: [gfui({ prerender: true })],
      build: { write: false },
    });
  }

  test("an error while rendering", async () => {
    await expect(buildApp('<App><Text>{[].reduce((a, b) => a)}</Text></App>')).rejects.toThrow(/Reduce of empty array/);
  }, 60_000);

  test("no root element", async () => {
    await expect(buildApp("<App/>", '<div id="app"></div><script type="module" src="/src/main.ts"></script>')).rejects.toThrow(
      'index.html has no element with id="root"',
    );
  }, 60_000);
});

describe("prerendered routes (step 21)", () => {
  const app = join(repoRoot, ".tmp", "prerender-routes");
  beforeAll(() => {
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "index.html"), '<div id="root"></div><script type="module" src="/src/main.ts"></script>');
    writeFileSync(join(app, "src", "main.ts"), 'import Main from "./Main.gui";\nconsole.log(Main);\n');
  });
  afterAll(() => rmSync(app, { recursive: true, force: true }));

  const markup = (hash: boolean) => `
    <App useHashBasedRouting="${hash}">
      <Text>at {$pathname}</Text>
      <Pages>
        <Page url="/"><H1>Home</H1></Page>
        <Page url="/about/"><H1>About</H1></Page>
        <Page url="/docs/intro"><H1>Intro</H1></Page>
        <Page url="/users/:id"><H1>User {$routeParams.id}</H1></Page>
        <Page url="/files/*"><H1>Files</H1></Page>
      </Pages>
    </App>`;

  async function buildRoutes(source: string, prerender: object = {}, base?: string) {
    writeFileSync(join(app, "src", "Main.gui"), source);
    const { gfui } = await import("../packages/vite-plugin/src/index");
    const result = await build({
      configFile: false,
      root: app,
      logLevel: "silent",
      ...(base !== undefined ? { base } : {}),
      plugins: [gfui({ prerender: { ...prerender } })],
      build: { write: false },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((o) => ("output" in o ? o.output : []));
    return Object.fromEntries(
      outputs.filter((o): o is Rolldown.OutputAsset => o.type === "asset" && o.fileName.endsWith(".html")).map((o) => [o.fileName, String(o.source)]),
    );
  }

  const h1 = (html: string) => /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1]?.replace(/<!-- -->/g, "");
  const path = (html: string) => /data-gfui-path="([^"]*)"/.exec(html)?.[1];

  test("browser routing: one file per static route (and per `routes` path), each with its own content", async () => {
    const pages = await buildRoutes(markup(false), { routes: ["/users/1"] });
    expect(Object.keys(pages).sort()).toEqual(["about/index.html", "docs/intro/index.html", "index.html", "users/1/index.html"]);
    expect(Object.entries(pages).map(([file, html]) => [file, h1(html), path(html)]).sort()).toEqual([
      ["about/index.html", "About", "/about"],
      ["docs/intro/index.html", "Intro", "/docs/intro"],
      ["index.html", "Home", "/"],
      ["users/1/index.html", "User 1", "/users/1"],
    ]);
    // The same shell: the same script, absolute.
    const scripts = Object.values(pages).map((html) => /<script[^>]*src="([^"]*)"/.exec(html)?.[1]);
    expect(new Set(scripts).size).toBe(1);
    expect(scripts[0]).toMatch(/^\/assets\//);
  }, 60_000);

  test("hash routing: only index.html (the server never sees the route)", async () => {
    const pages = await buildRoutes(markup(true));
    expect(Object.keys(pages)).toEqual(["index.html"]);
  }, 60_000);

  test("the `routes` option needs browser routing, and each path must match a Page", async () => {
    await expect(buildRoutes(markup(true), { routes: ["/users/1"] })).rejects.toThrow('the "routes" option needs browser routing');
    await expect(buildRoutes(markup(false), { routes: ["/nope"] })).rejects.toThrow('the route "/nope" (option "routes") matches no Page url');
  }, 60_000);

  test("a relative base is refused when there is more than one route", async () => {
    await expect(buildRoutes(markup(false), {}, "./")).rejects.toThrow(/base "\.\/" is relative/);
    // One route: fine.
    const pages = await buildRoutes('<App useHashBasedRouting="false"><Pages><Page url="/"><H1>Only</H1></Page></Pages></App>', {}, "./");
    expect(Object.keys(pages)).toEqual(["index.html"]);
  }, 60_000);
});
