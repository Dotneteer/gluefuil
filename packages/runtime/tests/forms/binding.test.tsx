// Step 22: wrapComponent and a field binding, and the context scope.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, test } from "vitest";
import { FieldBindingProvider, useFieldBinding } from "../../src/forms/react";
import { DEFAULT_FIELD_OPTIONS, FormStore } from "../../src/forms/store";
import { createContextScope, provideContext } from "../../src/render/context-scope";
import { createScope } from "../../src/reactivity/scope";
import type { TemplateRenderer } from "../../src/render/templates";
import { wrapComponent } from "../../src/render/wrap";

afterEach(cleanup);

/** A native input that also renders an option template and children. */
function NativeInput(props: { value?: string; onChange?: (e: { currentTarget: { value: string } }) => void; renderOption?: () => ReactNode; children?: ReactNode; disabled?: boolean }) {
  return createElement(
    "div",
    null,
    createElement("input", { "aria-label": "native", value: props.value ?? "", disabled: props.disabled, onChange: (e: { currentTarget: { value: string } }) => props.onChange?.(e) }),
    props.renderOption?.(),
    props.children,
  );
}

const Input = wrapComponent(NativeInput as never, {
  value: { prop: "value", change: "onChange", read: (e: { currentTarget: { value: string } }) => e.currentTarget.value },
  templates: { optionTemplate: { prop: "renderOption", context: () => ({}) } },
  rename: { enabled: (enabled) => ({ disabled: enabled === false }) },
});

/** Shows whether it sees a binding. */
function Probe({ label }: { label: string }) {
  return createElement("span", { "data-testid": label }, useFieldBinding() ? "bound" : "free");
}

test("a bound input reads and writes its field; its template and children don't see the binding", async () => {
  const store = new FormStore({ name: "Ann" });
  const field = store.createField({ ...DEFAULT_FIELD_OPTIONS, path: "name" });
  field.attach();
  const template: TemplateRenderer = () => createElement(Probe, { label: "template" });
  render(createElement(FieldBindingProvider, { binding: { field, messagesId: "m" } }, createElement(Input, { optionTemplate: template }, createElement(Probe, { label: "children" }))));
  const input = screen.getByLabelText("native") as HTMLInputElement;
  expect(input.value).toBe("Ann");
  await act(async () => fireEvent.change(input, { target: { value: "Bob" } }));
  expect(store.getData()).toEqual({ name: "Bob" });
  expect(screen.getByTestId("template").textContent).toBe("free");
  expect(screen.getByTestId("children").textContent).toBe("free");
  // A submitting form disables it.
  await act(async () => store.submitting.set(true));
  expect(input.disabled).toBe(true);
});

test("the context scope: getters read what the component provides; undefined before", () => {
  const parent = createScope({ outer: { value: 1 } });
  const scope = createContextScope(parent, ["$data"]) as Record<string, unknown>;
  expect(scope.$data).toBeUndefined();
  expect(scope.outer).toBe(1);
  provideContext(scope, { $data: () => ({ a: 1 }) });
  expect(scope.$data).toEqual({ a: 1 });
  expect(Object.isFrozen(scope)).toBe(true);
  // Not a context scope: nothing happens.
  provideContext({}, { $data: () => 1 });
});
