// Step 6 end to end in jsdom: variables and handlers, from markup to clicks.
import { compileModule } from "@patchfuil/compiler";
import { loadModule, setErrorReporter } from "@patchfuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(cleanup);

function renderMarkup(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const click = (label: string) =>
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
const texts = () => screen.queryAllByText((_, element) => element?.classList.contains("pfui-Text") ?? false).map((e) => e.textContent);

test("counter", () => {
  renderMarkup(`
    <App var.count="{0}" var.countTimes3="{3 * count}">
      <Button label="Increment" onClick="count++"/>
      <Text>Click count = {count}</Text>
      <Text>Times 3 = {countTimes3}</Text>
    </App>`);
  expect(texts()).toEqual(["Click count = 0", "Times 3 = 0"]);
  click("Increment");
  click("Increment");
  expect(texts()).toEqual(["Click count = 2", "Times 3 = 6"]);
});

test("a variable follows its expression until assigned (XMLUI markup.md source/mirror)", () => {
  renderMarkup(`
    <App var.source="{0}" var.mirror="{source}">
      <Text>source = {source}</Text>
      <Text>mirror = {mirror}</Text>
      <Button label="Increment source" onClick="source++" />
      <Button label="Override mirror" onClick="mirror = 999" />
    </App>`);
  click("Increment source");
  expect(texts()).toEqual(["source = 1", "mirror = 1"]);
  click("Override mirror");
  click("Increment source");
  expect(texts()).toEqual(["source = 2", "mirror = 999"]);
});

test("declaration order does not matter", () => {
  renderMarkup(`<App var.b="{a * 2}" var.a="{21}"><Text>{b}</Text></App>`);
  expect(texts()).toEqual(["42"]);
});

test("nested variables: the innermost declaration wins; writes go to the declaring scope", () => {
  renderMarkup(`
    <App var.title="outer" var.n="{0}">
      <Text>{title}</Text>
      <Stack var.title="inner">
        <Text>{title} {n}</Text>
        <Button label="Inner" onClick="n++; title = 'changed'"/>
      </Stack>
      <Text>{title} {n}</Text>
    </App>`);
  click("Inner");
  expect(texts()).toEqual(["outer", "changed 1", "outer 1"]);
});

test("<variable>, <global> and <event>", () => {
  renderMarkup(`
    <App>
      <global name="total" value="{10}"/>
      <variable name="step" value="{5}"/>
      <Button label="Add">
        <event name="click">
          total += step;
          step = step * 2;
        </event>
      </Button>
      <Text>{total} / {step}</Text>
    </App>`);
  click("Add");
  click("Add");
  expect(texts()).toEqual(["25 / 20"]);
});

describe("deep writes and array mutations (copy-on-write)", () => {
  test("settings.itemSize = value (XMLUI how-to)", () => {
    renderMarkup(`
      <App var.settings="{{ itemSize: 'small', showDetails: false }}">
        <Text>{settings.itemSize} {settings.showDetails}</Text>
        <Button label="Large" onClick="settings.itemSize = 'large'"/>
        <Button label="Toggle" onClick="settings.showDetails = !settings.showDetails"/>
      </App>`);
    click("Large");
    click("Toggle");
    expect(texts()).toEqual(["large true"]);
  });

  test("newItems.push(item) (XMLUI AutoComplete reference)", () => {
    renderMarkup(`
      <App var.newItems="{[]}">
        <Button label="Add" onClick="newItems.push('item ' + (newItems.length + 1))"/>
        <Text>New items: {newItems.join(', ')}</Text>
      </App>`);
    click("Add");
    click("Add");
    expect(texts()).toEqual(["New items: item 1, item 2"]);
  });

  test("nested paths, computed keys, ++, delete, splice, sort", () => {
    renderMarkup(`
      <App var.state="{{ counts: { a: 1, b: 1 }, list: [3, 1, 2], gone: true }}" var.key="b">
        <Text>{JSON.stringify(state)}</Text>
        <Button label="Go" onClick="
          state.counts[key] += 10;
          state.counts.a++;
          delete state.gone;
          state.list.splice(0, 1);
          state.list.sort();
          state.extra ??= 'new';
        "/>
      </App>`);
    click("Go");
    expect(texts()).toEqual(['{"counts":{"a":2,"b":11},"list":[1,2],"extra":"new"}']);
  });

  test("mutating a variable's value through an alias throws instead of being silently lost", async () => {
    renderMarkup(`
      <App var.items="{[1]}">
        <Button label="Alias" onClick="const list = items; list.push(2)"/>
        <Text>{items.length}</Text>
      </App>`);
    const errors: unknown[] = [];
    const restore = setErrorReporter((error) => errors.push(error));
    try {
      click("Alias");
      // Handlers are async functions: their errors are reported when the call settles.
      await act(async () => {});
    } finally {
      restore();
    }
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
    expect(texts()).toEqual(["1"]);
  });
});

test("a lone arrow handler, and $param", () => {
  renderMarkup(`
    <App var.log="{[]}">
      <Button label="Arrow" onClick="() => log.push('arrow')"/>
      <Button label="Param" onClick="log.push(typeof $param + ':' + $params.length)"/>
      <Text>{log.join(',')}</Text>
    </App>`);
  click("Arrow");
  click("Param");
  // Button passes no arguments (no DOM event reaches script).
  expect(texts()).toEqual(["arrow,undefined:0"]);
});

test("a handler re-renders each affected component once (batched)", () => {
  renderMarkup(`
    <App var.a="{0}" var.b="{0}">
      <Text>{a + b}</Text>
      <Button label="Both" onClick="a++; b++; a++"/>
    </App>`);
  click("Both");
  expect(texts()).toEqual(["3"]);
});

test("each instance of a container has its own variables", () => {
  // Two sibling containers with the same declarations do not share state.
  renderMarkup(`
    <App>
      <Stack var.n="{0}"><Button label="First" onClick="n++"/><Text>{n}</Text></Stack>
      <Stack var.n="{0}"><Button label="Second" onClick="n++"/><Text>{n}</Text></Stack>
    </App>`);
  click("First");
  click("First");
  click("Second");
  expect(texts()).toEqual(["2", "1"]);
});
