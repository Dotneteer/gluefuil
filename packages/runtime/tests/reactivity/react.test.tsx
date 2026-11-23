// React integration: subscriptions, StrictMode, unmounting, server rendering,
// tearing under concurrent rendering, and a compiled binding driving a component.
import { act, cleanup, render, screen } from "@testing-library/react";
import { Component, StrictMode, startTransition, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { shallowEqual, useComputed, useSignal } from "../../src/reactivity/react";
import { createScope } from "../../src/reactivity/scope";
import { computed, observerCount, signal } from "../../src/reactivity/signals";
import { bind } from "./scenario";

afterEach(cleanup);

describe("useSignal and useComputed", () => {
  test("a component re-renders when what it reads changes, and only then", () => {
    const a = signal(1);
    const b = signal(1);
    let renders = 0;
    function View() {
      const value = useComputed(() => a.get() * 10, []);
      renders++;
      return <span data-testid="v">{value}</span>;
    }
    render(<View />);
    act(() => a.set(2));
    expect(screen.getByTestId("v").textContent).toBe("20");
    act(() => b.set(2));
    expect(renders).toBe(2);
  });

  test("shallow equality: a new array with the same values does not re-render", () => {
    const a = signal(1);
    const b = signal(1);
    let renders = 0;
    function View() {
      const [x] = useComputed(() => [a.get() > 0, b.get()], []);
      renders++;
      return <span>{String(x)}</span>;
    }
    render(<View />);
    act(() => a.set(5));
    expect(renders).toBe(1);
  });

  test("props are inputs: a change creates a new computed", () => {
    const s = signal(2);
    function View({ factor }: { factor: number }) {
      const value = useComputed(() => s.get() * factor, [factor]);
      return <span data-testid="v">{value}</span>;
    }
    const { rerender } = render(<View factor={10} />);
    expect(screen.getByTestId("v").textContent).toBe("20");
    rerender(<View factor={100} />);
    expect(screen.getByTestId("v").textContent).toBe("200");
    act(() => s.set(3));
    expect(screen.getByTestId("v").textContent).toBe("300");
  });

  test("unmounting releases every subscription", () => {
    const s = signal(1);
    const derived = computed(() => s.get() + 1);
    function View() {
      return <span>{useSignal(derived)}</span>;
    }
    const { unmount } = render(<View />);
    expect(observerCount(s)).toBe(1);
    unmount();
    expect(observerCount(s)).toBe(0);
    expect(observerCount(derived)).toBe(0);
  });

  test("StrictMode (double render, double effects) leaves exactly one subscription", () => {
    const s = signal(1);
    function View() {
      const value = useComputed(() => s.get(), []);
      return <span data-testid="v">{value}</span>;
    }
    render(
      <StrictMode>
        <View />
      </StrictMode>,
    );
    expect(observerCount(s)).toBe(1);
    act(() => s.set(7));
    expect(screen.getByTestId("v").textContent).toBe("7");
  });

  test("an error in a binding reaches the error boundary", () => {
    const s = signal(1);
    class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
      override state: { error?: Error } = {};
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      override render() {
        return this.state.error ? <span data-testid="e">{this.state.error.message}</span> : this.props.children;
      }
    }
    function View() {
      const value = useComputed(() => {
        if (s.get() > 1) throw new Error("too big");
        return s.get();
      }, []);
      return <span>{value}</span>;
    }
    const original = console.error;
    console.error = () => {};
    try {
      render(
        <Boundary>
          <View />
        </Boundary>,
      );
      act(() => s.set(2));
      expect(screen.getByTestId("e").textContent).toBe("too big");
    } finally {
      console.error = original;
    }
  });

  test("server rendering reads the current values", () => {
    const s = signal("server");
    function View() {
      return <p>{useSignal(s)}</p>;
    }
    expect(renderToString(<View />)).toBe("<p>server</p>");
  });
});

test("a compiled binding (step 3) driving a component", () => {
  const count = signal(1);
  const items = signal([{ price: 5 }, { price: 50 }]);
  const scope = createScope({ count: { signal: count }, items: { signal: items }, unit: { value: "€" } });
  const binding = bind("Total: {items.filter(i => i.price > count).length * count} {unit}", ["count", "items", "unit"]);
  function View() {
    const [text] = useComputed(() => [binding(scope)], []);
    return <span data-testid="v">{String(text)}</span>;
  }
  render(<View />);
  expect(screen.getByTestId("v").textContent).toBe("Total: 2 €");
  act(() => count.set(10));
  expect(screen.getByTestId("v").textContent).toBe("Total: 10 €");
  act(() => items.set([...items.peek(), { price: 100 }]));
  expect(screen.getByTestId("v").textContent).toBe("Total: 20 €");
});

describe("tearing under concurrent rendering", () => {
  const ROWS = 40;

  function busy(ms: number) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      // simulate an expensive render, so React yields between components
    }
  }

  /** Mounts ROWS slow components in a transition and changes the store while React is yielding. */
  async function mountWhileChanging(Row: (props: { s: ReturnType<typeof signal<number>> }) => ReactNode) {
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = false;
    const s = signal(0);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      startTransition(() => root.render(Array.from({ length: ROWS }, (_, i) => <Row key={i} s={s} />)));
      setTimeout(() => s.set(1), 15);
      await new Promise((resolve) => setTimeout(resolve, ROWS * 2 + 200));
      return [...container.querySelectorAll("span")].map((e) => e.textContent);
    } finally {
      root.unmount();
      g.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  }

  test("control: reading the store directly in render tears (so the test can detect tearing)", async () => {
    function Row({ s }: { s: ReturnType<typeof signal<number>> }) {
      // The naive binding: read the external value during render.
      busy(2);
      return <span>{s.peek()}</span>;
    }
    const values = await mountWhileChanging(Row);
    expect(values).toHaveLength(ROWS);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  test("useSignal: every component shows the same value", async () => {
    function Row({ s }: { s: ReturnType<typeof signal<number>> }) {
      const value = useSignal(s);
      busy(2);
      return <span>{value}</span>;
    }
    const values = await mountWhileChanging(Row);
    expect(values).toHaveLength(ROWS);
    expect(new Set(values)).toEqual(new Set(["1"]));
  });
});

test("shallowEqual", () => {
  expect(shallowEqual([1, "a"], [1, "a"])).toBe(true);
  expect(shallowEqual([1], [1, 2])).toBe(false);
  expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
  expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
  expect(shallowEqual([NaN], [NaN])).toBe(true);
  expect(shallowEqual(new Date(0), new Date(0))).toBe(false);
});
