// The server view, server snapshots, the server breakpoint and mountApp (step 13).
import { act, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { useComputed } from "../../src/reactivity/react";
import { inServerView, isServerView } from "../../src/reactivity/server-view";
import { signal } from "../../src/reactivity/signals";
import { mountApp, PRERENDERED_ATTRIBUTE, READY_ATTRIBUTE } from "../../src/render/mount";
import { breakpointFromName, currentBreakpoint, setServerBreakpoint } from "../../src/render/visibility";
import { renderStatic } from "../../src/server";

afterEach(() => {
  cleanup();
  setServerBreakpoint(0);
});

test("inServerView nests and always restores, even when fn throws", () => {
  expect(isServerView()).toBe(false);
  expect(inServerView(() => inServerView(() => isServerView()))).toBe(true);
  expect(() =>
    inServerView(() => {
      throw new Error("boom");
    }),
  ).toThrow("boom");
  expect(isServerView()).toBe(false);
});

test.each([
  ["xs", 0],
  ["md", 2],
  ["xxl", 5],
  ["huge", undefined],
])("breakpointFromName(%s)", (name, expected) => {
  expect(breakpointFromName(name)).toBe(expected);
});

test("currentBreakpoint: the server breakpoint in the server view, else the live viewport", () => {
  window.innerWidth = 1024; // lg = 3
  setServerBreakpoint(1);
  expect(currentBreakpoint()).toBe(3);
  expect(inServerView(currentBreakpoint)).toBe(1);
});

test("a server render reads useComputed's server snapshot", () => {
  window.innerWidth = 1024;
  setServerBreakpoint(2);
  function Shows() {
    return <span>{useComputed(() => currentBreakpoint(), [])}</span>;
  }
  expect(renderToString(<Shows />)).toBe("<span>2</span>");
});

test("the server snapshot is cached: equal values keep their identity", () => {
  const n = signal(1);
  const seen: unknown[] = [];
  const fn = vi.fn(() => ({ n: n.get() }));
  function Probe() {
    seen.push(useComputed(fn, []));
    return null;
  }
  // renderToString calls getServerSnapshot more than once per render; React
  // warns (console.error) when the results differ.
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  renderToString(<Probe />);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
  expect(seen).toEqual([{ n: 1 }]);
});

test("renderStatic marks the HTML with its breakpoint", () => {
  expect(renderStatic(<b>x</b>, { breakpoint: "md" })).toEqual({ html: "<b>x</b>", attributes: { [PRERENDERED_ATTRIBUTE]: "md", "data-pfui-path": "/" } });
  expect(renderStatic(<b>x</b>, { path: "/about/" }).attributes["data-pfui-path"]).toBe("/about");
  expect(renderStatic(<b>x</b>).attributes[PRERENDERED_ATTRIBUTE]).toBe("xs");
});

test("mountApp: fresh render without the marker; hydration (server breakpoint from the marker) with it", async () => {
  const container = document.createElement("div");
  let root: Root | undefined;
  await act(async () => {
    root = mountApp(container, <i>fresh</i>);
  });
  expect(container.innerHTML).toBe("<i>fresh</i>");
  expect(container.hasAttribute(READY_ATTRIBUTE)).toBe(true);
  act(() => root!.unmount());
  container.removeAttribute(READY_ATTRIBUTE);

  container.innerHTML = "<i>static</i>";
  container.setAttribute(PRERENDERED_ATTRIBUTE, "xl");
  const node = container.firstChild;
  await act(async () => {
    root = mountApp(container, <i>static</i>);
  });
  expect(container.firstChild).toBe(node);
  expect(container.hasAttribute(READY_ATTRIBUTE)).toBe(true);
  expect(inServerView(currentBreakpoint)).toBe(4);
  act(() => root!.unmount());
});

test("mountApp reports hydration mismatches through onRecoverableError", async () => {
  const container = document.createElement("div");
  container.innerHTML = "<i>server</i>";
  container.setAttribute(PRERENDERED_ATTRIBUTE, "xs");
  const errors: unknown[] = [];
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  let root: Root | undefined;
  await act(async () => {
    root = mountApp(container, <i>client</i>, { onRecoverableError: (e) => errors.push(e) });
  });
  error.mockRestore();
  expect(errors.length).toBeGreaterThan(0);
  expect(container.innerHTML).toBe("<i>client</i>");
  act(() => root!.unmount());
});

test("renderStatic also takes a component", () => {
  const Main = () => <b>main</b>;
  expect(renderStatic(Main).html).toBe("<b>main</b>");
});
