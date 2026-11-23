// Step 13 end to end in jsdom: compile, render to static HTML, take over.
import { compileModule } from "@patchfuil/compiler";
import { loadModule, mountApp, PRERENDERED_ATTRIBUTE } from "@patchfuil/runtime";
import { renderStatic } from "@patchfuil/runtime/server";
import { act, fireEvent, screen } from "@testing-library/react";
import { StrictMode, type ComponentType } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import * as components from "../src/index";

function load(markup: string): ComponentType {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  return loadModule(code, { components });
}

let container: HTMLElement;
let root: Root | undefined;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  window.innerWidth = 1024; // lg
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
});

/** Fills the container as the prerender would. */
function prerender(Main: ComponentType, breakpoint?: "xs" | "md" | "xl") {
  const { html, attributes } = renderStatic(<Main />, breakpoint ? { breakpoint } : {});
  container.innerHTML = html;
  for (const [name, value] of Object.entries(attributes)) container.setAttribute(name, value);
}

/** Records every node added to or removed from the container's subtree, and text changes. */
function observe() {
  const changes: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") changes.push(`text: ${record.target.textContent}`);
      for (const node of record.addedNodes) changes.push(`+ ${node.textContent}`);
      for (const node of record.removedNodes) changes.push(`- ${node.textContent}`);
    }
  });
  observer.observe(container, { subtree: true, childList: true, characterData: true });
  return { changes, flush: () => changes.push(...observer.takeRecords().map(() => "(unflushed)")) };
}

async function takeOver(Main: ComponentType, onRecoverableError?: (error: unknown) => void) {
  await act(async () => {
    root = mountApp(container, <StrictMode><Main /></StrictMode>, onRecoverableError ? { onRecoverableError } : {});
  });
}

const texts = () => [...container.querySelectorAll(".pfui-Text")].map((e) => e.textContent);

const COUNTER = `
  <App var.count="{2}" var.items="{['a', 'b']}">
    <Text>count: {count * 10}</Text>
    <Button label="Increment" onClick="count++"/>
    <Items data="{items}"><Text>item {$itemIndex}: {$item}</Text></Items>
    <TextBox id="box" initialValue="hi"/>
    <Text>box: {box.value}</Text>
  </App>`;

test("the static HTML shows the initial state, marked for takeover", () => {
  prerender(load(COUNTER));
  expect(container.getAttribute(PRERENDERED_ATTRIBUTE)).toBe("xs");
  // Component APIs are published after mount (an effect), on the server never:
  // values read through an ID show their pre-mount value (see the next test).
  expect(texts()).toEqual(["count: 20", "item 0: a", "item 1: b", "box: "]);
  expect(container.querySelector("input")!.getAttribute("value")).toBe("hi");
  expect(container.querySelector("button")!.textContent).toBe("Increment");
});

test("takeover reuses every DOM node; the app is interactive afterwards", async () => {
  const Main = load(COUNTER);
  prerender(Main);
  const button = container.querySelector("button")!;
  const { changes } = observe();
  const errors: unknown[] = [];
  await takeOver(Main, (error) => errors.push(error));
  expect(errors).toEqual([]);
  // No node replaced. The one change is the text that reads the TextBox's API,
  // which arrives after mount, as on any client render (not a mismatch).
  expect(changes).toEqual(["text: box: hi"]);
  expect(container.querySelector("button")).toBe(button);

  act(() => fireEvent.click(screen.getByRole("button", { name: "Increment" })));
  expect(texts()[0]).toBe("count: 30");
  act(() => fireEvent.change(container.querySelector("input")!, { target: { value: "typed" } }));
  expect(texts().at(-1)).toBe("box: typed");
});

const RESPONSIVE = `
  <App>
    <Text>static</Text>
    <Text when-md="false">compact</Text>
    <Text when="false" when-md="true">wide</Text>
  </App>`;

test("a responsive when renders for the prerender breakpoint, then switches after takeover; nothing else changes", async () => {
  const Main = load(RESPONSIVE);
  prerender(Main, "xs");
  expect(texts()).toEqual(["static", "compact"]);
  const staticText = container.querySelector(".pfui-Text");
  const { changes } = observe();
  const errors: unknown[] = [];
  await takeOver(Main, (error) => errors.push(error));
  // This client is lg: the server snapshot hydrated "compact" without a
  // mismatch, then only the When subtrees updated.
  expect(errors).toEqual([]);
  expect(texts()).toEqual(["static", "wide"]);
  expect(changes.sort()).toEqual(["+ wide", "- compact"]);
  expect(container.querySelector(".pfui-Text")).toBe(staticText);
});

test("prerendered for the client's own breakpoint: no change at all", async () => {
  const Main = load(RESPONSIVE);
  prerender(Main, "xl");
  expect(texts()).toEqual(["static", "wide"]);
  const { changes } = observe();
  await takeOver(Main);
  expect(changes).toEqual([]);
});

test("the live breakpoint is used again after takeover", async () => {
  const Main = load(RESPONSIVE);
  prerender(Main, "xs");
  await takeOver(Main);
  await act(async () => {
    window.innerWidth = 500;
    window.dispatchEvent(new Event("resize"));
  });
  expect(texts()).toEqual(["static", "compact"]);
});

test("a nondeterministic initializer is caught as a recoverable hydration error", async () => {
  const Main = load(`<App var.n="{Math.random()}"><Text>{n}</Text></App>`);
  prerender(Main);
  const errors: unknown[] = [];
  await takeOver(Main, (error) => errors.push(error));
  expect(errors.length).toBeGreaterThan(0);
  // React recovers by rendering on the client: the app still works.
  expect(texts()).toHaveLength(1);
});

test("a container without the marker gets a fresh render", async () => {
  container.innerHTML = "";
  await takeOver(load(COUNTER));
  expect(texts()[0]).toBe("count: 20");
});

test("renderStatic refuses an unknown breakpoint", () => {
  expect(() => renderStatic(<div />, { breakpoint: "huge" as "xs" })).toThrow("Unknown breakpoint 'huge'; expected one of xs, sm, md, lg, xl, xxl");
});
