// Step 25 in jsdom: Select and AutoComplete through compiled markup (Option
// children compiled to data), alone and in a Form; the prerendered selection.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { renderStatic, resetServerState } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { choiceOptions, groupOptions, matchesSearch } from "../src/index";

afterEach(cleanup);

function load(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  return loadModule(code, { components });
}
const show = (markup: string) => {
  const Main = load(markup);
  return render(<Main />).container;
};

const text = (pattern: RegExp) => screen.getByText(pattern).textContent;
const click = (element: Element) => act(async () => fireEvent.click(element));
// Mantine's Combobox reads `code` (ArrowDown, Enter, Space), our handlers `key`.
const key = (element: Element, k: string) => act(async () => fireEvent.keyDown(element, { key: k, code: k }));
const type = (element: Element, value: string) => act(async () => fireEvent.change(element, { target: { value } }));
const combobox = (name: string) => screen.getByRole("combobox", { name });
// jsdom: elements have no size, so Floating UI reports the input as hidden and the (always mounted) list is
// display: none. The open list is the one an expanded combobox controls.
function openList(): HTMLElement | null {
  const open = screen.queryAllByRole("combobox", { hidden: true }).find((c) => c.getAttribute("aria-expanded") === "true");
  const id = open?.getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}
const optionNames = () => {
  const list = openList();
  return list ? within(list).queryAllByRole("option", { hidden: true }).map((o) => o.textContent) : [];
};
/** Mantine's clear and pill-remove buttons are aria-hidden (mouse only; Backspace removes): found by their label. */
const ariaHidden = (label: string) => document.querySelector(`[aria-hidden="true"][aria-label="${label}"]`)!;
const option = (name: string) => within(openList()!).getByRole("option", { name, hidden: true });

describe("the options", () => {
  test("choiceOptions: children data keep their types; data through valueField/labelField; strings; value and label stand in for each other", () => {
    expect(choiceOptions([{ value: 0, label: "Zero" }, { label: "Only label" }, { value: "v" }, {}, { value: 0, label: "dup" }], undefined).map((o) => [o.value, o.label, o.key])).toEqual([
      [0, "Zero", "0"],
      ["Only label", "Only label", "Only label"],
      ["v", "v", "v"],
    ]);
    expect(choiceOptions(undefined, [{ code: "us", name: "United States" }], "code", "name").map((o) => [o.value, o.label])).toEqual([["us", "United States"]]);
    expect(choiceOptions(undefined, ["a", 1]).map((o) => o.value)).toEqual(["a", "1"]);
    expect(choiceOptions([{ value: "x", enabled: "false", keywords: ["k"] }], undefined)[0]).toMatchObject({ enabled: false, keywords: ["k"] });
  });

  test("matchesSearch: value, label and keywords, case-insensitive; groupOptions: ungrouped first, groups by name", () => {
    const [apple] = choiceOptions([{ value: "a1", label: "Apple", keywords: ["red", "Pie"] }], undefined);
    expect(["APP", "a1", "pie", ""].map((s) => matchesSearch(apple!, s))).toEqual([true, true, true, true]);
    expect(matchesSearch(apple!, "pear")).toBe(false);
    const options = choiceOptions([{ value: 1, c: "Veg" }, { value: 2 }, { value: 3, c: "Fruit" }, { value: 4, c: "Veg" }], undefined);
    expect(groupOptions(options, "c").map((g) => [g.group, g.options.map((o) => o.value)])).toEqual([
      [undefined, [2]],
      ["Fruit", [3]],
      ["Veg", [1, 4]],
    ]);
  });
});

describe("Select", () => {
  test("Option children (also from Items, a text label, when): a click opens the list; picking fires didChange with the value's type; the API value", async () => {
    show(`
      <App var.picked="none" var.more="{[{ id: 7, name: 'Seven' }]}" var.showZero="{true}">
        <Select id="s" label="Number" placeholder="Pick" onDidChange="(v) => picked = typeof v + ' ' + v">
          <Option value="{0}" when="{showZero}">Zero</Option>
          <Option value="one" label="One"/>
          <Items data="{more}"><Option value="{$item.id}" label="{$item.name}"/></Items>
        </Select>
        <Text>picked: {picked}</Text>
        <Text>api: {s.value === '' ? 'empty' : s.value}</Text>
        <Button label="Hide zero" onClick="showZero = false"/>
      </App>`);
    const select = combobox("Number");
    expect(select.textContent).toBe("Pick");
    expect(text(/^api:/)).toBe("api: empty");
    await click(select);
    expect(optionNames()).toEqual(["Zero", "One", "Seven"]);
    await click(option("Seven"));
    expect(text(/^picked:/)).toBe("picked: number 7");
    expect(text(/^api:/)).toBe("api: 7");
    expect(select.textContent).toBe("Seven");
    expect(optionNames()).toEqual([]);
    await click(select);
    await click(option("Zero"));
    expect(text(/^picked:/)).toBe("picked: number 0");
    await click(screen.getByRole("button", { name: "Hide zero" }));
    await click(select);
    expect(optionNames()).toEqual(["One", "Seven"]);
  });

  test("data with valueField and labelField; strings", async () => {
    show(`
      <App var.countries="{[{ code: 'us', name: 'United States' }, { code: 'ca', name: 'Canada' }]}">
        <Select id="c" label="Country" data="{countries}" valueField="code" labelField="name" initialValue="ca"/>
        <Select label="Size" data="{['S', 'M']}"/>
        <Text>api: {c.value}</Text>
      </App>`);
    expect(combobox("Country").textContent).toBe("Canada");
    await click(combobox("Size"));
    expect(optionNames()).toEqual(["S", "M"]);
    await click(option("S"));
    expect(combobox("Size").textContent).toBe("S");
    expect(text(/^api:/)).toBe("api: ca");
  });

  test("initialValue; setValue fires no didChange; setValue('') clears", async () => {
    show(`
      <App var.log="">
        <Select id="s" label="S" initialValue="y" onDidChange="log += 'changed;'">
          <Option value="x"/><Option value="y"/>
        </Select>
        <Button label="To x" onClick="s.setValue('x')"/>
        <Button label="Clear" onClick="s.setValue('')"/>
        <Text>log: {log} value: {s.value}</Text>
      </App>`);
    expect(combobox("S").textContent).toBe("y");
    await click(screen.getByRole("button", { name: "To x" }));
    expect(combobox("S").textContent).toBe("x");
    await click(screen.getByRole("button", { name: "Clear" }));
    expect(combobox("S").textContent).not.toBe("x");
    expect(text(/^log:/)).toBe("log:  value: ");
  });

  test("keys: ArrowDown opens on the first option and moves, Enter picks, Escape closes; disabled options are skipped", async () => {
    show(`
      <App var.picked="">
        <Select label="K" onDidChange="(v) => picked = v">
          <Option value="a"/><Option value="b" enabled="false"/><Option value="c"/>
        </Select>
        <Text>picked: {picked}</Text>
      </App>`);
    const select = combobox("K");
    // The first ArrowDown opens the list on the first option (Mantine); the next skips the disabled one.
    await key(select, "ArrowDown");
    expect(optionNames()).toEqual(["a", "b", "c"]);
    await key(select, "ArrowDown");
    await key(select, "Enter");
    expect(text(/^picked:/)).toBe("picked: c");
    await key(select, "ArrowDown");
    expect(optionNames().length).toBe(3);
    await key(select, "Escape");
    expect(optionNames()).toEqual([]);
    await click(select);
    await click(option("b"));
    expect(text(/^picked:/)).toBe("picked: c");
  });

  test("searchable: typing filters by value, label and keywords; the input shows the label again on blur; clearable", async () => {
    show(`
      <App>
        <Select id="s" label="Fruit" searchable="true" clearable="true">
          <Option value="a" label="Apple" keywords="{['red']}"/>
          <Option value="b" label="Banana"/>
          <Option value="c" label="Cherry" keywords="{['red']}"/>
        </Select>
        <Text>api: {s.value}</Text>
      </App>`);
    const input = combobox("Fruit") as HTMLInputElement;
    await type(input, "red");
    expect(optionNames()).toEqual(["Apple", "Cherry"]);
    await type(input, "nothing");
    expect(screen.getByText("List is empty")).toBeTruthy();
    await type(input, "ban");
    await click(option("Banana"));
    expect(input.value).toBe("Banana");
    expect(text(/^api:/)).toBe("api: b");
    await type(input, "x");
    act(() => fireEvent.blur(input));
    expect(input.value).toBe("Banana");
    await click(ariaHidden("Clear"));
    expect(input.value).toBe("");
    expect(text(/^api:/)).toBe("api: ");
  });

  test("multiSelect: pills, the value is an array, picking toggles and keeps the list open; a pill's remove button; Backspace removes the last", async () => {
    show(`
      <App var.log="">
        <Select id="m" label="Tags" multiSelect="true" initialValue="{['b']}" onDidChange="(v) => log = JSON.stringify(v)">
          <Option value="a" label="Alpha"/><Option value="b" label="Beta"/><Option value="c" label="Gamma"/>
        </Select>
        <Text>log: {log} api: {JSON.stringify(m.value)}</Text>
      </App>`);
    expect(text(/^log:/)).toBe('log:  api: ["b"]');
    const field = combobox("Tags");
    await click(field);
    await click(option("Alpha"));
    expect(text(/^log:/)).toBe('log: ["b","a"] api: ["b","a"]');
    expect(optionNames()).toEqual(["Alpha", "Beta", "Gamma"]);
    await click(option("Beta"));
    expect(text(/^log:/)).toBe('log: ["a"] api: ["a"]');
    await click(option("Gamma"));
    await click(ariaHidden("Remove Alpha"));
    expect(text(/^log:/)).toBe('log: ["c"] api: ["c"]');
    await key(field, "Backspace");
    expect(text(/^log:/)).toBe("log: [] api: []");
  });

  test("groupBy: the ungrouped first, then the groups by name; groupHeaderTemplate and ungroupedHeaderTemplate", async () => {
    show(`
      <App>
        <Select label="Food" groupBy="category">
          <property name="groupHeaderTemplate"><Text>Group {$group}</Text></property>
          <property name="ungroupedHeaderTemplate"><Text>Other</Text></property>
          <Option value="1" label="Carrot" category="Vegetable"/>
          <Option value="2" label="Misc"/>
          <Option value="3" label="Apple" category="Fruit"/>
        </Select>
      </App>`);
    await click(combobox("Food"));
    const listbox = openList()!;
    expect(listbox.textContent).toBe("OtherMiscGroup FruitAppleGroup VegetableCarrot");
  });

  test("templates: optionTemplate ($item, $checked), an Option's own content, valueTemplate, emptyListTemplate; inProgress", async () => {
    show(`
      <App>
        <Select label="T" initialValue="b">
          <property name="optionTemplate"><Text>{$checked ? '✓' : '·'} {$item.label} ({$item.value})</Text></property>
          <property name="valueTemplate"><Text>Chosen: {$item.label}</Text></property>
          <Option value="a" label="A"/>
          <Option value="b" label="B"/>
          <Option value="c"><Text>Rich C</Text></Option>
        </Select>
        <Select label="E"><property name="emptyListTemplate"><Text>Nothing here</Text></property></Select>
        <Select label="P" inProgress="true" inProgressNotificationMessage="Loading…"><Option value="x"/></Select>
      </App>`);
    expect(combobox("T").textContent).toBe("Chosen: B");
    await click(combobox("T"));
    expect(optionNames()).toEqual(["· A (a)", "✓ B (b)", "Rich C"]);
    await click(combobox("E"));
    expect(screen.getByText("Nothing here")).toBeTruthy();
    await click(combobox("P"));
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(optionNames()).toEqual([]);
  });

  test("enabled=false disables it; readOnly opens nothing; validationStatus; its own label is not around the list", async () => {
    const container = show(`
      <App>
        <Select label="Off" enabled="false"><Option value="a"/></Select>
        <Select label="Locked" readOnly="true" initialValue="a"><Option value="a"/><Option value="b"/></Select>
        <Select label="Bad" validationStatus="error"><Option value="a"/></Select>
      </App>`);
    expect((combobox("Off") as HTMLButtonElement).disabled).toBe(true);
    await click(combobox("Locked"));
    expect(optionNames()).toEqual([]);
    expect(combobox("Bad").getAttribute("data-error")).toBe("true");
    expect(container.querySelector("label .mantine-Combobox-dropdown, label [role=listbox]")).toBeNull();
  });

  test("focus(), gotFocus and lostFocus", async () => {
    show(`
      <App var.log="">
        <Select id="s" label="F" onGotFocus="log += 'in;'" onLostFocus="log += 'out;'"><Option value="a"/></Select>
        <Button label="Focus" onClick="s.focus()"/>
        <Text>log: {log}</Text>
      </App>`);
    await click(screen.getByRole("button", { name: "Focus" }));
    expect(document.activeElement).toBe(combobox("F"));
    act(() => fireEvent.blur(combobox("F")));
    expect(text(/^log:/)).toBe("log: in;out;");
  });
});

describe("AutoComplete", () => {
  test("typing filters; Enter picks the only match; the input shows the label; an emptied input clears it on blur", async () => {
    show(`
      <App var.log="">
        <AutoComplete id="a" label="Hero" onDidChange="(v) => log = 'changed to ' + v">
          <Option value="1" label="Bruce Wayne"/>
          <Option value="2" label="Clark Kent"/>
          <Option value="3" label="Diana Prince"/>
        </AutoComplete>
        <Text>log: {log} api: {a.value}</Text>
      </App>`);
    const input = combobox("Hero") as HTMLInputElement;
    await type(input, "ce");
    expect(optionNames()).toEqual(["Bruce Wayne", "Diana Prince"]);
    await type(input, "clark");
    await key(input, "Enter");
    expect(text(/^log:/)).toBe("log: changed to 2 api: 2");
    expect(input.value).toBe("Clark Kent");
    await type(input, "");
    act(() => fireEvent.blur(input));
    expect(text(/^log:/)).toBe("log: changed to  api: ");
  });

  test("creatable: a Create item when nothing matches; itemCreated; the new option is selected and stays in the list", async () => {
    show(`
      <App var.created="">
        <AutoComplete id="a" label="Tag" creatable="true" onItemCreated="(t) => created += t + ';'">
          <Option value="news" label="News"/>
        </AutoComplete>
        <Text>created: {created} api: {a.value}</Text>
      </App>`);
    const input = combobox("Tag") as HTMLInputElement;
    await type(input, "news");
    expect(optionNames()).toEqual(["News"]);
    await type(input, "Sports");
    expect(optionNames()).toEqual(['Create "Sports"']);
    await click(option('Create "Sports"'));
    expect(text(/^created:/)).toBe("created: Sports; api: Sports");
    expect(input.value).toBe("Sports");
    await type(input, "");
    expect(optionNames()).toEqual(["News", "Sports"]);
  });

  test("multi: pills; the list stays open; the search clears after a pick", async () => {
    show(`
      <App>
        <AutoComplete id="a" label="Heroes" multi="true">
          <Option value="1" label="Bruce"/><Option value="2" label="Clark"/>
        </AutoComplete>
        <Text>api: {JSON.stringify(a.value)}</Text>
      </App>`);
    const input = combobox("Heroes") as HTMLInputElement;
    await type(input, "cl");
    await click(option("Clark"));
    expect(input.value).toBe("");
    expect(text(/^api:/)).toBe('api: ["2"]');
    expect(optionNames()).toEqual(["Bruce", "Clark"]);
    expect(within(input.closest(".gfui-AutoComplete")!).getByText("Clark")).toBeTruthy();
  });
});

describe("in a Form", () => {
  test("bindTo: the form's value, an array for multiSelect; required blocks an empty selection; submit", async () => {
    show(`
      <App var.saved="">
        <Form data="{{ size: 'm', tags: [] }}" onSubmit="(d) => saved = JSON.stringify(d)">
          <Select bindTo="size" label="Size"><Option value="s"/><Option value="m"/></Select>
          <Select bindTo="tags" label="Tags" multiSelect="true" required="true" requiredInvalidMessage="Pick a tag"><Option value="x"/><Option value="y"/></Select>
        </Form>
        <Text>saved: {saved}</Text>
      </App>`);
    expect(combobox("Size").textContent).toBe("m");
    await click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Pick a tag")).toBeTruthy();
    await click(combobox("Tags"));
    await click(option("y"));
    await click(combobox("Size"));
    await click(option("s"));
    await click(screen.getByRole("button", { name: "Save" }));
    expect(text(/^saved:/)).toBe('saved: {"size":"s","tags":["y"]}');
  });
});

describe("the prerender", () => {
  test("the selected label (from Option children, from Items) is in the static HTML", () => {
    resetServerState();
    const Main = load(`
      <App var.list="{[{ id: 2, name: 'Two' }]}">
        <Select label="A" initialValue="b"><Option value="a" label="Apple"/><Option value="b" label="Banana"/></Select>
        <AutoComplete label="B" initialValue="{2}"><Items data="{list}"><Option value="{$item.id}" label="{$item.name}"/></Items></AutoComplete>
      </App>`);
    const { html } = renderStatic(<Main />);
    expect(html).toContain("Banana");
    expect(html).toContain('value="Two"');
  });
});
