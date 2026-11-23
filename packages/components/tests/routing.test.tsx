// Step 19 in jsdom: Pages, Page, Link and the routing globals through compiled markup.
import { compileModule } from "@patchfuil/compiler";
import { loadModule, navigate, resetRouter } from "@patchfuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import * as components from "../src/index";

beforeEach(() => {
  resetRouter();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  resetRouter();
});

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const DASHBOARD = `
  <App>
    <Text>path: {$pathname}</Text>
    <Pages fallbackPath="/">
      <Page url="/">
        <H1>Dashboard</H1>
        <Button label="Open theming" onClick="navigate('/tests/theming')"/>
        <Link to="/tests/mantine?step=16">Mantine link</Link>
      </Page>
      <Page url="/tests/:name">
        <H1>Test: {$routeParams.name}</H1>
        <Text>query: {JSON.stringify($queryParams)}</Text>
        <Button label="Back" onClick="navigate('/')"/>
      </Page>
      <Text>always here</Text>
    </Pages>
  </App>`;

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

test("the first matching Page renders; buttons and links navigate; $routeParams and $queryParams follow", async () => {
  show(DASHBOARD);
  expect(heading()).toBe("Dashboard");
  expect(screen.getByText("always here")).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open theming" })));
  expect(heading()).toBe("Test: theming");
  expect(screen.getByText("path: /tests/theming")).toBeTruthy();
  expect(window.location.hash).toBe("#/tests/theming");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Back" })));
  expect(heading()).toBe("Dashboard");

  const link = screen.getByRole("link", { name: "Mantine link" });
  expect(link.getAttribute("href")).toBe("#/tests/mantine?step=16");
  await act(async () => fireEvent.click(link));
  expect(heading()).toBe("Test: mantine");
  expect(screen.getByText('query: {"step":"16"}')).toBeTruthy();
});

test("an unknown route falls back (replacing the history entry)", async () => {
  window.history.replaceState(null, "", "/#/no/such/page");
  show(DASHBOARD);
  await act(async () => {});
  expect(heading()).toBe("Dashboard");
  expect(window.location.hash).toBe("#/");
});

test("a deep link opens its page; the browser's back button (hashchange) is followed", async () => {
  window.history.replaceState(null, "", "/#/tests/deep");
  show(DASHBOARD);
  expect(heading()).toBe("Test: deep");
  await act(async () => {
    window.location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(heading()).toBe("Dashboard");
});

test("only the active page is mounted: its state starts fresh when it comes back", async () => {
  show(`
    <App>
      <Pages>
        <Page url="/">
          <Stack var.count="{0}">
            <Button label="{'count ' + count}" onClick="count++"/>
            <Button label="Away" onClick="navigate('/away')"/>
          </Stack>
        </Page>
        <Page url="/away"><Button label="Home" onClick="navigate('/')"/></Page>
      </Pages>
    </App>`);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "count 0" })));
  expect(screen.getByRole("button", { name: "count 1" })).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Away" })));
  expect(screen.queryByRole("button", { name: /^count/ })).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Home" })));
  expect(screen.getByRole("button", { name: "count 0" })).toBeTruthy();
});

test("a Page that is a Bound element (it has an id or lifecycle) still routes", async () => {
  show(`
    <App var.log="">
      <Pages>
        <Page url="/" onMount="log += 'home '"><Text>home</Text></Page>
        <Page url="/x" onMount="log += 'x '"><Text>x</Text></Page>
      </Pages>
      <Text>log: {log}</Text>
    </App>`);
  expect(screen.getByText("home")).toBeTruthy();
  await act(async () => navigate("/x"));
  expect(screen.getByText("x")).toBeTruthy();
  expect(screen.getByText("log: home x")).toBeTruthy();
});

test("browser mode (useHashBasedRouting=false): paths, and links without a hash", async () => {
  window.history.replaceState(null, "", "/tests/plain");
  show(DASHBOARD.replace("<App>", '<App useHashBasedRouting="false">'));
  expect(heading()).toBe("Test: plain");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Back" })));
  expect(window.location.pathname).toBe("/");
  expect(screen.getByRole("link", { name: "Mantine link" }).getAttribute("href")).toBe("/tests/mantine?step=16");
});

test("contracts: Page url is required and literal; a Page cannot use when or variables", () => {
  const codes = (markup: string) => compileModule(markup).diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
  expect(codes("<App><Pages><Page/></Pages></App>")).toEqual([["E021", "Page"]]);
  expect(codes('<App var.u="/x"><Pages><Page url="{u}"/></Pages></App>')).toEqual([["E026", '"{u}"']]);
  expect(codes('<App><Pages><Page url="/" when="{true}"/></Pages></App>')).toEqual([["E027", "when"]]);
  expect(codes('<App><Pages><Page url="/" var.x="1"/></Pages></App>')).toEqual([["E027", "var.x"]]);
  expect(codes('<App><Pages><Page url="/"><variable name="x" value="1"/></Page></Pages></App>')).toEqual([["E027", "variable"]]);
  expect(codes("<App><Link/></App>")).toEqual([["E021", "Link"]]);
});
