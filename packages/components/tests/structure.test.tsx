// Step 28 in jsdom: Tabs, ExpandableItem, Stepper, Splitter, ScrollViewer,
// StickyBox, StickySection, ResponsiveBar. jsdom has no layout: dragging,
// sticking and overflow by size are E2E tests (e2e/structure.spec.ts); here the
// pure functions behind them are tested directly.
import { compileModule } from "@gluefuil/compiler";
import { loadModule, resetRouter, setErrorReporter } from "@gluefuil/runtime";
import { renderStatic } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fittingCount, splitterSize, splitterSizeAfterDrag } from "../src/structure";
import * as components from "../src/index";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  restore = setErrorReporter((error) => errors.push(error));
});
afterEach(() => {
  cleanup();
  restore();
  resetRouter();
});

function compiled(markup: string): ComponentType {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  return loadModule(code, { components }) as ComponentType;
}
const show = (markup: string) => render(<>{(() => { const Main = compiled(markup); return <Main />; })()}</>);
const click = (element: Element) => act(async () => fireEvent.click(element));
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent;
const tabs = () => screen.getAllByRole("tab").map((t) => `${t.textContent}${t.getAttribute("aria-selected") === "true" ? "*" : ""}`);

describe("Tabs", () => {
  test("headers from TabItems and an Items; the active panel; IDs inside a tab are visible outside", async () => {
    show(`
      <App var.extra="{['C', 'D']}">
        <Tabs>
          <TabItem label="A"><TextBox id="name" initialValue="Ann"/></TabItem>
          <TabItem label="B"><Text>panel B</Text></TabItem>
          <Items data="{extra}"><TabItem label="{$item}"><Text>panel {$item}</Text></TabItem></Items>
        </Tabs>
        <Text>name: {name.value}</Text>
      </App>`);
    expect(tabs()).toEqual(["A*", "B", "C", "D"]);
    expect(text("name:")).toBe("name: Ann");
    expect(screen.queryByText("panel B")).toBeNull();
    await click(screen.getByRole("tab", { name: "D" }));
    expect(tabs()).toEqual(["A", "B", "C", "D*"]);
    expect(screen.getByText("panel D")).toBeTruthy();
  });

  test("activeTab, didChange(index, id, label), the API, activated/deactivated, a bound label", async () => {
    show(`
      <App var.log="" var.second="Second">
        <Tabs id="t" activeTab="1" onDidChange="(i, id, label) => log += i + ':' + id + ':' + label + ';'">
          <TabItem id="one" label="First" onActivated="log += 'a1;'" onDeactivated="log += 'd1;'"/>
          <TabItem label="{second}" onActivated="log += 'a2;'"/>
          <TabItem label="Third"/>
        </Tabs>
        <Button label="Next" onClick="t.next()"/>
        <Button label="ById" onClick="t.setActiveTabById('one')"/>
        <Button label="Rename" onClick="second = 'Renamed'"/>
        <Text>log: {log}</Text>
        <Text>index: {t.activeTabIndex}</Text>
      </App>`);
    expect(tabs()).toEqual(["First", "Second*", "Third"]);
    await waitFor(() => expect(text("log:")).toBe("log: a2;"));
    await click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(text("log:")).toBe("log: a2;2:2:Third;"));
    expect(text("index:")).toBe("index: 2");
    await click(screen.getByRole("button", { name: "ById" }));
    // The item's activated runs before the Tabs' didChange (child effects first).
    await waitFor(() => expect(text("log:")).toBe("log: a2;2:2:Third;a1;0:one:First;"));
    await click(screen.getByRole("button", { name: "Rename" }));
    expect(tabs()).toEqual(["First*", "Renamed", "Third"]);
  });

  test("headerTemplate with $header, on the Tabs and on one TabItem", () => {
    show(`
      <App>
        <Tabs>
          <property name="headerTemplate"><Text>#{$header.index} {$header.label}{$header.isActive ? '!' : ''}</Text></property>
          <TabItem label="A"/>
          <TabItem label="B"><property name="headerTemplate"><Text>own {$header.label}</Text></property></TabItem>
        </Tabs>
      </App>`);
    expect(tabs()).toEqual(["#0 A!*", "own B"]);
  });

  test("keepMounted keeps an inactive panel's state; without it a panel starts fresh", async () => {
    for (const keep of [true, false]) {
      const { unmount } = show(`
        <App>
          <Tabs keepMounted="${keep}">
            <TabItem label="A"><Stack var.n="{0}"><Button label="Inc" onClick="n++"/><Text>n: {n}</Text></Stack></TabItem>
            <TabItem label="B"/>
          </Tabs>
        </App>`);
      await click(screen.getByRole("button", { name: "Inc" }));
      await click(screen.getByRole("tab", { name: "B" }));
      await click(screen.getByRole("tab", { name: "A" }));
      expect(text("n:")).toBe(keep ? "n: 1" : "n: 0");
      unmount();
    }
  });

  test("accordionView: stacked headers, one open", async () => {
    show(`
      <App>
        <Tabs accordionView="true">
          <TabItem label="A"><Text>content A</Text></TabItem>
          <TabItem label="B"><Text>content B</Text></TabItem>
        </Tabs>
      </App>`);
    expect(screen.getByText("content A")).toBeTruthy();
    await click(screen.getByRole("button", { name: "B" }));
    await waitFor(() => expect(screen.getByText("content B")).toBeTruthy());
    expect(screen.queryByText("content A")).toBeNull();
  });

  test("the prerender has the headers and the active panel", () => {
    const { html } = renderStatic(compiled('<App><Tabs activeTab="1"><TabItem label="A"><Text>PANEL-ONE</Text></TabItem><TabItem label="B"><Text>PANEL-TWO</Text></TabItem></Tabs></App>'));
    expect(html).toMatch(/role="tab"[^>]*>.*A.*<\/button>/s);
    expect(html).toContain("PANEL-TWO");
    expect(html).not.toContain("PANEL-ONE");
  });
});

describe("ExpandableItem", () => {
  test("the summary toggles it; the API; expandedChange; a switch; a summary template", async () => {
    show(`
      <App var.log="">
        <ExpandableItem id="ex" summary="Details" onExpandedChange="(open) => log += open + ';'"><Text>hidden part</Text></ExpandableItem>
        <ExpandableItem withSwitch="true" initiallyExpanded="true"><property name="summary"><Text>Rich summary</Text></property><Text>shown part</Text></ExpandableItem>
        <Button label="Toggle" onClick="ex.toggle()"/>
        <Text>log: {log} {ex.isExpanded}</Text>
      </App>`);
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await click(screen.getByRole("button", { name: "Toggle" }));
    expect(text("log:")).toBe("log: true;false; false");
    expect(screen.getByText("Rich summary")).toBeTruthy();
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(true);
  });
});

describe("Stepper", () => {
  test("headers with states; the active step's content; the API; nonLinear headers; didChange", async () => {
    show(`
      <App var.log="">
        <Stepper id="s" nonLinear="true" onDidChange="(i) => log += i + ';'">
          <Step label="Account" description="Who" completed="true"><Text>step one</Text></Step>
          <Step label="Plan" error="true"><Text>step two</Text></Step>
          <Step label="Pay" icon="checkmark"><Text>step three</Text></Step>
        </Stepper>
        <Button label="Next" onClick="s.next()"/>
        <Button label="Reset" onClick="s.reset()"/>
        <Text>log: {log} at {s.activeStep}</Text>
      </App>`);
    const states = () => [...document.querySelectorAll(".gfui-Step-header")].map((h) => h.getAttribute("data-state"));
    expect(states()).toEqual(["completed", "error", "upcoming"]);
    expect(screen.getByText("step one")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("step two")).toBeTruthy();
    await click(screen.getByText("Pay").closest("button")!);
    expect(screen.getByText("step three")).toBeTruthy();
    expect(screen.getByText("Pay").closest("[aria-current]")?.getAttribute("aria-current")).toBe("step");
    await click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(text("log:")).toBe("log: 1;2;0; at 0"));
  });

  test("vertical: each step's content under its header", () => {
    show('<App><Stepper orientation="vertical"><Step label="One"><Text>c1</Text></Step><Step label="Two"><Text>c2</Text></Step></Stepper></App>');
    const items = [...document.querySelectorAll(".gfui-Stepper-step")];
    expect(items.map((i) => i.textContent)).toEqual(["1Onec1", "2Two"]);
  });
});

describe("Splitter", () => {
  test.each<[input: unknown, expected: string]>([
    [undefined, "50%"],
    ["30%", "30%"],
    ["200px", "200px"],
    ["200", "200px"],
    ["-200px", "calc(100% - 200px)"],
    ["-20%", "80%"],
  ])("splitterSize(%j) = %s", (input, expected) => {
    expect(splitterSize(input, "50%")).toBe(expected);
  });

  test.each<[mode: string, expected: string]>([
    ["preserveRatio", "25%"],
    ["preservePrimary", "100px"],
    ["preserveSecondary", "calc(100% - 300px)"],
  ])("after a drag to 100 of 400 px, %s keeps %s", (mode, expected) => {
    expect(splitterSizeAfterDrag(100, 400, mode)).toBe(expected);
  });

  test("two panes and a separator; sizes and limits as CSS; HSplitter is side by side", () => {
    show('<App><HSplitter initialPrimarySize="30%" minPrimarySize="100px" maxPrimarySize="-100px"><Text>left</Text><Text>right</Text></HSplitter></App>');
    const splitter = document.querySelector<HTMLElement>(".gfui-Splitter")!;
    expect(splitter.dataset.orientation).toBe("horizontal");
    const primary = splitter.querySelector<HTMLElement>('[data-pane="primary"]')!;
    expect([primary.style.flex, primary.style.minWidth, primary.style.maxWidth]).toEqual(["0 0 30%", "100px", "calc(100% - 100px)"]);
    expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("vertical");
    expect(primary.textContent).toBe("left");
  });
});

describe("ScrollViewer, StickyBox, StickySection", () => {
  test("normal scrolls natively; overlay uses the ScrollArea; header and footer templates; sticky elements", () => {
    show(`
      <App>
        <ScrollViewer height="100px"><Text>native</Text></ScrollViewer>
        <ScrollViewer height="100px" scrollStyle="overlay">
          <property name="headerTemplate"><Text>head</Text></property>
          <property name="footerTemplate"><Text>foot</Text></property>
          <StickySection><Text>section</Text></StickySection>
        </ScrollViewer>
        <StickyBox to="bottom"><Text>bar</Text></StickyBox>
      </App>`);
    const [native, overlay] = document.querySelectorAll(".gfui-ScrollViewer");
    expect(native!.querySelector(".mantine-ScrollArea-root")).toBeNull();
    expect(overlay!.querySelector(".mantine-ScrollArea-root")).not.toBeNull();
    expect(overlay!.firstElementChild!.textContent).toBe("head");
    expect(overlay!.lastElementChild!.textContent).toBe("foot");
    expect(document.querySelector(".gfui-StickyBox")!.getAttribute("data-to")).toBe("bottom");
    expect(document.querySelector(".gfui-StickySection")!.getAttribute("data-to")).toBe("top");
  });
});

describe("ResponsiveBar", () => {
  test.each<[sizes: number[], available: number, expected: number]>([
    [[50, 50, 50], 200, 3],
    [[50, 50, 50], 170, 3],
    [[50, 50, 50], 120, 1],
    [[50, 50, 50], 30, 0],
  ])("fittingCount(%j, %i) with gap 10 and a 40 px menu = %i", (sizes, available, expected) => {
    expect(fittingCount(sizes, available, 10, 40)).toBe(expected);
  });

  test("without layout (a server render, jsdom) every child is in the bar, with $overflow false", () => {
    show("<App><ResponsiveBar><Button label=\"{'one ' + $overflow}\"/><Button label=\"{'two ' + $overflow}\"/></ResponsiveBar></App>");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["one false", "two false"]);
    expect(document.querySelector(".gfui-ResponsiveBar-overflow")).toBeNull();
  });
});

test("no runtime errors", () => {
  expect(errors).toEqual([]);
});
