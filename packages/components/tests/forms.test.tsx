// Step 22 in jsdom: Form, and inputs bound with the formBinding and validation
// behaviors (no FormItem). See .ai/plan/poc-22-forms.md.
import { compileModule } from "@gluefuil/compiler";
import { confirmQueue, loadModule, resetOverlayState, setDiagnosticReporter, setErrorReporter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ComponentType } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import * as components from "../src/index";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  // Step 33: developer diagnostics (duplicate ids, an unbound input) go to their own reporter.
  const restoreErrors = setErrorReporter((error) => errors.push(error));
  const restoreDiagnostics = setDiagnosticReporter((problem) => errors.push(problem));
  restore = () => {
    restoreErrors();
    restoreDiagnostics();
  };
});
afterEach(() => {
  cleanup();
  restore();
  resetOverlayState();
});

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components }) as ComponentType;
  return render(
    <StrictMode>
      <Main />
    </StrictMode>,
  );
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => act(async () => fireEvent.change(input(label), { target: { value } }));
const focus = (label: string) => act(async () => fireEvent.focus(input(label)));
const blur = (label: string) => act(async () => fireEvent.blur(input(label)));
const click = (name: string) => act(async () => fireEvent.click(screen.getByRole("button", { name })));
// The confirm() dialog (step 27): Mantine mounts its content a moment after it opens.
const clickInDialog = async (name: string) => {
  const button = await screen.findByRole("button", { name, hidden: true });
  await act(async () => fireEvent.click(button));
};
const messages = () => [...document.querySelectorAll(".gfui-ValidationMessage")].map((e) => `${e.getAttribute("data-severity")}: ${e.textContent}`);
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent;

test("inputs show the data at their path; typing updates $data (nested paths too)", async () => {
  show(`
    <App>
      <Form data="{ { name: 'Ann', address: { city: 'Oslo' } } }">
        <TextBox bindTo="name" label="Name"/>
        <TextBox bindTo="address.city" label="City"/>
        <Text>data: {JSON.stringify($data)}</Text>
      </Form>
    </App>`);
  expect(input("Name").value).toBe("Ann");
  expect(input("City").value).toBe("Oslo");
  await type("City", "Paris");
  expect(text("data:")).toBe('data: {"name":"Ann","address":{"city":"Paris"}}');
});

test("an input's initialValue is the field's value when the data has none", async () => {
  show(`
    <App>
      <Form data="{ { name: 'Ann' } }">
        <TextBox bindTo="name" label="Name" initialValue="ignored"/>
        <TextBox bindTo="role" label="Role" initialValue="user"/>
        <Text>data: {JSON.stringify($data)}</Text>
      </Form>
    </App>`);
  expect(input("Name").value).toBe("Ann");
  expect(input("Role").value).toBe("user");
  expect(text("data:")).toBe('data: {"name":"Ann","role":"user"}');
});

test("errorLate: no message while typing the first time; shown on blur; hidden again once valid", async () => {
  show(`<App><Form><TextBox bindTo="name" label="Name" required minLength="3"/></Form></App>`);
  await focus("Name");
  await type("Name", "A");
  expect(messages()).toEqual([]);
  await blur("Name");
  expect(messages()).toEqual(["error: Input should be at least 3 characters"]);
  expect(input("Name").getAttribute("aria-invalid")).toBe("true");
  expect(input("Name").getAttribute("aria-describedby")).toBe(document.querySelector(".gfui-Field-messages")!.id);
  // Focused again: still shown while invalid, hidden as soon as it turns valid.
  await focus("Name");
  await type("Name", "Ab");
  expect(messages()).toEqual(["error: Input should be at least 3 characters"]);
  await type("Name", "Abc");
  expect(messages()).toEqual([]);
});

test.each([
  ["onChanged", ["error: This field is required"]],
  ["onLostFocus", []],
])("validationMode %s: what shows while typing", async (mode, expected) => {
  show(`<App><Form><TextBox bindTo="name" label="Name" required validationMode="${mode}"/></Form></App>`);
  await focus("Name");
  await type("Name", "x");
  await type("Name", "");
  expect(messages()).toEqual(expected);
});

test("a submit attempt shows every result, moves the focus to the first invalid input, and doesn't submit", async () => {
  show(`
    <App var.submitted="none">
      <Form onSubmit="(data) => submitted = JSON.stringify(data)">
        <TextBox bindTo="name" label="Name"/>
        <TextBox bindTo="email" label="Email" required pattern="email"/>
        <TextBox bindTo="code" label="Code" regex="^\\d+$"/>
      </Form>
      <Text>submitted: {submitted}</Text>
    </App>`);
  await click("Save");
  await settle();
  expect(messages()).toEqual(["error: This field is required"]);
  expect(document.activeElement).toBe(input("Email"));
  expect(text("submitted:")).toBe("submitted: none");
  // An edit hides that input's forced results again.
  await type("Email", "not an email");
  expect(messages()).toEqual([]);
});

test("a warning shows but doesn't block (step 27: after a confirmation; No stops the submit); onSubmit gets the data, success its result; the form is clean afterwards", async () => {
  show(`
    <App var.log="">
      <Form id="form" data="{ { name: '' } }"
            onSubmit="(data) => { log += 'submit ' + JSON.stringify(data) + ';'; return 42; }"
            onSuccess="(result) => log += 'success ' + result + ';'">
        <TextBox bindTo="name" label="Name" maxLength="3" lengthInvalidSeverity="warning"/>
        <Text>dirty: {form.isDirty()}</Text>
      </Form>
      <Text>log: {log}</Text>
    </App>`);
  await type("Name", "Annabel");
  expect(text("dirty:")).toBe("dirty: true");
  await click("Save");
  await settle();
  // The confirmation lists the warning; No keeps the form as it is.
  expect(confirmQueue.get()[0]?.message).toMatch(/following warnings[\s\S]*• /);
  expect(confirmQueue.get()[0]?.title).toBe("Are you sure want to move forward?");
  await clickInDialog("No");
  await settle();
  expect(text("log:")).toBe("log: ");
  await click("Save");
  await settle();
  await clickInDialog("Yes, proceed");
  await settle();
  expect(text("log:")).toBe('log: submit {"name":"Annabel"};success 42;');
  expect(text("dirty:")).toBe("dirty: false");
});

test("willSubmit: false cancels; an object replaces the submitted data", async () => {
  show(`
    <App var.log="" var.mode="cancel">
      <Form onWillSubmit="(data, all) => mode === 'cancel' ? false : { ...data, extra: all.secret }"
            onSubmit="(data) => log += JSON.stringify(data) + ';'">
        <TextBox bindTo="name" label="Name" initialValue="Ann"/>
        <TextBox bindTo="secret" label="Secret" initialValue="s" noSubmit/>
        <Text>data: {JSON.stringify($data)}</Text>
      </Form>
      <Button label="Replace" onClick="mode = 'replace'"/>
      <Text>log: {log}</Text>
    </App>`);
  expect(text("data:")).toBe('data: {"name":"Ann"}');
  await click("Save");
  await settle();
  expect(text("log:")).toBe("log: ");
  await click("Replace");
  await click("Save");
  await settle();
  expect(text("log:")).toBe('log: {"name":"Ann","extra":"s"};');
});

test("a failing onSubmit: the message in the summary, submitError called; the data stays", async () => {
  show(`
    <App var.log="">
      <Form onSubmit="() => { throw new Error('The server said no') }" onSubmitError="(e) => log = e.message">
        <TextBox bindTo="name" label="Name" initialValue="Ann"/>
      </Form>
      <Text>log: {log}</Text>
    </App>`);
  await click("Save");
  await settle();
  expect(screen.getByRole("alert").textContent).toBe("The server said no");
  expect(text("log:")).toBe("log: The server said no");
  expect(input("Name").value).toBe("Ann");
});

test("dataAfterSubmit reset and the reset() method go back to the baseline; reset(data) replaces it", async () => {
  show(`
    <App var.log="">
      <Form id="form" data="{ { name: 'Ann' } }" dataAfterSubmit="reset" onReset="log += 'reset;'">
        <TextBox bindTo="name" label="Name"/>
      </Form>
      <Button label="Reset to Bob" onClick="form.reset({ name: 'Bob' })"/>
      <Text>log: {log}</Text>
    </App>`);
  await type("Name", "Changed");
  await click("Save");
  await settle();
  expect(input("Name").value).toBe("Ann");
  expect(text("log:")).toBe("log: reset;");
  await click("Reset to Bob");
  expect(input("Name").value).toBe("Bob");
});

test("dirtyChanged fires on each transition; update() changes values by path", async () => {
  show(`
    <App var.log="">
      <Form id="form" data="{ { a: { b: 1 } } }" onDirtyChanged="(dirty) => log += dirty + ';'">
        <Text>data: {JSON.stringify($data)}</Text>
      </Form>
      <Button label="Update" onClick="form.update({ 'a.b': 2 })"/>
      <Button label="Clean" onClick="form.setDirty(false)"/>
      <Text>log: {log}</Text>
    </App>`);
  await click("Update");
  expect(text("data:")).toBe('data: {"a":{"b":2}}');
  await click("Clean");
  await settle();
  expect(text("log:")).toBe("log: true;false;");
});

test("Select and Checkbox bind too; required on a checkbox means checked", async () => {
  show(`
    <App>
      <Form data="{ { role: 'admin', agree: false } }">
        <Select bindTo="role" label="Role" data="{['user', 'admin']}"/>
        <Checkbox bindTo="agree" label="I agree" required/>
        <Text>data: {JSON.stringify($data)}</Text>
      </Form>
    </App>`);
  expect(screen.getByRole("combobox", { name: "Role" }).textContent).toBe("admin");
  await click("Save");
  await settle();
  expect(messages()).toEqual(["error: This field is required"]);
  await act(async () => fireEvent.click(screen.getByRole("checkbox", { name: "I agree" })));
  expect(text("data:")).toBe('data: {"role":"admin","agree":true}');
  expect(messages()).toEqual([]);
});

test("onValidate: an async check's result shows; a throwing check is an error, reported", async () => {
  show(`
    <App>
      <Form>
        <TextBox bindTo="user" label="User" validationMode="onChanged"
          onValidate="(value) => { delay(1); return value === 'taken' ? 'Already taken' : null; }"/>
        <TextBox bindTo="other" label="Other" validationMode="onChanged" onValidate="(value) => { throw new Error('boom') }"/>
      </Form>
    </App>`);
  await type("User", "taken");
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(messages()).toEqual(["error: Already taken"]);
  await type("Other", "x");
  await settle();
  expect(messages()).toContain("error: The check failed: boom");
  expect(errors.map(String)).toContain("Error: boom");
});

test("validate() waits for a pending check", async () => {
  show(`
    <App var.result="">
      <Form id="form">
        <TextBox bindTo="user" label="User" initialValue="taken"
          onValidate="(value) => { delay(10); return value === 'taken' ? { isValid: false, invalidMessage: 'Taken', severity: 'warning' } : null; }"/>
      </Form>
      <Button label="Validate" onClick="result = JSON.stringify(form.validate())"/>
      <Text>result: {result}</Text>
    </App>`);
  await click("Validate");
  await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
  expect(text("result:")).toBe('result: {"isValid":true,"errors":{},"warnings":{"user":["Taken"]},"data":{"user":"taken"}}');
});

test("the label marks a required input; Form enabled=false disables the inputs and the buttons", () => {
  show(`
    <App>
      <Form enabled="false">
        <TextBox bindTo="name" label="Name" required/>
      </Form>
    </App>`);
  const field = document.querySelector(".gfui-Field:has(> .gfui-Label)")!;
  expect(field.hasAttribute("data-required")).toBe(true);
  expect(input("Name").disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
});

test("IDs inside a Form stay file-scoped; $data is not visible outside", () => {
  show(`
    <App>
      <Form hideButtonRow><TextBox id="box" bindTo="name" label="Name" initialValue="Ann"/></Form>
      <Text>outside: {box.value}</Text>
    </App>`);
  expect(text("outside:")).toBe("outside: Ann");
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("buttonRowTemplate replaces the buttons and sees $data", async () => {
  show(`
    <App>
      <Form id="form">
        <TextBox bindTo="name" label="Name"/>
        <property name="buttonRowTemplate"><Button label="{'Send ' + ($data.name ?? '')}" onClick="form.submit()"/></property>
      </Form>
    </App>`);
  await type("Name", "Ann");
  expect(screen.getByRole("button", { name: "Send Ann" })).toBeTruthy();
});

test("outside a Form, a bound input works unbound and the problem is reported", async () => {
  show(`<App><TextBox bindTo="name" label="Name"/></App>`);
  await type("Name", "free");
  expect(input("Name").value).toBe("free");
  expect(errors.map(String)).toContain("An input with bindTo is not inside a Form: it works unbound");
});
