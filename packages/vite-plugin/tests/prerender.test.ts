// Static generation in the plugin: options, HTML injection, when it runs.
import { describe, expect, test } from "vitest";
import { pfui } from "../src/index";
import { injectPrerendered, resolvePrerender } from "../src/prerender";

describe("options", () => {
  test.each([
    [undefined, undefined],
    [false, undefined],
    [true, { entry: "src/Main.pfui", rootId: "root", breakpoint: "xs" }],
    [{ breakpoint: "lg" as const }, { entry: "src/Main.pfui", rootId: "root", breakpoint: "lg" }],
    [{ entry: "app/Start.pfui", rootId: "app" }, { entry: "app/Start.pfui", rootId: "app", breakpoint: "xs" }],
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
});
