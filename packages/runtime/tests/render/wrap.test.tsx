// wrapComponent (step 16): one test per feature, with a fake native component
// that records the props it receives.
import { act, cleanup, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { signal, type Signal } from "../../src/reactivity/signals";
import { coerceLiteral, wrapComponent } from "../../src/render/wrap";

afterEach(cleanup);

let received: Record<string, unknown> = {};
function Native(props: Record<string, unknown> & { children?: ReactNode }) {
  received = props;
  return <div data-testid="native">{props.children}</div>;
}

test.each<[value: unknown, valueType: string | undefined, expected: unknown]>([
  ["true", "boolean", true],
  ["false", "boolean", false],
  ["maybe", "boolean", "maybe"],
  ["3.5", "number", 3.5],
  ["3.5", "integer", 3],
  ["", "number", ""],
  ["x", "number", "x"],
  [true, "boolean", true],
  ["3", "string", "3"],
  ["3", undefined, "3"],
])("coerceLiteral(%j, %s)", (value, valueType, expected) => {
  expect(coerceLiteral(value, valueType)).toEqual(expected);
});

test("forwarding by default; literals typed by the metadata; children pass through", () => {
  const Wrapped = wrapComponent(Native, { props: { count: { valueType: "number" }, open: { valueType: "boolean" } } });
  render(<Wrapped count="3" open="true" title="t" extra={{ a: 1 }}>kid</Wrapped>);
  expect(received).toMatchObject({ count: 3, open: true, title: "t", extra: { a: 1 }, children: "kid" });
});

test("rename: to another prop, or to computed props", () => {
  const Wrapped = wrapComponent(Native, {
    props: { enabled: { valueType: "boolean" } },
    rename: { label: "children2", enabled: (v) => ({ disabled: v === false }) },
  });
  render(<Wrapped label="L" enabled="false" />);
  expect(received).toMatchObject({ children2: "L", disabled: true });
  expect(received).not.toHaveProperty("label");
  expect(received).not.toHaveProperty("enabled");
});

test("events: mapped to the native callback with argument mapping; unconfigured on* handlers get no arguments", () => {
  const onPicked = vi.fn();
  const onClick = vi.fn();
  const Wrapped = wrapComponent(Native, { events: { picked: { prop: "onSelect", args: (item: { id: number }) => [item.id] } } });
  render(<Wrapped onPicked={onPicked} onClick={onClick} />);
  (received.onSelect as (item: { id: number }) => void)({ id: 7 });
  expect(onPicked).toHaveBeenCalledWith(7);
  (received.onClick as (event: unknown) => void)({ nativeEvent: "DOM" });
  expect(onClick).toHaveBeenCalledWith();
  expect(received).not.toHaveProperty("onPicked");
});

test("value: controlled from initialValue; a native change updates it and fires didChange; API value/setValue", () => {
  const onDidChange = vi.fn();
  let api: { value: unknown; setValue(v: unknown): void } | undefined;
  const Wrapped = wrapComponent(Native, {
    value: { prop: "value", change: "onChange", read: (e: { target: { value: string } }) => e.target.value, parse: (v) => String(v ?? "") },
  });
  render(<Wrapped initialValue="hi" onDidChange={onDidChange} registerApi={(a) => (api = a as typeof api)} />);
  expect(received.value).toBe("hi");
  expect(received).not.toHaveProperty("initialValue");
  act(() => (received.onChange as (e: unknown) => void)({ target: { value: "typed" } }));
  expect(received.value).toBe("typed");
  expect(onDidChange).toHaveBeenCalledWith("typed");
  expect(api!.value).toBe("typed");
  act(() => api!.setValue(42));
  expect(received.value).toBe("42");
  expect(onDidChange).toHaveBeenCalledTimes(1); // setValue is not a user change
});

test("api: methods with a ref to the native component", () => {
  const focus = vi.fn();
  const WithRef = forwardRef<{ focus(): void }, Record<string, unknown>>(function WithRef(_, ref) {
    useImperativeHandle(ref, () => ({ focus }));
    return null;
  });
  let api: { focus(): void } | undefined;
  const Wrapped = wrapComponent(WithRef, { withRef: true, api: ({ ref }) => ({ focus: () => (ref.current as { focus(): void }).focus() }) });
  render(<Wrapped registerApi={(a) => (api = a as typeof api)} />);
  api!.focus();
  expect(focus).toHaveBeenCalled();
});

test("templates: a gfui template renderer becomes a native render prop with context variables", () => {
  const renderer = vi.fn((context: Record<string, unknown>) => <span>{String(context.$item)}</span>);
  const Wrapped = wrapComponent(Native, { templates: { optionTemplate: { prop: "renderOption", context: (option: { label: string }) => ({ $item: option.label }) } } });
  render(<Wrapped optionTemplate={renderer} />);
  expect(received).not.toHaveProperty("optionTemplate");
  const rendered = (received.renderOption as (o: { label: string }) => ReactNode)({ label: "A" });
  expect(renderer).toHaveBeenCalledWith({ $item: "A" });
  expect(rendered).toBeTruthy();
});

test("a rename can produce children (label → children); explicit children win", () => {
  const Wrapped = wrapComponent(Native, { rename: { label: (v) => ({ children: v }) } });
  const { rerender } = render(<Wrapped label="from label" />);
  expect(received.children).toBe("from label");
  rerender(<Wrapped label="from label">explicit</Wrapped>);
  expect(received.children).toBe("explicit");
});

test("fixed props and exclusions", () => {
  const Wrapped = wrapComponent(Native, { fixed: { variant: "filled", className: "x" }, exclude: ["secret"] });
  render(<Wrapped secret="s" className="ignored" />);
  expect(received).toMatchObject({ variant: "filled", className: "x" });
  expect(received).not.toHaveProperty("secret");
});

test("a wrapped component without a value still publishes its api", () => {
  const counter: Signal<number> = signal(0);
  let api: Record<string, unknown> | undefined;
  const Wrapped = wrapComponent(Native, { api: () => ({ bump: () => counter.set(counter.peek() + 1) }) });
  render(<Wrapped registerApi={(a) => (api = a as Record<string, unknown>)} />);
  (api!.bump as () => void)();
  expect(counter.peek()).toBe(1);
});
