// Render counts for the step 4 scenario (see scenario.tsx), per option.
// The tables are the evidence for the decision recorded in architecture.md.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { createReactStateApp, createSignalsApp, type RenderCounts } from "./scenario";

// Without Vitest globals, Testing Library cannot register its automatic cleanup.
afterEach(cleanup);

const COMPONENTS = ["app", "count", "name", "outer", "inner", "deep", "double", "inc", "rename", "both"];

/** Renders the app, clicks `button`, and returns how often each component rendered for the click. */
function rendersFor(App: () => React.ReactNode, renders: RenderCounts, button: string): Record<string, number> {
  render(<App />);
  for (const key of Object.keys(renders)) delete renders[key];
  act(() => {
    fireEvent.click(screen.getByText(button));
  });
  return Object.fromEntries(COMPONENTS.map((id) => [id, renders[id] ?? 0]));
}

const texts = () => ["count", "name", "deep", "double"].map((id) => screen.getByTestId(id).textContent);

describe("(a) signals", () => {
  test("initial render", () => {
    const renders: RenderCounts = {};
    const App = createSignalsApp(renders);
    render(<App />);
    expect(texts()).toEqual(["0", "a", "1", "0"]);
    for (const id of COMPONENTS) expect(renders[id], id).toBe(1);
  });

  test("count++: only the three texts that read count (directly or derived) re-render", () => {
    const renders: RenderCounts = {};
    expect(rendersFor(createSignalsApp(renders), renders, "inc")).toEqual({
      app: 0, count: 1, name: 0, outer: 0, inner: 0, deep: 1, double: 1, inc: 0, rename: 0, both: 0,
    });
    expect(texts()).toEqual(["1", "a", "2", "2"]);
  });

  test("an independent sibling: changing name re-renders only its text", () => {
    const renders: RenderCounts = {};
    expect(rendersFor(createSignalsApp(renders), renders, "rename")).toEqual({
      app: 0, count: 0, name: 1, outer: 0, inner: 0, deep: 0, double: 0, inc: 0, rename: 0, both: 0,
    });
    expect(texts()).toEqual(["0", "a!", "1", "0"]);
  });

  test("a batched handler re-renders each affected component once", () => {
    const renders: RenderCounts = {};
    expect(rendersFor(createSignalsApp(renders), renders, "both")).toEqual({
      app: 0, count: 1, name: 1, outer: 0, inner: 0, deep: 1, double: 1, inc: 0, rename: 0, both: 0,
    });
    expect(texts()).toEqual(["1", "a!", "2", "2"]);
  });
});

describe("(b) plain React state, naive", () => {
  test("count++ re-renders the whole tree", () => {
    const renders: RenderCounts = {};
    expect(rendersFor(createReactStateApp(renders, { memo: false }), renders, "inc")).toEqual({
      app: 1, count: 1, name: 1, outer: 1, inner: 1, deep: 1, double: 1, inc: 1, rename: 1, both: 1,
    });
    expect(texts()).toEqual(["1", "a", "2", "2"]);
  });

  test("changing name re-renders the whole tree too", () => {
    const renders: RenderCounts = {};
    expect(rendersFor(createReactStateApp(renders, { memo: false }), renders, "rename")).toEqual({
      app: 1, count: 1, name: 1, outer: 1, inner: 1, deep: 1, double: 1, inc: 1, rename: 1, both: 1,
    });
  });
});

describe("(b) plain React state, every component memoized", () => {
  test("count++: the declaring component, the containers and the handlers' buttons still re-render", () => {
    const renders: RenderCounts = {};
    // Stacks re-render because `children` is a new element each time; buttons
    // because their handlers are new closures (useCallback would be needed).
    expect(rendersFor(createReactStateApp(renders, { memo: true }), renders, "inc")).toEqual({
      app: 1, count: 1, name: 0, outer: 1, inner: 1, deep: 1, double: 1, inc: 1, rename: 1, both: 1,
    });
  });
});
