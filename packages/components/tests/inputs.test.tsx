// Step 24 in jsdom: the inputs through compiled markup, alone and bound in a Form.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { parseNumberInput, radioValue, sliderValue } from "../src/index";
import { BASE_STYLESHEET } from "../src/styles";

afterEach(cleanup);

function mount(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />).container;
}

/** The text of the app's last Text (a log the handlers write). */
const log = (container: HTMLElement) => [...container.querySelectorAll(".gfui-Text")].at(-1)!.textContent;
const textbox = (name: string) => screen.getByRole("textbox", { name });

describe("TextBox (step 24 additions) and PasswordInput", () => {
  test("type: search and email inputs; password is masked, with a toggle only when asked", () => {
    const container = mount(`<App>
      <TextBox label="S" type="search"/><TextBox label="E" type="email"/>
      <TextBox label="P" type="password"/><PasswordInput label="Q" showPasswordToggle="true"/>
    </App>`);
    expect(screen.getByRole("searchbox", { name: "S" }).getAttribute("type")).toBe("search");
    expect(textbox("E").getAttribute("type")).toBe("email");
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    expect(inputs).toHaveLength(2);
    expect(container.querySelector(".gfui-TextBox .mantine-PasswordInput-visibilityToggle")).toBeNull();
    // Mantine's toggle acts on mouse down (the E2E test clicks it in a browser).
    const toggle = container.querySelector(".gfui-PasswordInput .mantine-PasswordInput-visibilityToggle")!;
    fireEvent.mouseDown(toggle);
    expect(inputs[1]!.getAttribute("type")).toBe("text");
  });

  test("adornments: text and icons inside the edges, kept out of the accessible name", () => {
    const container = mount('<App><TextBox label="Weight" startIcon="user" endText="kg"/></App>');
    const adornments = [...container.querySelectorAll(".gfui-Adornment")];
    expect(adornments.map((a) => a.textContent)).toEqual(["", "kg"]);
    expect(adornments.every((a) => a.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(adornments[0]!.querySelector(".gfui-Icon, svg")).not.toBeNull();
    expect(textbox("Weight")).toBeTruthy();
  });

  test("readOnly, autoFocus; gotFocus and lostFocus get no arguments", () => {
    const container = mount(`<App var.log="">
      <TextBox label="R" readOnly="true" initialValue="fixed"/>
      <TextBox label="F" autoFocus="true" onGotFocus="(...a) => log += 'in' + a.length" onLostFocus="(...a) => log += ' out' + a.length"/>
      <Text>{log}</Text></App>`);
    expect(textbox("R").hasAttribute("readonly")).toBe(true);
    // autoFocus focused it on mount (gotFocus ran once).
    expect(document.activeElement).toBe(textbox("F"));
    fireEvent.blur(textbox("F"));
    expect(log(container)).toBe("in0 out0");
  });

  test("validationStatus: error is Mantine's error state; warning and valid mark the root", () => {
    const container = mount('<App><TextBox label="A" validationStatus="error"/><TextBox label="B" validationStatus="warning"/><TextBox label="C" validationStatus="valid"/></App>');
    expect(textbox("A").getAttribute("aria-invalid")).toBe("true");
    const roots = container.querySelectorAll(".gfui-TextBox");
    expect(roots[1]!.getAttribute("data-validation")).toBe("warning");
    expect(roots[2]!.getAttribute("data-validation")).toBe("valid");
  });
});

describe("TextArea", () => {
  test("rows; insert() puts text at the cursor, without didChange", () => {
    const container = mount(`<App var.changes="{0}">
      <TextArea id="notes" label="Notes" rows="4" initialValue="ab" onDidChange="changes++"/>
      <Button label="Insert" onClick="notes.insert('X')"/><Text>{notes.value}/{changes}</Text></App>`);
    const area = textbox("Notes") as HTMLTextAreaElement;
    expect(area.getAttribute("rows")).toBe("4");
    area.setSelectionRange(1, 1);
    fireEvent.click(screen.getByText("Insert"));
    expect(log(container)).toBe("aXb/0");
  });

  test("in a form: Enter submits (Shift+Enter doesn't), unless enterSubmits is false; Escape resets with escResets", async () => {
    const container = mount(`<App var.submitted="">
      <Form data="{{ note: 'start', other: '' }}" onSubmit="(d) => submitted = d.note" hideButtonRow="true">
        <TextArea bindTo="note" label="Note" escResets="true"/>
        <TextArea bindTo="other" label="Other" enterSubmits="false"/>
      </Form>
      <Text>{submitted}</Text></App>`);
    const note = textbox("Note");
    fireEvent.change(note, { target: { value: "edited" } });
    fireEvent.keyDown(note, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(textbox("Other"), { key: "Enter" });
    await act(async () => {});
    expect(log(container)).toBe("");
    await act(async () => fireEvent.keyDown(note, { key: "Enter" }));
    await waitFor(() => expect(log(container)).toBe("edited"));
    fireEvent.change(note, { target: { value: "again" } });
    await act(async () => fireEvent.keyDown(note, { key: "Escape" }));
    expect((note as HTMLTextAreaElement).value).toBe("start");
  });

  test("outside a form, Enter is a new line (no submit, no error)", () => {
    mount('<App><TextArea label="Free"/></App>');
    const event = fireEvent.keyDown(textbox("Free"), { key: "Enter" });
    expect(event).toBe(true);
  });
});

describe("NumberBox", () => {
  test.each<[input: unknown, value: number | undefined]>([
    [12, 12],
    ["12", 12],
    ["1.", 1],
    ["-", undefined],
    ["", undefined],
    [Number.NaN, undefined],
  ])("parseNumberInput(%j) = %j", (input, value) => {
    expect(parseNumberInput(input)).toBe(value);
  });

  test("the value is a number (or undefined while incomplete); the typed text stays", () => {
    const container = mount(`<App var.v="none"><NumberBox id="n" label="Age" onDidChange="(x) => v = typeof x + ':' + x"/><Text>{v}</Text></App>`);
    const input = textbox("Age") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-" } });
    expect(input.value).toBe("-");
    expect(log(container)).toBe("undefined:undefined");
    fireEvent.change(input, { target: { value: "-12" } });
    expect(log(container)).toBe("number:-12");
  });

  test("setValue replaces the text; minValue and maxValue clamp on blur; the spin box can be hidden", () => {
    const container = mount(`<App><NumberBox id="n" label="N" minValue="0" maxValue="10"/><NumberBox label="M" hasSpinBox="false"/>
      <Button label="Set" onClick="n.setValue(7)"/><Text>{n.value}</Text></App>`);
    fireEvent.click(screen.getByText("Set"));
    expect((textbox("N") as HTMLInputElement).value).toBe("7");
    fireEvent.change(textbox("N"), { target: { value: "25" } });
    fireEvent.blur(textbox("N"));
    expect(log(container)).toBe("10");
    expect(container.querySelectorAll(".mantine-NumberInput-controls")).toHaveLength(1);
  });
});

describe("Checkbox and Switch", () => {
  test("Switch: toggles, fires didChange and click; readOnly drops the change; enabled=false disables", () => {
    const container = mount(`<App var.log="">
      <Switch label="On" onDidChange="(v) => log += 'change:' + v + ' '" onClick="log += 'click '"/>
      <Switch label="Fixed" readOnly="true" initialValue="true" onDidChange="log += 'never'"/>
      <Switch label="Off" enabled="false"/>
      <Text>{log}</Text></App>`);
    const on = screen.getByRole("switch", { name: "On" });
    fireEvent.click(on);
    expect(on).toHaveProperty("checked", true);
    expect(log(container)).toBe("click change:true ");
    const fixed = screen.getByRole("switch", { name: "Fixed" });
    fireEvent.click(fixed);
    expect(fixed).toHaveProperty("checked", true);
    expect(fixed.getAttribute("aria-readonly")).toBe("true");
    expect(log(container)).not.toContain("never");
    expect(screen.getByRole("switch", { name: "Off" })).toHaveProperty("disabled", true);
  });

  test("Checkbox: indeterminate, readOnly", () => {
    mount('<App><Checkbox label="Some" indeterminate="true"/><Checkbox label="Locked" readOnly="true"/></App>');
    expect(screen.getByRole("checkbox", { name: "Some" }).getAttribute("data-indeterminate")).toBe("true");
    const locked = screen.getByRole("checkbox", { name: "Locked" });
    fireEvent.click(locked);
    expect(locked).toHaveProperty("checked", false);
  });
});

describe("RadioGroup and Option", () => {
  test.each<[unknown, string]>([
    ["a", "a"],
    [1, "1"],
    [true, "true"],
    [{ x: 1 }, ""],
    [undefined, ""],
  ])("radioValue(%j) = %j", (value, expected) => {
    expect(radioValue(value)).toBe(expected);
  });

  test("Options from Items and nested in a stack; values are strings; didChange; setValue; orientation", () => {
    const container = mount(`<App var.log="">
      <RadioGroup id="size" label="Size" initialValue="{2}" orientation="horizontal" onDidChange="(v) => log = typeof v + ':' + v">
        <Items data="{[1, 2, 3]}"><Option value="{$item}" label="Size {$item}"/></Items>
        <HStack><Option value="xl">Extra large</Option></HStack>
      </RadioGroup>
      <Button label="Set" onClick="size.setValue('xl')"/><Text>{log}</Text></App>`);
    expect(screen.getByRole("radiogroup", { name: "Size" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Size 2" })).toHaveProperty("checked", true);
    expect(container.querySelector(".gfui-RadioGroup-options")!.getAttribute("data-orientation")).toBe("horizontal");
    fireEvent.click(screen.getByRole("radio", { name: "Size 3" }));
    expect(log(container)).toBe("string:3");
    fireEvent.click(screen.getByText("Set"));
    expect(screen.getByRole("radio", { name: "Extra large" })).toHaveProperty("checked", true);
  });

  test("enabled, a disabled Option, readOnly; focus() moves to the selected option", () => {
    mount(`<App>
      <RadioGroup id="a" label="A" initialValue="z"><Option value="x"/><Option value="y" enabled="false"/><Option value="z"/></RadioGroup>
      <RadioGroup label="B" enabled="false"><Option value="p"/></RadioGroup>
      <RadioGroup label="C" readOnly="true" initialValue="m"><Option value="m"/><Option value="n"/></RadioGroup>
      <Button label="Focus" onClick="a.focus()"/></App>`);
    expect(screen.getByRole("radio", { name: "y" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("radio", { name: "p" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: "n" }));
    expect(screen.getByRole("radio", { name: "m" })).toHaveProperty("checked", true);
    fireEvent.click(screen.getByText("Focus"));
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "z" }));
  });

  test("an Option outside a RadioGroup renders nothing", () => {
    const container = mount('<App><Option value="lonely"/></App>');
    expect(container.querySelector(".gfui-AppContent")!.textContent).toBe("");
  });
});

describe("Slider", () => {
  test.each<[unknown, unknown]>([
    [3, 3],
    ["4", 4],
    [[6, 2], [2, 6]],
    [["1", "5"], [1, 5]],
    [[1], undefined],
    ["x", undefined],
  ])("sliderValue(%j) = %j", (input, expected) => {
    expect(sliderValue(input)).toEqual(expected);
  });

  test("a value: keys change it (didChange), and the end of a change commits (didCommit); setValue", () => {
    const container = mount(`<App var.log="">
      <Slider id="s" label="Volume" initialValue="3" maxValue="5" onDidChange="(v) => log += 'c' + v + ' '" onDidCommit="(v) => log += 'k' + v"/>
      <Button label="Set" onClick="s.setValue(1)"/><Text>{log}</Text></App>`);
    const thumb = screen.getByRole("slider", { name: "Volume" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("3");
    expect(thumb.getAttribute("aria-valuemax")).toBe("5");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("4");
    expect(log(container)).toBe("c4 k4");
    fireEvent.click(screen.getByText("Set"));
    expect(thumb.getAttribute("aria-valuenow")).toBe("1");
  });

  test("valueFormat: a literal is code (an arrow function), as in XMLUI", () => {
    const code = compileModule(`<App><Slider valueFormat="(v) => '$' + v"/></App>`).code;
    expect(code).toContain("\"valueFormat\": ($$s) => (v) =>");
  });

  test("an array is a range with two thumbs; readOnly drops changes", () => {
    mount('<App><Slider label="Price" initialValue="{[2, 6]}"/><Slider label="Fixed" initialValue="5" readOnly="true"/></App>');
    expect(screen.getAllByRole("slider").map((t) => t.getAttribute("aria-valuenow"))).toEqual(["2", "6", "5"]);
    const fixed = screen.getByRole("slider", { name: "Fixed" });
    fireEvent.keyDown(fixed, { key: "ArrowRight" });
    expect(fixed.getAttribute("aria-valuenow")).toBe("5");
  });
});

describe("ColorPicker", () => {
  test("#000000 by default; typing a color sets the value", () => {
    const container = mount('<App><ColorPicker id="c" label="Color"/><Text>{c.value}</Text></App>');
    expect(log(container)).toBe("#000000");
    fireEvent.change(textbox("Color"), { target: { value: "#ff0000" } });
    expect(log(container)).toBe("#ff0000");
  });
});

describe("every input bound in a Form", () => {
  test("loads the data, submits typed values, resets", async () => {
    const container = mount(`<App var.out="">
      <Form id="f" data="{{ name: 'Ada', secret: 'pw', bio: 'hi', age: 36, news: false, plan: 'free', volume: 3, color: '#2563eb' }}"
            onSubmit="(d) => out = JSON.stringify(d)" hideButtonRow="true">
        <TextBox bindTo="name" label="Name"/>
        <PasswordInput bindTo="secret" label="Secret"/>
        <TextArea bindTo="bio" label="Bio"/>
        <NumberBox bindTo="age" label="Age"/>
        <Switch bindTo="news" label="News"/>
        <RadioGroup bindTo="plan" label="Plan"><Option value="free"/><Option value="pro"/></RadioGroup>
        <Slider bindTo="volume" label="Volume"/>
        <ColorPicker bindTo="color" label="Color"/>
      </Form>
      <Button label="Save" onClick="f.submit()"/><Button label="Reset" onClick="f.reset()"/><Text>{out}</Text></App>`);
    expect((textbox("Name") as HTMLInputElement).value).toBe("Ada");
    expect((textbox("Age") as HTMLInputElement).value).toBe("36");
    expect(screen.getByRole("radio", { name: "free" })).toHaveProperty("checked", true);
    expect(screen.getByRole("slider", { name: "Volume" }).getAttribute("aria-valuenow")).toBe("3");
    fireEvent.change(textbox("Age"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("switch", { name: "News" }));
    fireEvent.click(screen.getByRole("radio", { name: "pro" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowRight" });
    await act(async () => fireEvent.click(screen.getByText("Save")));
    await waitFor(() =>
      expect(JSON.parse(log(container)!)).toEqual({ name: "Ada", secret: "pw", bio: "hi", age: 37, news: true, plan: "pro", volume: 4, color: "#2563eb" }),
    );
    fireEvent.click(screen.getByText("Reset"));
    expect((textbox("Age") as HTMLInputElement).value).toBe("36");
    expect(screen.getByRole("radio", { name: "free" })).toHaveProperty("checked", true);
  });

  test("validation: required on a Switch and a RadioGroup", async () => {
    const container = mount(`<App var.out="">
      <Form data="{{}}" onSubmit="out = 'sent'">
        <Switch bindTo="terms" label="Terms" required="true" requiredInvalidMessage="Accept the terms"/>
        <RadioGroup bindTo="plan" label="Plan" required="true"><Option value="a"/></RadioGroup>
      </Form><Text>{out}</Text></App>`);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByText("Accept the terms")).toBeTruthy();
    expect(log(container)).toBe("");
  });

  test("a prop both declare (NumberBox minValue) goes to the input and to the validation", () => {
    const code = compileModule('<App><Form><NumberBox bindTo="n" minValue="1" rangeInvalidMessage="Too small"/></Form></App>').code;
    expect(code).toContain('$$C_ValidationBehavior, props: { "minValue": "1", "rangeInvalidMessage": "Too small" }');
    expect(code).toContain('$$h($$C_NumberBox, { "minValue": "1" })');
  });
});

// jsdom resolves no var(); the playground's "Input APIs and theming" E2E test checks the computed radius.
test.each(["TextBox", "PasswordInput", "TextArea", "NumberBox", "ColorPicker", "Select"])("%s: borderRadius-%s reaches Mantine's --input-radius", (name) => {
  expect(BASE_STYLESHEET).toContain(`.gfui-${name} .mantine-Input-wrapper { --input-radius: var(--gfui-borderRadius-${name}); }`);
});
