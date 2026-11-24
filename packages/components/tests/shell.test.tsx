// Steps 19A–19C in jsdom: the App shell through compiled markup. The structure
// (where each region renders), the root's data-* attributes CSS reads, the
// navigation items, and the state behind the drawer and the collapsed nav.
// What sticks and scrolls needs a real browser: e2e/app-shell.spec.ts.
import { compileModule } from "@patchfuil/compiler";
import { loadModule, navDrawerOpen, navigate, navPanelCollapsed, resetRouter, resetShellState } from "@patchfuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as components from "../src/index";
import { isActiveRoute } from "../src/shell";

beforeEach(() => {
  resetRouter();
  resetShellState();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  resetRouter();
  resetShellState();
});

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  const result = render(<Main />);
  const app = result.container.querySelector<HTMLElement>(".pfui-App")!;
  return { ...result, app };
}

/** The shell's elements, outermost first, as `tag.class` (and where the nav is). */
function outline(app: HTMLElement): string[] {
  const lines: string[] = [];
  const walk = (element: Element, depth: number) => {
    for (const child of Array.from(element.children)) {
      if (child.tagName === "STYLE") continue;
      const shell = [...child.classList].find((c) => /^pfui-(App|NavPanel$|Footer$)/.test(c));
      if (!shell || shell === "pfui-AppContent" || /-(logo|title|content|burger|profile)$/.test(shell)) continue;
      lines.push(`${"  ".repeat(depth)}${child.tagName.toLowerCase()}.${shell}`);
      walk(child, depth + 1);
    }
  };
  walk(app, 0);
  return lines;
}

const NAV = '<NavLink label="Home" to="/"/><NavLink label="Orders" to="/orders"/>';

describe("structure: the nav moves into one of four slots; nothing else moves", () => {
  test.each<[name: string, markup: string, expected: string[]]>([
    [
      "no regions",
      "<App><Text>x</Text></App>",
      ["div.pfui-AppColumn", "  div.pfui-AppBody", "    main.pfui-AppMain"],
    ],
    [
      "nav in the header (the default)",
      `<App><AppHeader/><NavPanel>${NAV}</NavPanel><Footer/></App>`,
      ["div.pfui-AppColumn", "  header.pfui-AppHeader", "    nav.pfui-NavPanel", "  div.pfui-AppBody", "    main.pfui-AppMain", "  footer.pfui-Footer"],
    ],
    [
      "below the header",
      `<App><AppHeader/><NavPanel placement="below-header">${NAV}</NavPanel><Footer/></App>`,
      ["div.pfui-AppColumn", "  header.pfui-AppHeader", "  nav.pfui-NavPanel", "  div.pfui-AppBody", "    main.pfui-AppMain", "  footer.pfui-Footer"],
    ],
    [
      "side, under a full-width header",
      `<App><AppHeader/><NavPanel placement="side">${NAV}</NavPanel><Footer/></App>`,
      ["div.pfui-AppColumn", "  header.pfui-AppHeader", "  div.pfui-AppBody", "    nav.pfui-NavPanel", "    main.pfui-AppMain", "  footer.pfui-Footer"],
    ],
    [
      "side, full height",
      `<App><AppHeader/><NavPanel placement="side" fullHeight="true">${NAV}</NavPanel><Footer/></App>`,
      ["nav.pfui-NavPanel", "div.pfui-AppColumn", "  header.pfui-AppHeader", "  div.pfui-AppBody", "    main.pfui-AppMain", "  footer.pfui-Footer"],
    ],
  ])("%s", (_, markup, expected) => {
    expect(outline(show(markup).app)).toEqual(expected);
  });

  test("the content is the children that are not regions, in order", () => {
    const { app } = show("<App><Text>one</Text><AppHeader/><Text>two</Text><Footer>f</Footer></App>");
    expect(app.querySelector(".pfui-AppContent")!.textContent).toBe("onetwo");
    expect(app.querySelector("footer")!.textContent).toBe("f");
  });

  test("the landmarks: header, nav (labeled), main, footer", () => {
    show(`<App><AppHeader/><NavPanel>${NAV}</NavPanel><Footer/></App>`);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });
});

describe("the root's attributes", () => {
  const attributes = (app: HTMLElement) =>
    Object.fromEntries(
      [...app.attributes].filter((a) => a.name.startsWith("data-") && !["data-tone", "data-mantine-color-scheme"].includes(a.name)).map((a) => [a.name, a.value]),
    );

  test.each<[markup: string, expected: Record<string, string>]>([
    ["<App/>", { "data-scroll": "page" }],
    ['<App scroll="content"/>', { "data-scroll": "content" }],
    ['<App scroll="none"><Footer/></App>', { "data-scroll": "none", "data-footer-sticky": "" }],
    ["<App><AppHeader/><NavPanel/><Footer/></App>", { "data-scroll": "page", "data-nav": "header", "data-drawer-below": "lg", "data-header-sticky": "", "data-footer-sticky": "" }],
    [
      '<App><AppHeader sticky="false"/><NavPanel placement="side" fullHeight="true" drawerBelow="never"/><Footer sticky="false"/></App>',
      { "data-scroll": "page", "data-nav": "side", "data-nav-full-height": "" },
    ],
    // A side nav without a header: the generated header shows only below the breakpoint, so nothing sticks on top.
    ['<App><NavPanel placement="side"/></App>', { "data-scroll": "page", "data-nav": "side", "data-drawer-below": "lg" }],
  ])("%s", (markup, expected) => {
    expect(attributes(show(markup).app)).toEqual(expected);
  });
});

describe("the header", () => {
  test("title, logo (by tone), content and profile menu, in order", () => {
    const { app } = show(`
      <App logo="/logo.svg" logo-dark="/logo-dark.svg">
        <AppHeader title="Acme">
          <Text>search</Text>
          <property name="profileMenuTemplate"><Text>me</Text></property>
        </AppHeader>
      </App>`);
    const header = app.querySelector("header")!;
    expect([...header.children].map((c) => c.className)).toEqual(["pfui-AppHeader-logo", "pfui-AppHeader-title", "pfui-AppHeader-content", "pfui-AppHeader-profile"]);
    expect(header.querySelector("img")!.getAttribute("src")).toBe("/logo.svg");
    expect(header.textContent).toBe("Acmesearchme");
  });

  test("logoTemplate (App or AppHeader), showLogo=false", () => {
    expect(show('<App><property name="logoTemplate"><H3>App logo</H3></property><AppHeader/></App>').app.querySelector(".pfui-AppHeader-logo")!.textContent).toBe("App logo");
    cleanup();
    expect(show('<App logo="/a.svg"><AppHeader><property name="logoTemplate"><H3>Own</H3></property></AppHeader></App>').app.querySelector(".pfui-AppHeader-logo")!.textContent).toBe("Own");
    cleanup();
    expect(show('<App logo="/a.svg"><AppHeader showLogo="false"/></App>').app.querySelector(".pfui-AppHeader-logo")).toBeNull();
  });

  test("with a full-height side nav the logo is also in the nav (CSS shows one of them)", () => {
    const { app } = show('<App logo="/a.svg"><AppHeader/><NavPanel placement="side" fullHeight="true"/></App>');
    expect(app.querySelector(".pfui-NavPanel-logo img")).toBeTruthy();
    expect(app.querySelector(".pfui-AppHeader-logo img")).toBeTruthy();
  });

  test("generated when the nav needs a header and there is none; not when it doesn't", () => {
    expect(show("<App><NavPanel/></App>").app.querySelector("header[data-generated]")).toBeTruthy();
    cleanup();
    expect(show('<App><NavPanel placement="side"/></App>').app.querySelector("header[data-generated]")).toBeTruthy();
    cleanup();
    expect(show('<App><NavPanel placement="side" drawerBelow="never"/></App>').app.querySelector("header")).toBeNull();
    cleanup();
    expect(show("<App><Footer/></App>").app.querySelector("header")).toBeNull();
  });

  test("the drawer toggle exists only when the nav can move into a drawer", () => {
    expect(show("<App><AppHeader/><NavPanel/></App>").app.querySelector(".pfui-AppHeader-burger")).toBeTruthy();
    cleanup();
    expect(show('<App><AppHeader/><NavPanel drawerBelow="never"/></App>').app.querySelector(".pfui-AppHeader-burger")).toBeNull();
    cleanup();
    expect(show("<App><AppHeader/></App>").app.querySelector(".pfui-AppHeader-burger")).toBeNull();
  });
});

describe("the drawer", () => {
  const MARKUP = `
    <App>
      <AppHeader/>
      <NavPanel placement="side">${NAV}</NavPanel>
      <Text>drawer: {navDrawerOpen}</Text>
    </App>`;

  // The toggle is display: none above the breakpoint (jsdom matches no media query), and a
  // hidden element has no accessible name for testing-library: find it by its aria-label.
  const toggle = (name: string) => document.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;

  test("the toggle opens and closes it; the overlay closes it", () => {
    const { app } = show(MARKUP);
    const burger = toggle("Open navigation");
    expect(burger.getAttribute("aria-controls")).toBe(app.querySelector("nav")!.id);
    fireEvent.click(burger);
    expect(app.hasAttribute("data-drawer-open")).toBe(true);
    expect(screen.getByText("drawer: true")).toBeTruthy();
    expect(toggle("Close navigation").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(app.querySelector(".pfui-App-overlay")!);
    expect(app.hasAttribute("data-drawer-open")).toBe(false);
    expect(app.querySelector(".pfui-App-overlay")).toBeNull();
  });

  test("opening moves the focus into the nav; Escape closes it and returns the focus", () => {
    const { app } = show(MARKUP);
    fireEvent.click(toggle("Open navigation"));
    expect(document.activeElement).toBe(app.querySelector(".pfui-NavLink"));
    // The toggle is display: none here (no media query matches in jsdom), so jsdom can't focus it:
    // check the call. e2e/app-shell.spec.ts checks the real focus at phone width.
    const focus = vi.spyOn(app.querySelector<HTMLElement>(".pfui-AppHeader-burger")!, "focus");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(navDrawerOpen.peek()).toBe(false);
    expect(focus).toHaveBeenCalled();
  });

  test("navigating closes it", () => {
    show(MARKUP);
    fireEvent.click(toggle("Open navigation"));
    expect(navDrawerOpen.peek()).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(navDrawerOpen.peek()).toBe(false);
  });
});

describe("collapsing the side nav", () => {
  test("NavPanelCollapseButton toggles it; the root says so only for a collapsible side nav", () => {
    const { app } = show(`
      <App>
        <AppHeader><NavPanelCollapseButton/></AppHeader>
        <NavPanel placement="side" collapsible="true">${NAV}</NavPanel>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(navPanelCollapsed.peek()).toBe(true);
    expect(app.hasAttribute("data-nav-collapsed")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));
    expect(app.hasAttribute("data-nav-collapsed")).toBe(false);
  });

  test("from script: setNavPanelCollapsed and navPanelCollapsed", () => {
    const { app } = show(`
      <App>
        <NavPanel placement="side" collapsible="true">${NAV}</NavPanel>
        <Button label="collapsed: {navPanelCollapsed}" onClick="setNavPanelCollapsed(!navPanelCollapsed)"/>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "collapsed: false" }));
    expect(screen.getByRole("button", { name: "collapsed: true" })).toBeTruthy();
    expect(app.hasAttribute("data-nav-collapsed")).toBe(true);
  });

  test("not collapsible: the state has no effect on the shell", () => {
    const { app } = show(`<App><NavPanel placement="side">${NAV}</NavPanel><Button label="c" onClick="setNavPanelCollapsed(true)"/></App>`);
    fireEvent.click(screen.getByRole("button", { name: "c" }));
    expect(app.hasAttribute("data-nav-collapsed")).toBe(false);
  });

  test("an item without an icon shows its initial when collapsed; with one, the icon", () => {
    const { app } = show('<App><NavPanel placement="side"><NavLink label="orders" to="/o"/><NavLink label="Home" to="/" icon="home"/></NavPanel></App>');
    const [orders, home] = app.querySelectorAll(".pfui-NavLink");
    expect(orders!.querySelector(".pfui-NavLink-initial")!.textContent).toBe("O");
    expect(home!.querySelector("svg.pfui-NavLink-icon")).toBeTruthy();
  });
});

describe("NavLink and NavGroup", () => {
  test.each<[to: string, pathname: string, exact: boolean, active: boolean]>([
    ["/orders", "/orders", false, true],
    ["/orders", "/orders/7", false, true],
    ["/orders", "/orders7", false, false],
    ["/orders", "/orders/7", true, false],
    ["/", "/", false, true],
    ["/", "/orders", false, false],
    ["/orders/", "/orders/7", false, true],
  ])("isActiveRoute(%j, %j, exact: %j) is %j", (to, pathname, exact, active) => {
    expect(isActiveRoute(to, pathname, exact)).toBe(active);
  });

  test("the active link follows the route; a click navigates without a page load", () => {
    show(`<App><NavPanel>${NAV}</NavPanel><Text>at {$pathname}</Text></App>`);
    const home = screen.getByRole("link", { name: "Home" });
    const orders = screen.getByRole("link", { name: "Orders" });
    expect(home.getAttribute("aria-current")).toBe("page");
    expect(orders.getAttribute("href")).toBe("#/orders");
    fireEvent.click(orders);
    expect(screen.getByText("at /orders")).toBeTruthy();
    expect(orders.getAttribute("aria-current")).toBe("page");
    expect(home.getAttribute("aria-current")).toBeNull();
    act(() => { void navigate("/orders/12"); });
    expect(orders.hasAttribute("data-active")).toBe(true);
  });

  test("active forces the look either way", () => {
    show('<App><NavPanel><NavLink label="A" to="/" active="false"/><NavLink label="B" to="/b" active="true"/></NavPanel></App>');
    expect(screen.getByRole("link", { name: "A" }).hasAttribute("data-active")).toBe(false);
    expect(screen.getByRole("link", { name: "B" }).hasAttribute("data-active")).toBe(true);
  });

  test("a group: a label that expands its items; initiallyExpanded", () => {
    const { app } = show(`
      <App>
        <NavPanel placement="side">
          <NavGroup label="Reports" icon="chart"><NavLink label="Sales" to="/sales"/></NavGroup>
          <NavGroup label="Open" initiallyExpanded="true"><NavLink label="X" to="/x"/></NavGroup>
        </NavPanel>
      </App>`);
    const [reports, open] = app.querySelectorAll("details");
    expect(reports!.open).toBe(false);
    expect(open!.open).toBe(true);
    expect(reports!.querySelector("summary")!.textContent).toBe("Reports");
  });

  test("items can come from data (Items)", () => {
    show(`
      <App var.pages="{[{ to: '/a', label: 'A' }, { to: '/b', label: 'B' }]}">
        <NavPanel><Items data="{pages}"><NavLink label="{$item.label}" to="{$item.to}"/></Items></NavPanel>
      </App>`);
    expect(screen.getAllByRole("link").map((l) => l.querySelector(".pfui-NavLink-label")!.textContent)).toEqual(["A", "B"]);
  });
});
