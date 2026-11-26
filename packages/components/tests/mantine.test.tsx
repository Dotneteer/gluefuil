// Step 16 in jsdom: the Mantine-based components through compiled markup.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(cleanup);

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const text = (pattern: RegExp) => screen.getByText(pattern).textContent;
const click = (element: Element) => act(async () => fireEvent.click(element));

test("Button: Mantine's button; click reaches the handler (a pointer snapshot, no DOM event); enabled=false disables it", async () => {
  show(`
    <App var.got="none">
      <Button label="Go" onClick="(...a) => got = String(a.length) + ':' + Object.keys(a[0]).join('|')"/>
      <Button label="Off" enabled="false"/>
      <Text>got: {got}</Text>
    </App>`);
  await click(screen.getByRole("button", { name: "Go" }));
  expect(text(/^got:/)).toBe("got: 1:clientX|clientY|button|shiftKey|ctrlKey|altKey|metaKey");
  expect(screen.getByRole("button", { name: "Off" }).hasAttribute("disabled")).toBe(true);
});

test("TextBox (Mantine TextInput): initialValue, typing fires didChange and updates its API value; setValue and focus", async () => {
  show(`
    <App var.log="">
      <TextBox id="box" initialValue="start" placeholder="type" onDidChange="(v) => log = 'changed to ' + v"/>
      <Text>value: {box.value}</Text>
      <Text>log: {log}</Text>
      <Button label="Set" onClick="box.setValue('from api'); box.focus()"/>
    </App>`);
  const input = screen.getByPlaceholderText("type") as HTMLInputElement;
  expect(input.value).toBe("start");
  act(() => fireEvent.change(input, { target: { value: "typed" } }));
  expect(text(/^value:/)).toBe("value: typed");
  expect(text(/^log:/)).toBe("log: changed to typed");
  await click(screen.getByRole("button", { name: "Set" }));
  expect(input.value).toBe("from api");
  expect(document.activeElement).toBe(input);
  expect(text(/^log:/)).toBe("log: changed to typed");
});

// Select moved to choice.test.tsx (step 25).

test("Checkbox: its own label; clicking fires didChange with the new state; the API value", async () => {
  show(`
    <App var.state="unset">
      <Checkbox id="agree" label="I agree" onDidChange="(v) => state = String(v)"/>
      <Text>state: {state} / {agree.value}</Text>
    </App>`);
  const box = screen.getByLabelText("I agree") as HTMLInputElement;
  expect(box.checked).toBe(false);
  await click(box);
  expect(box.checked).toBe(true);
  expect(text(/^state:/)).toBe("state: true / true");
});

test("theme mapping: Mantine's Button variables are redirected to gfui theme variables", () => {
  show('<App><Button label="B"/></App>');
  const style = screen.getByRole("button", { name: "B" }).style;
  expect(style.getPropertyValue("--button-bg")).toBe("var(--gfui-backgroundColor-Button)");
  expect(style.getPropertyValue("--button-hover")).toBe("var(--gfui-backgroundColor-Button--hover)");
});
