// Steps 19A–19C: the App shell. Markup → the shell settings App receives
// (`$$shell`), or the diagnostic at its span. See .ai/plan/poc-19a-app-shell.md.
import { LAYOUT_EQUIVALENTS } from "@gluefuil/components/metadata";
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

const compile = (markup: string) => compileModule(markup, { sourceMap: false });

/** The `$$shell` constant of a compiled app, or undefined when App receives none. */
function shell(markup: string): unknown {
  const { code, diagnostics } = compile(markup);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const name = /"\$\$shell": (\$\$q\d+)/.exec(code)?.[1];
  if (!name) return undefined;
  const constant = new RegExp(`const ${name.replace(/\$/g, "\\$")} = (.*);`).exec(code)![1]!;
  return JSON.parse(constant);
}

type Found = [code: string, span: string, severity?: "warning"];
function check(markup: string): Found[] {
  return compile(markup).diagnostics.map((d) => {
    const found: Found = [d.code, markup.slice(d.start, d.end)];
    if (d.severity === "warning") found.push("warning");
    return found;
  });
}

const NAV = { placement: "header", fullHeight: false, sticky: true, drawerBelow: "lg", collapsible: false };

describe("the settings App receives", () => {
  test.each<[markup: string, expected: unknown]>([
    // No regions: no $$shell (App reads its own `scroll`).
    ["<App><Text>x</Text></App>", undefined],
    ['<App scroll="content"><Text>x</Text></App>', undefined],
    // Each region, with the defaults: XMLUI's condensed-sticky.
    ["<App><AppHeader/></App>", { scroll: "page", header: { sticky: true } }],
    ["<App><Footer/></App>", { scroll: "page", footer: { sticky: true } }],
    ["<App><NavPanel/></App>", { scroll: "page", nav: NAV }],
    // Every setting.
    ['<App scroll="content"><NavPanel placement="side"/></App>', { scroll: "content", nav: { ...NAV, placement: "side" } }],
    ['<App><NavPanel placement="side" fullHeight="true" collapsible/></App>', { scroll: "page", nav: { ...NAV, placement: "side", fullHeight: true, collapsible: true } }],
    ['<App><NavPanel placement="below-header" sticky="false" drawerBelow="never"/></App>', { scroll: "page", nav: { ...NAV, placement: "below-header", sticky: false, drawerBelow: "never" } }],
    ['<App><AppHeader sticky="false"/><Footer sticky="false"/></App>', { scroll: "page", header: { sticky: false }, footer: { sticky: false } }],
    // The order of the regions in the markup doesn't matter.
    ['<App><Footer/><Text>x</Text><AppHeader/></App>', { scroll: "page", header: { sticky: true }, footer: { sticky: true } }],
  ])("%s", (markup, expected) => {
    expect(shell(markup)).toEqual(expected);
  });
});

describe("the regions are props of App, not children", () => {
  test("AppHeader, NavPanel and Footer go to $$header, $$nav and $$footer; the rest is the content", () => {
    const { code } = compile('<App><AppHeader title="A"/><NavPanel/><Text>body</Text><Footer>f</Footer></App>');
    expect(code).toContain(
      '$$h($$C_App, { "$$header": $$h($$C_AppHeader, { "title": "A" }), "$$nav": $$h($$C_NavPanel, null), "$$footer": $$h($$C_Footer, null, "f"), "$$shell": $$q0 }, $$h($$C_Text, null, "body"))',
    );
  });

  test("a region keeps its own bindings, handlers and when", () => {
    const { code, diagnostics } = compile('<App var.n="{1}"><AppHeader title="n = {n}"/><Footer when="{n > 0}">f</Footer></App>');
    expect(diagnostics).toEqual([]);
    expect(code).toMatch(/"\$\$header": \$\$h\(\$\$Bound, \{ type: \$\$C_AppHeader/);
    expect(code).toMatch(/"\$\$footer": \$\$h\(\$\$When/);
  });
});

describe("diagnostics", () => {
  test.each<[markup: string, expected: Found[]]>([
    // Regions belong to App (E028).
    ["<App><Stack><AppHeader/></Stack></App>", [["E028", "AppHeader"]]],
    ['<Component name="Bar"><NavPanel/></Component>', [["E028", "NavPanel"]]],
    ["<App><Footer/><Footer/></App>", [["E028", "Footer"]]],
    // Combinations that need a side nav.
    ['<App><NavPanel fullHeight="true"/></App>', [["E028", "fullHeight"]]],
    ['<App><NavPanel placement="below-header" collapsible/></App>', [["E028", "collapsible"]]],
    ['<App><NavPanel fullHeight="false"/></App>', []],
    ["<App><AppHeader><NavPanelCollapseButton/></AppHeader><NavPanel/></App>", [["E028", "NavPanelCollapseButton"]]],
    ['<App><AppHeader><NavPanelCollapseButton/></AppHeader><NavPanel placement="side" collapsible="true"/></App>', []],
    // A collapse button in a component file can't be checked there.
    ['<Component name="Bar"><NavPanelCollapseButton/></Component>', []],
    // The settings are literals (E026), with checked values (E023).
    ['<App><NavPanel placement="{\'side\'}"/></App>', [["E026", `"{'side'}"`]]],
    ['<App><NavPanel placement="left"/></App>', [["E023", '"left"']]],
    ['<App scroll="window"/>', [["E023", '"window"']]],
    ['<App><NavPanel drawerBelow="phone"/></App>', [["E023", '"phone"']]],
    // sticky has no effect unless the page scrolls (a warning).
    ['<App scroll="content"><AppHeader sticky="true"/><Footer sticky="false"/></App>', [["E029", "sticky", "warning"], ["E029", "sticky", "warning"]]],
    ['<App scroll="none"><NavPanel placement="side" sticky="false"/></App>', [["E029", "sticky", "warning"]]],
    // XMLUI's layout props are gone (E030).
    ['<App layout="vertical"/>', [["E030", "layout"]]],
    ['<App scrollWholePage="false"/>', [["E030", "scrollWholePage"]]],
    ["<App fitContent/>", [["E030", "fitContent"]]],
  ])("%s", (markup, expected) => {
    expect(check(markup)).toEqual(expected);
  });

  test("each XMLUI layout name gets its own replacement", () => {
    for (const [layout, instead] of Object.entries(LAYOUT_EQUIVALENTS)) {
      const [diagnostic] = compile(`<App layout="${layout}"/>`).diagnostics;
      expect(diagnostic?.message).toBe(`'App' has no 'layout' any more: ${instead}`);
    }
    expect(compile('<App layout="{x}"/>').diagnostics[0]?.message).toMatch(/^'App' has no 'layout' any more: the shell has no layout names/);
  });

  test("every replacement in the table compiles without errors", () => {
    const markups = [
      '<App><AppHeader sticky="false"/><NavPanel/><Footer sticky="false"/></App>',
      '<App><AppHeader/><NavPanel placement="below-header"/><Footer/></App>',
      '<App><AppHeader sticky="false"/><NavPanel placement="below-header" sticky="false"/><Footer sticky="false"/></App>',
      '<App><AppHeader/><NavPanel placement="side"/><Footer/></App>',
      '<App><AppHeader/><NavPanel placement="side" fullHeight="true"/><Footer/></App>',
      '<App><AppHeader sticky="false"/><NavPanel placement="side" fullHeight="true" sticky="false"/><Footer sticky="false"/></App>',
      '<App scroll="content"><AppHeader/><Footer/></App>',
    ];
    for (const markup of markups) expect(compile(markup).diagnostics, markup).toEqual([]);
  });

  test("messages", () => {
    const messages = (markup: string) => compile(markup).diagnostics.map((d) => d.message);
    expect(messages("<App><Stack><AppHeader/></Stack></App>")).toEqual(["<AppHeader> must be a direct child of <App>"]);
    expect(messages("<App><Footer/><Footer/></App>")).toEqual(["<App> can have only one <Footer>"]);
    expect(messages('<App><NavPanel fullHeight="true"/></App>')).toEqual([`'fullHeight' needs a side nav: <NavPanel placement="side" fullHeight="true">`]);
    expect(messages('<App scroll="content"><Footer sticky="true"/></App>')).toEqual([
      `'sticky' has no effect: App scroll="content" keeps the regions in view (or never sticks, with "none")`,
    ]);
    expect(messages('<App scrollWholePage="false"/>')).toEqual([`'App' has no 'scrollWholePage' any more: use scroll="page" (true) or scroll="content" (false)`]);
  });
});
