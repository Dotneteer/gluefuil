// Bound, TextNode and loadModule. Compiled modules use them (see compiler src/module/).
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { createScope } from "../../src/reactivity/scope";
import { signal } from "../../src/reactivity/signals";
import { Bound, TextNode } from "../../src/render/elements";
import { loadModule } from "../../src/render/module";
import { BindingError } from "../../src/script/binding-value";

afterEach(cleanup);

describe("Bound", () => {
  test("renders the component with constant props and binding values", () => {
    function Box(props: Record<string, unknown>) {
      return <span data-testid="box">{JSON.stringify(props)}</span>;
    }
    const bindings = { b: () => 2 };
    render(<Bound type={Box} props={{ a: 1 }} bindings={bindings} scope={{}} />);
    expect(screen.getByTestId("box").textContent).toBe('{"a":1,"b":2}');
  });

  test("re-renders the component when a value it binds changes, and only then", () => {
    const count = signal(1);
    const other = signal(1);
    const scope = createScope({ count: { signal: count }, other: { signal: other } });
    let renders = 0;
    function Label({ value }: { value?: unknown }) {
      renders++;
      return <span data-testid="label">{String(value)}</span>;
    }
    const bindings = { value: (s: object) => (s as { count: number }).count * 10 };
    render(<Bound type={Label} bindings={bindings} scope={scope} />);
    act(() => count.set(2));
    expect(screen.getByTestId("label").textContent).toBe("20");
    act(() => other.set(2));
    expect(renders).toBe(2);
  });

  test("passes children through", () => {
    function Wrap({ children }: { children?: React.ReactNode }) {
      return <div data-testid="wrap">{children}</div>;
    }
    render(
      <Bound type={Wrap} bindings={{}} scope={{}}>
        <i>child</i>
      </Bound>,
    );
    expect(screen.getByTestId("wrap").innerHTML).toBe("<i>child</i>");
  });

  test("a binding that produces a promise throws a BindingError", () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Bound type={TextNode} bindings={{ value: () => Promise.resolve(1) }} scope={{}} />)).toThrow(BindingError);
    } finally {
      console.error = original;
    }
  });
});

test.each<[value: unknown, text: string]>([
  ["text", "text"],
  [42, "42"],
  [false, "false"],
  [null, ""],
  [undefined, ""],
])("TextNode renders %j as %j", (value, text) => {
  expect(render(<p>{<TextNode value={value} />}</p>).container.textContent).toBe(text);
});

test("loadModule passes the runtime and the components to the module", () => {
  const code = `
    const { createElement: $$h } = $$imports.runtime;
    const { Hello } = $$imports.components;
    function Main() { return $$h(Hello, { name: "gfui" }); }
    return Main;`;
  const Main = loadModule(code, { components: { Hello: ({ name }: { name: string }) => <b>hi {name}</b> } });
  expect(render(<Main />).container.innerHTML).toBe("<b>hi gfui</b>");
});
