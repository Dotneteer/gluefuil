// Step 35: the plugin's Inspector: the page's HTML, the build input it adds with
// `inspector: true`, its virtual page and entry, and its own markup's compilation.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import { describe, expect, test } from "vitest";
import { gfui, INSPECTOR_ENTRY, INSPECTOR_HTML, inspectorHtml, isInspectorFile } from "../src/index";

const inspectorSrc = dirname(createRequire(import.meta.url).resolve("@gluefuil/inspector/metadata"));
type ConfigHook = (user: object, env: { command: string }) => { build: { rollupOptions: { input: Record<string, string> } } } | undefined;
const configOf = (plugin: Plugin) => plugin.config as unknown as ConfigHook;

describe("the Inspector page", () => {
  test("on the dev server: its entry through /@fs, and the project root for opening files", () => {
    const html = inspectorHtml("/app/", "/work/shop");
    expect(html).toContain(`<script type="module" src="/app/@fs${resolve(inspectorSrc, "main.tsx")}"></script>`);
    expect(html).toContain('<div id="root" data-gfui-project-root="/work/shop"></div>');
  });

  test("in a build: the virtual entry, and no project root (nothing to open)", () => {
    const html = inspectorHtml("/", undefined);
    expect(html).toContain(`src="${INSPECTOR_ENTRY}"`);
    expect(html).toContain('<div id="root"></div>');
  });

  test("only the Inspector's own files compile with its feed component", () => {
    expect(isInspectorFile(resolve(inspectorSrc, "Inspector.gui"))).toBe(true);
    expect(isInspectorFile("/work/shop/src/Main.gui")).toBe(false);
  });

  test("its markup compiles (the plugin's transform)", () => {
    const plugin = gfui();
    (plugin.configResolved as (c: unknown) => void)({ command: "serve", root: "/work", build: {} });
    const file = resolve(inspectorSrc, "Inspector.gui");
    const result = (plugin.transform as (this: object, code: string, id: string) => { code: string })
      .call({ error: (e: unknown) => { throw new Error(String((e as { message: string }).message)); }, warn: () => {}, addWatchFile: () => {} }, readFileSync(file, "utf8"), file);
    expect(result.code).toContain('import { TraceFeed as $$C_TraceFeed } from "./feed";');
  });
});

describe("a build with inspector: true", () => {
  test.each<[label: string, input: unknown, expected: Record<string, string>]>([
    ["no input: index.html and the Inspector", undefined, { index: resolve("/work/index.html"), gfuiInspector: resolve("/work", INSPECTOR_HTML) }],
    ["one input", "/work/main.html", { index: "/work/main.html", gfuiInspector: resolve("/work", INSPECTOR_HTML) }],
    ["several (a multi-page app)", { main: "/work/index.html", layouts: "/work/layouts.html" }, { main: "/work/index.html", layouts: "/work/layouts.html", gfuiInspector: resolve("/work", INSPECTOR_HTML) }],
  ])("%s", (_, input, expected) => {
    const config = configOf(gfui({ inspector: true }))({ root: "/work", build: { rollupOptions: { input } } }, { command: "build" });
    expect(config?.build.rollupOptions.input).toEqual(expected);
  });

  test.each<[label: string, options: Parameters<typeof gfui>[0], command: string]>([
    ["a build without it", {}, "build"],
    ["the dev server (it serves the page itself)", { inspector: true }, "serve"],
  ])("no extra input: %s", (_, options, command) => {
    expect(configOf(gfui(options))({ root: "/work" }, { command })).toBeUndefined();
  });

  test("the page is virtual: resolved and loaded by the plugin; the entry maps to the package", () => {
    const plugin = gfui({ inspector: true });
    (plugin.configResolved as (c: unknown) => void)({ command: "build", root: "/work", base: "/", build: {} });
    const page = resolve("/work", INSPECTOR_HTML);
    expect((plugin.resolveId as (id: string) => string | undefined)(page)).toBe(page);
    expect((plugin.load as (id: string) => string | undefined)(page)).toContain("<title>gfui Inspector</title>");
    expect((plugin.resolveId as (id: string) => string | undefined)(INSPECTOR_ENTRY)).toBe(resolve(inspectorSrc, "main.tsx"));
  });
});
