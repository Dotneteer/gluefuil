// Static generation in the plugin: options, HTML injection, when it runs.
import { afterAll, describe, expect, test } from "vitest";
import { pfui } from "../src/index";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRootAttributes, basenameOf, injectPrerendered, isStaticRoute, previewRewrite, resolvePrerender, routeFileName, routesToRender } from "../src/prerender";

describe("options", () => {
  test.each([
    [undefined, undefined],
    [false, undefined],
    [true, { entry: "src/Main.pfui", rootId: "root", breakpoint: "xs", routes: [] }],
    [{ breakpoint: "lg" as const }, { entry: "src/Main.pfui", rootId: "root", breakpoint: "lg", routes: [] }],
    [{ entry: "app/Start.pfui", rootId: "app" }, { entry: "app/Start.pfui", rootId: "app", breakpoint: "xs", routes: [] }],
    [{ routes: ["/users/1"] }, { entry: "src/Main.pfui", rootId: "root", breakpoint: "xs", routes: ["/users/1"] }],
  ])("%j", (option, expected) => {
    expect(resolvePrerender(option)).toEqual(expected);
  });
});

describe("injectPrerendered", () => {
  const attrs = { "data-pfui-prerendered": "xs" };

  test.each([
    ['<body><div id="root"></div></body>', '<body><div id="root" data-pfui-prerendered="xs"><b>app</b></div></body>'],
    ['<div id="root">\n  </div>', '<div id="root" data-pfui-prerendered="xs"><b>app</b></div>'],
    ["<main class='x' id='root' hidden></main>", `<main class='x' id='root' hidden data-pfui-prerendered="xs"><b>app</b></main>`],
    ['<div data-id="root"></div><section id="root"></section>', '<div data-id="root"></div><section id="root" data-pfui-prerendered="xs"><b>app</b></section>'],
  ])("%s", (html, expected) => {
    expect(injectPrerendered(html, "root", "<b>app</b>", attrs)).toBe(expected);
  });

  test("attribute values are escaped", () => {
    expect(injectPrerendered('<div id="r"></div>', "r", "", { "data-x": `a"<&` })).toBe('<div id="r" data-x="a&quot;&lt;&amp;"></div>');
  });

  test.each([
    ['<div id="app"></div>', 'index.html has no element with id="root"'],
    ['<div id="root">Loading…</div>', 'the element with id="root" in index.html must be empty'],
    ['<div id="root"><span></span></div>', "must be empty"],
    ['<div id="root"/>', "must not be self-closing"],
  ])("refuses %s", (html, message) => {
    expect(() => injectPrerendered(html, "root", "x", attrs)).toThrow(message);
  });
});

describe("when it runs", () => {
  type Hook = { order: string; handler: (html: string, context?: { path: string }) => Promise<string> };
  const hookOf = (options: Parameters<typeof pfui>[0], config: object) => {
    const plugin = pfui(options);
    (plugin.configResolved as (c: unknown) => void)({ build: { sourcemap: false }, ...config });
    return plugin.transformIndexHtml as unknown as Hook;
  };
  const HTML = '<div id="root"></div>';

  test("runs last", () => {
    expect(hookOf({ prerender: true }, { command: "build", build: {} }).order).toBe("post");
  });

  test.each([
    ["prerender off", {}, { command: "build", build: {} }],
    ["dev server", { prerender: true }, { command: "serve", build: {} }],
    ["SSR build", { prerender: true }, { command: "build", build: { ssr: true } }],
  ])("not for: %s", async (_, options, config) => {
    expect(await hookOf(options, config).handler(HTML)).toBe(HTML);
  });

  test("not for another page of a multi-page build (only index.html)", async () => {
    expect(await hookOf({ prerender: true }, { command: "build", build: {} }).handler(HTML, { path: "/layouts.html" })).toBe(HTML);
  });

  test.each([
    ["dev server", { prerender: true }, { command: "serve", base: "/app/", build: {} }, HTML],
    ["a build without prerender", {}, { command: "build", base: "/app/", build: {} }, HTML],
    ["a custom root id", { prerender: { rootId: "app" } }, { command: "serve", base: "/app/", build: {} }, '<div id="app"></div>'],
  ])("under base /app/, %s writes data-pfui-base on the root", async (_, options, config, html) => {
    expect(await hookOf(options, config).handler(html)).toBe(html.replace('">', '" data-pfui-base="/app">'));
  });

  test("a root base writes nothing", async () => {
    expect(await hookOf({}, { command: "serve", base: "/", build: {} }).handler(HTML)).toBe(HTML);
  });
});

describe("prerendered routes (step 21)", () => {
  test.each([
    ["/", true],
    ["/about", true],
    ["/docs/intro", true],
    ["/users/:id", false],
    ["/users/:id?", false],
    ["/files/*", false],
    ["*", false],
  ])("isStaticRoute(%s): %s", (pattern, expected) => {
    expect(isStaticRoute(pattern)).toBe(expected);
  });

  test.each([
    ["/", "index.html"],
    ["/about", "about/index.html"],
    ["/about/", "about/index.html"],
    ["/docs/intro", "docs/intro/index.html"],
    ["/users/1?tab=x", "users/1/index.html"],
  ])("routeFileName(%s): %s", (path, file) => {
    expect(routeFileName(path)).toBe(file);
  });

  const registered = ["/", "/about/", "/users/:id", "/about", "*"];
  const matches = (path: string) => path.startsWith("/users/") || path === "/about";

  test("browser mode: the static routes (normalized, deduplicated, without '/') and the extra paths", () => {
    expect(routesToRender("browser", registered, [], matches)).toEqual(["/about"]);
    expect(routesToRender("browser", registered, ["/users/1", "/users/2"], matches)).toEqual(["/about", "/users/1", "/users/2"]);
  });

  test("browser mode: an extra path that matches no route is an error", () => {
    expect(() => routesToRender("browser", registered, ["/nope"], matches)).toThrow('the route "/nope" (option "routes") matches no Page url');
  });

  test("hash mode: nothing after '/', and `routes` is an error", () => {
    expect(routesToRender("hash", registered, [], matches)).toEqual([]);
    expect(() => routesToRender("hash", registered, ["/users/1"], matches)).toThrow('the "routes" option needs browser routing');
  });

  describe("previewRewrite: /about serves about/index.html, as static hosts do", () => {
    const outDir = mkdtempSync(join(tmpdir(), "pfui-preview-"));
    mkdirSync(join(outDir, "about"));
    writeFileSync(join(outDir, "about", "index.html"), "");
    afterAll(() => rmSync(outDir, { recursive: true, force: true }));

    test.each([
      ["/about", "/about/index.html"],
      ["/about?x=1", "/about/index.html?x=1"],
      ["/about/", undefined],
      ["/missing", undefined],
      ["/assets/index.js", undefined],
      ["/about/../about", undefined],
      ["/%E0%A4%A", undefined],
    ])("%s → %s", (url, expected) => {
      expect(previewRewrite(url, outDir)).toBe(expected);
    });

    test.each([
      ["/app/about", "/app/about/index.html"],
      ["/app/about?x=1", "/app/about/index.html?x=1"],
      ["/app/missing", undefined],
      ["/about", undefined],
      ["/application/about", undefined],
    ])("under the base /app: %s → %s", (url, expected) => {
      expect(previewRewrite(url, outDir, "/app")).toBe(expected);
    });
  });
});

test("the route files are emitted after Vite's HTML plugin (generateBundle, order post)", () => {
  expect((pfui({ prerender: true }).generateBundle as { order?: string }).order).toBe("post");
});

describe("the basename (step 21, part 2)", () => {
  test.each([
    ["/", ""],
    ["/app/", "/app"],
    ["/a/b/", "/a/b"],
    ["./", ""],
    ["", ""],
    ["https://cdn.example.com/app/", ""],
  ])("Vite base %j → basename %j", (base, expected) => {
    expect(basenameOf(base)).toBe(expected);
  });

  test.each([
    ['<div id="root"></div>', '<div id="root" data-pfui-base="/app"></div>'],
    ['<div class="x" id="root">kept</div>', '<div class="x" id="root" data-pfui-base="/app">kept</div>'],
    ["<div id='root'/>", "<div id='root' data-pfui-base=\"/app\"/>"],
    ['<div id="other"></div>', '<div id="other"></div>'],
  ])("addRootAttributes(%s)", (html, expected) => {
    expect(addRootAttributes(html, "root", { "data-pfui-base": "/app" })).toBe(expected);
  });
});
