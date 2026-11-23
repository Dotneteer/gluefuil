// File scopes and component APIs (step 8).
import { act, cleanup, render } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { useComputed } from "../../src/reactivity/react";
import { createScope } from "../../src/reactivity/scope";
import { signal } from "../../src/reactivity/signals";
import { apiRegistrar, createFileScope, useComponentApi, type RegisterApi } from "../../src/render/component-api";
import { Bound } from "../../src/render/elements";

afterEach(cleanup);

describe("file scope", () => {
  test("each ID reads its API signal; undefined until registered; read-only", () => {
    const scope = createFileScope(createScope({ delay: { value: 1 } }), ["box"]) as Record<string, unknown>;
    expect(scope.box).toBeUndefined();
    expect(scope.delay).toBe(1); // inherits the parent
    const api = { value: "x" };
    apiRegistrar(scope, "box")(api);
    expect(scope.box).toBe(api);
    expect(() => {
      scope.box = {};
    }).toThrow(TypeError);
  });

  test("nested scopes reach the file scope's registrars", () => {
    const file = createFileScope(createScope({}), ["box"]);
    const nested = createScope({ v: { value: 1 } }, file);
    apiRegistrar(nested, "box")({ value: 1 });
    expect((file as Record<string, unknown>).box).toEqual({ value: 1 });
    expect(() => apiRegistrar(nested, "missing")).toThrow(/No component ID/);
  });
});

describe("Bound with an id", () => {
  function Counter({ registerApi }: { registerApi?: RegisterApi }) {
    const [count] = useMemo(() => [signal(0)], []);
    const api = useMemo(
      () => ({
        get count() {
          return count.get();
        },
        increment() {
          count.set(count.peek() + 1);
        },
      }),
      [count],
    );
    useComponentApi(registerApi, api);
    return null;
  }

  test("the API is registered after mount and cleared on unmount; reads are reactive", () => {
    const file = createFileScope(createScope({}), ["counter"]) as Record<string, { count: number; increment(): void } | undefined>;
    function Reader() {
      const [value] = useComputed(() => [file.counter?.count ?? "none"], []);
      return <span data-testid="reader">{String(value)}</span>;
    }
    const view = render(
      <>
        <Reader />
        <Bound type={Counter} bindings={{}} id="counter" scope={file} />
      </>,
    );
    expect(view.getByTestId("reader").textContent).toBe("0");
    act(() => file.counter!.increment());
    expect(view.getByTestId("reader").textContent).toBe("1");
    view.rerender(<Reader />);
    expect(view.getByTestId("reader").textContent).toBe("none");
    expect(file.counter).toBeUndefined();
  });

  test("the published API is frozen", () => {
    const file = createFileScope(createScope({}), ["counter"]) as Record<string, object | undefined>;
    render(<Bound type={Counter} bindings={{}} id="counter" scope={file} />);
    expect(Object.isFrozen(file.counter)).toBe(true);
  });

  test("a component without an id gets no registerApi prop", () => {
    let received: unknown = "unset";
    function Probe(props: { registerApi?: RegisterApi }) {
      received = props.registerApi;
      return null;
    }
    render(<Bound type={Probe} bindings={{}} scope={createScope({})} />);
    expect(received).toBeUndefined();
  });
});
