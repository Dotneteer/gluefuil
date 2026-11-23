// Step 8 end to end in jsdom: component IDs and scoping, from markup.
import { compileModule } from "@patchfuil/compiler";
import { loadModule } from "@patchfuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(cleanup);

function renderMarkup(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const texts = () => [...document.querySelectorAll(".pfui-Text")].map((e) => e.textContent);
const type = (input: HTMLElement, value: string) => act(() => fireEvent.change(input, { target: { value } }));
const click = (label: string) => act(() => fireEvent.click(screen.getByRole("button", { name: label })));

test("reading a component's value by id: sibling, before it, nested in a container", () => {
  renderMarkup(`
    <App var.message="Hello from App">
      <Text>before: {nameBox.value}</Text>
      <TextBox id="nameBox" initialValue="{message}"/>
      <Stack var.suffix="!">
        <Stack><Text>nested: {nameBox.value}{suffix}</Text></Stack>
      </Stack>
    </App>`);
  expect(texts()).toEqual(["before: Hello from App", "nested: Hello from App!"]);
  type(screen.getByRole("textbox"), "typed");
  expect(texts()).toEqual(["before: typed", "nested: typed!"]);
});

test("an id declared inside a container is visible outside it (IDs are file-scoped)", () => {
  renderMarkup(`
    <App>
      <Stack var.unused="{0}"><TextBox id="inner" initialValue="x"/></Stack>
      <Text>outside: {inner.value}</Text>
    </App>`);
  expect(texts()).toEqual(["outside: x"]);
});

test("handlers call API methods; onDidChange passes the new text as $param", () => {
  renderMarkup(`
    <App var.log="{[]}">
      <TextBox id="box" onDidChange="log.push($param)"/>
      <Button label="Fill" onClick="box.setValue('filled'); box.focus()"/>
      <Button label="Clear" onClick="box.setValue('')"/>
      <Text>value: {box.value} | log: {log.join(',')}</Text>
    </App>`);
  type(screen.getByRole("textbox"), "a");
  type(screen.getByRole("textbox"), "ab");
  click("Fill");
  expect(texts()).toEqual(["value: filled | log: a,ab"]);
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
  click("Clear");
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});

test("a variable shadows an outer one only inside its subtree", () => {
  renderMarkup(`
    <App var.title="outer">
      <Stack var.title="inner"><Text>{title}</Text></Stack>
      <Text>{title}</Text>
    </App>`);
  expect(texts()).toEqual(["inner", "outer"]);
});

test("each TextBox keeps its own state; copying between them by id", () => {
  renderMarkup(`
    <App>
      <TextBox id="from" initialValue="copy me"/>
      <TextBox id="to"/>
      <Button label="Copy" onClick="to.setValue(from.value.toUpperCase())"/>
      <Text>{from.value} → {to.value}</Text>
    </App>`);
  click("Copy");
  expect(texts()).toEqual(["copy me → COPY ME"]);
});
