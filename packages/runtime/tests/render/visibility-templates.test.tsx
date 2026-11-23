// Step 10 runtime: visibility (`when`, `when-*`), templates, lifecycle.
import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createScope } from "../../src/reactivity/scope";
import { signal } from "../../src/reactivity/signals";
import { Bound } from "../../src/render/elements";
import type { HandlerFactory } from "../../src/render/elements";
import { templateRenderer, type TemplateRenderer } from "../../src/render/templates";
import { breakpoint, breakpointIndex, resolveVisibility, When } from "../../src/render/visibility";

afterEach(cleanup);

describe("resolveVisibility (the table in XMLUI visibility.md)", () => {
  const XS = 0;
  const MD = 2;
  test.each<[when: boolean | undefined, xs: boolean | undefined, md: boolean | undefined, atXs: boolean, atMd: boolean]>([
    [undefined, undefined, undefined, true, true],
    [false, undefined, undefined, false, false],
    [undefined, undefined, true, false, true],
    [undefined, undefined, false, true, false],
    [undefined, true, undefined, true, true],
    [undefined, true, false, true, false],
    [undefined, false, true, false, true],
    [false, undefined, true, false, true],
    [true, undefined, false, true, false],
  ])("when=%s when-xs=%s when-md=%s → xs: %s, md: %s", (when, xs, md, atXs, atMd) => {
    const rules = { ...(xs === undefined ? {} : { xs }), ...(md === undefined ? {} : { md }) };
    expect(resolveVisibility(XS, when, rules)).toBe(atXs);
    expect(resolveVisibility(MD, when, rules)).toBe(atMd);
  });

  test("only between sm and lg (when=false, when-sm=true, when-xl=false)", () => {
    const rules = { sm: true, xl: false };
    expect([0, 1, 2, 3, 4, 5].map((bp) => resolveVisibility(bp, false, rules))).toEqual([false, true, true, true, false, false]);
  });
});

test.each<[width: number, index: number]>([
  [0, 0],
  [575, 0],
  [576, 1],
  [768, 2],
  [991, 2],
  [992, 3],
  [1200, 4],
  [1400, 5],
  [5000, 5],
])("breakpointIndex(%i) = %i", (width, index) => {
  expect(breakpointIndex(width)).toBe(index);
});

test("the breakpoint signal follows window resizes", () => {
  const bp = breakpoint();
  act(() => {
    window.innerWidth = 800;
    window.dispatchEvent(new Event("resize"));
  });
  expect(bp.peek()).toBe(2);
  act(() => {
    window.innerWidth = 400;
    window.dispatchEvent(new Event("resize"));
  });
  expect(bp.peek()).toBe(0);
});

describe("When", () => {
  test("renders its child only while the condition holds; the hidden child's component never runs", () => {
    const show = signal(false);
    const scope = createScope({ show: { signal: show } });
    const renders = vi.fn();
    function Child() {
      renders();
      return <span>child</span>;
    }
    render(
      <When test={(s) => (s as { show: boolean }).show} scope={scope}>
        <Child />
      </When>,
    );
    expect(screen.queryByText("child")).toBeNull();
    expect(renders).not.toHaveBeenCalled();
    act(() => show.set(true));
    expect(screen.getByText("child")).toBeDefined();
    act(() => show.set(false));
    expect(screen.queryByText("child")).toBeNull();
  });

  test("responsive rules follow the viewport", () => {
    act(() => {
      window.innerWidth = 400;
      window.dispatchEvent(new Event("resize"));
    });
    render(
      <When responsive={{ md: true }} scope={createScope({})}>
        <span>wide only</span>
      </When>,
    );
    expect(screen.queryByText("wide only")).toBeNull();
    act(() => {
      window.innerWidth = 1000;
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByText("wide only")).toBeDefined();
  });
});

describe("templates", () => {
  function List({ data, itemTemplate }: { data: string[]; itemTemplate: TemplateRenderer }) {
    return <>{data.map((item, i) => itemTemplate({ $item: item, $itemIndex: i }, i))}</>;
  }
  const Label = ({ text }: { text?: unknown }) => <span data-testid="item">{String(text)}</span>;

  test("context variables are reactive, and instances are not recreated when the context changes", () => {
    const created = vi.fn();
    const parent = createScope({});
    const renderer = templateRenderer(parent, (scope) => {
      created(scope);
      return (
        <Bound
          type={Label}
          bindings={{ text: (s) => `${(s as { $itemIndex: number }).$itemIndex}:${(s as { $item: string }).$item}` }}
          scope={scope}
        />
      );
    });
    const view = render(<List data={["a", "b"]} itemTemplate={renderer} />);
    expect(view.getAllByTestId("item").map((e) => e.textContent)).toEqual(["0:a", "1:b"]);
    const firstScopes = new Set(created.mock.calls.map(([scope]) => scope));
    view.rerender(<List data={["x", "b", "c"]} itemTemplate={renderer} />);
    expect(view.getAllByTestId("item").map((e) => e.textContent)).toEqual(["0:x", "1:b", "2:c"]);
    // Items 0 and 1 kept their scope objects; only item 2 got a new one.
    const allScopes = new Set(created.mock.calls.map(([scope]) => scope));
    expect(allScopes.size).toBe(firstScopes.size + 1);
  });

  test("the template scope inherits the element's scope", () => {
    const parent = createScope({ prefix: { value: "#" } });
    const renderer = templateRenderer(parent, (scope) => (
      <Bound type={Label} bindings={{ text: (s) => `${(s as { prefix: string }).prefix}${(s as { $item: string }).$item}` }} scope={scope} />
    ));
    const view = render(<List data={["a"]} itemTemplate={renderer} />);
    expect(view.getByTestId("item").textContent).toBe("#a");
  });
});

describe("lifecycle (onMount / onUnmount)", () => {
  function setup() {
    const log: string[] = [];
    const scope = createScope({ log: { value: log } });
    const factory = (event: string): HandlerFactory => () => () => () => {
      log.push(event);
    };
    const lifecycle = { mount: factory("mount"), unmount: factory("unmount") };
    const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    return { log, scope, lifecycle, Box };
  }
  const microtask = () => act(async () => {});

  test("mount after render, unmount after removal", async () => {
    const { log, scope, lifecycle, Box } = setup();
    const view = render(<Bound type={Box} bindings={{}} lifecycle={lifecycle} scope={scope} />);
    expect(log).toEqual(["mount"]);
    view.unmount();
    await microtask();
    expect(log).toEqual(["mount", "unmount"]);
  });

  test("StrictMode's simulated remount fires each handler once", async () => {
    const { log, scope, lifecycle, Box } = setup();
    const view = render(
      <StrictMode>
        <Bound type={Box} bindings={{}} lifecycle={lifecycle} scope={scope} />
      </StrictMode>,
    );
    await microtask();
    expect(log).toEqual(["mount"]);
    view.unmount();
    await microtask();
    expect(log).toEqual(["mount", "unmount"]);
  });

  test("with When: each transition fires the matching handler", async () => {
    const { log, scope, lifecycle, Box } = setup();
    const show = signal(false);
    const conditionScope = createScope({ show: { signal: show } }, scope);
    render(
      <When test={(s) => (s as { show: boolean }).show} scope={conditionScope}>
        <Bound type={Box} bindings={{}} lifecycle={lifecycle} scope={scope} />
      </When>,
    );
    expect(log).toEqual([]); // starts hidden: no mount
    act(() => show.set(true));
    act(() => show.set(false));
    await microtask();
    act(() => show.set(true));
    await microtask();
    expect(log).toEqual(["mount", "unmount", "mount"]);
  });
});
