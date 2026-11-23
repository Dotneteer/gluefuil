// Step 10 end to end in jsdom: when, when-*, lifecycle, Items and templates.
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
const click = (label: string) => act(() => fireEvent.click(screen.getByRole("button", { name: label })));
const microtask = () => act(async () => {});
const resize = (width: number) =>
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
  });

test("when toggles a subtree; onMount / onUnmount follow the transitions", async () => {
  renderMarkup(`
    <App var.show="{false}" var.log="{[]}">
      <Button label="Toggle" onClick="show = !show"/>
      <Stack when="{show}" onMount="log.push('mount')" onUnmount="log.push('unmount')">
        <Text>panel</Text>
      </Stack>
      <Text>log: {log.join(',')}</Text>
    </App>`);
  expect(texts()).toEqual(["log: "]);
  click("Toggle");
  expect(texts()).toEqual(["panel", "log: mount"]);
  click("Toggle");
  await microtask();
  expect(texts()).toEqual(["log: mount,unmount"]);
});

test("a hidden element's state is gone; it starts fresh when shown again", () => {
  renderMarkup(`
    <App var.show="{true}">
      <Button label="Toggle" onClick="show = !show"/>
      <Stack when="{show}" var.n="{0}">
        <Button label="Inc" onClick="n++"/>
        <Text>n: {n}</Text>
      </Stack>
    </App>`);
  click("Inc");
  click("Inc");
  expect(texts()).toEqual(["n: 2"]);
  click("Toggle");
  click("Toggle");
  expect(texts()).toEqual(["n: 0"]);
});

test("responsive when-* follows the viewport", () => {
  resize(400);
  renderMarkup(`
    <App>
      <Text when-md="false">compact</Text>
      <Text when="false" when-md="true">full</Text>
    </App>`);
  expect(texts()).toEqual(["compact"]);
  resize(1000);
  expect(texts()).toEqual(["full"]);
});

test("Items: $item, $itemIndex, $isFirst, $isLast; reverse; a <property> template", () => {
  renderMarkup(`
    <App var.items="{['a', 'b', 'c']}">
      <Items data="{items}">
        <Text>{$itemIndex}:{$item}{$isFirst ? ' first' : ''}{$isLast ? ' last' : ''}</Text>
      </Items>
      <Items data="{items}" reverse="true">
        <property name="itemTemplate"><Text>r{$item}</Text></property>
      </Items>
    </App>`);
  expect(texts()).toEqual(["0:a first", "1:b", "2:c last", "rc", "rb", "ra"]);
});

test("Items follows its data; handlers in the template see $item; per-item state survives data changes", () => {
  renderMarkup(`
    <App var.todos="{[{ title: 'one' }, { title: 'two' }]}">
      <Button label="Add" onClick="todos.push({ title: 'item ' + (todos.length + 1) })"/>
      <Button label="Rename first" onClick="todos[0].title = 'ONE'"/>
      <Items data="{todos}">
        <Stack var.ticks="{0}">
          <Button label="{'tick ' + $item.title}" onClick="ticks++"/>
          <Text>{$item.title} ({ticks})</Text>
        </Stack>
      </Items>
    </App>`);
  click("tick two");
  click("tick two");
  expect(texts()).toEqual(["one (0)", "two (2)"]);
  click("Add");
  click("Rename first");
  // The second item kept its own variable through both changes.
  expect(texts()).toEqual(["ONE (0)", "two (2)", "item 3 (0)"]);
});

test("nested templates see both levels' context through the scope chain", () => {
  renderMarkup(`
    <App var.rows="{[[1, 2], [3]]}">
      <Items data="{rows}">
        <Items data="{$item}">
          <Text>{$item}</Text>
        </Items>
      </Items>
    </App>`);
  expect(texts()).toEqual(["1", "2", "3"]);
});
