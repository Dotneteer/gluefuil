// Step 22B in jsdom, against the mock backend (MSW in Node): a Form loading
// its data from a URL, submitting to a URL, server validation errors on the
// inputs, cancel() and unmount, and invalidation.
import { compileModule } from "@gluefuil/compiler";
import { defineBackend, status } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import { loadModule, resetDataState, setDataDefaults, setErrorReporter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import * as components from "../src/index";

const backend = defineBackend({
  seed: {
    people: [
      { id: 1, name: "Ada", email: "ada@example.com", address: { city: "London" } },
      { id: 2, name: "Alan", email: "alan@example.com", address: { city: "Wilmslow" } },
    ],
  },
  routes: {
    "GET /api/people": ({ db }) => db.people!.list(),
    "GET /api/people/:id": ({ db, params }) => db.people!.get(params.id) ?? status(404, { message: `No person ${params.id}` }),
    "PUT /api/people/:id": ({ db, params, body }) => {
      const person = body as { name?: string; email?: string; address?: { city?: string } };
      const problems = [
        ...(person.email === "taken@example.com" ? [{ name: "email", reason: "Already registered" }] : []),
        ...(person.address?.city === "Atlantis" ? [{ name: "address.city", reason: "Unknown city" }] : []),
        ...(person.name === "Zed" ? [{ name: "nickname", reason: "Required for Zed" }] : []),
      ];
      if (problems.length > 0) return status(422, { title: "Invalid", detail: "Please check the form", "invalid-params": problems });
      return db.people!.update(params.id, person as Record<string, unknown>) ?? status(404);
    },
    "POST /api/signup": ({ body }) => {
      const { name } = body as { name?: string };
      if (name === "taken") return status(422, { message: "The given data was invalid.", errors: { name: ["This name is taken"] } });
      return status(201, { id: 99, name });
    },
  },
});

let server: ReturnType<typeof startTestServer>;
let reported: unknown[];
let restore: () => void;
beforeAll(() => {
  server = startTestServer(backend);
});
afterAll(() => server.close());
beforeEach(() => {
  setDataDefaults({ jitter: false });
  reported = [];
  restore = setErrorReporter((error) => reported.push(error));
});
afterEach(() => {
  cleanup();
  restore();
  resetDataState();
  backend.reset();
});

function mount(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components }) as ComponentType;
  return render(<Main />);
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => act(async () => fireEvent.change(input(label), { target: { value } }));
const save = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
const messages = () => [...document.querySelectorAll(".gfui-Field-messages .gfui-ValidationMessage")].map((e) => e.textContent);
const summary = () => [...document.querySelectorAll(".gfui-Form-summary .gfui-ValidationMessage")].map((e) => e.textContent);
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent;
const requests = () => backend.log().map((e) => `${e.method} ${e.url.replace(/^https?:\/\/[^/]+/, "")}`);

const PROFILE = `
  <App var.message="">
    <DataSource id="people" url="/api/people"/>
    <Form id="profile" data="/api/people/1" onSuccess="(saved) => message = 'Saved ' + saved.name">
      <TextBox bindTo="name" label="Name" required/>
      <TextBox bindTo="email" label="Email" required/>
      <TextBox bindTo="address.city" label="City"/>
    </Form>
    <Text>message: {message}</Text>
    <Text>people: {(people.value ?? []).map(p => p.name).join(', ')}</Text>
    <Text>submitting: {profile.isSubmitting} cancelled: {profile.cancelled}</Text>
    <Button label="Stop" onClick="profile.cancel()"/>
  </App>`;

test("data as a URL: disabled while loading, then filled; saving PUTs back to it and refreshes the queries", async () => {
  backend.addFault({ route: "GET /api/people/:id", hold: true, times: 1 });
  mount(PROFILE);
  await waitFor(() => expect(backend.holds().length).toBe(1));
  expect(input("Name").disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => backend.release(backend.holds()[0]!.id));
  await waitFor(() => expect(input("Name").value).toBe("Ada"));
  expect(input("City").value).toBe("London");
  expect(input("Name").disabled).toBe(false);
  await waitFor(() => expect(text("people:")).toBe("people: Ada, Alan"));

  await type("Name", "Ada L.");
  await save();
  await waitFor(() => expect(text("message:")).toBe("message: Saved Ada L."));
  expect(requests()).toContain("PUT /api/people/1");
  // Every query was invalidated: the list refetched.
  await waitFor(() => expect(text("people:")).toBe("people: Ada L., Alan"));
  // The refetched `data` URL is not applied again (the first value is the baseline).
  expect(input("Name").value).toBe("Ada L.");
});

test("a 422 with invalid-params: messages on the inputs (a nested path too), the detail in the summary; an edit clears one; the resubmit succeeds", async () => {
  mount(PROFILE);
  await waitFor(() => expect(input("Name").value).toBe("Ada"));
  await type("Email", "taken@example.com");
  await type("City", "Atlantis");
  await save();
  await waitFor(() => expect(messages()).toEqual(["Already registered", "Unknown city"]));
  expect(summary()).toEqual(["Please check the form"]);
  await waitFor(() => expect(document.activeElement).toBe(input("Email")));
  expect(reported).toEqual([]);
  await type("City", "Paris");
  expect(messages()).toEqual(["Already registered"]);
  await type("Email", "ada@lovelace.org");
  expect(messages()).toEqual([]);
  await save();
  await waitFor(() => expect(text("message:")).toBe("message: Saved Ada"));
  expect(summary()).toEqual([]);
});

test("a server error for a name with no input goes to the summary as name: message", async () => {
  mount(PROFILE);
  await waitFor(() => expect(input("Name").value).toBe("Ada"));
  await type("Name", "Zed");
  await save();
  await waitFor(() => expect(summary()).toEqual(["nickname: Required for Zed"]));
  expect(messages()).toEqual([]);
});

test("a 500: its message in the summary, submitError gets the error; the data stays", async () => {
  backend.addFault({ route: "PUT /api/people/:id", status: 500, body: { message: "Database down" } });
  mount(`
    <App var.log="">
      <Form data="/api/people/1" onSubmitError="(error, problem) => log = error.status + ' ' + (problem === undefined)">
        <TextBox bindTo="name" label="Name"/>
      </Form>
      <Text>log: {log}</Text>
    </App>`);
  await waitFor(() => expect(input("Name").value).toBe("Ada"));
  await type("Name", "Ada!");
  await save();
  await waitFor(() => expect(summary()).toEqual(["Database down"]));
  expect(text("log:")).toBe("log: 500 true");
  expect(input("Name").value).toBe("Ada!");
});

test("submitUrl POSTs a new record (no data: post); a Laravel 422 lands on the input", async () => {
  mount(`
    <App var.created="">
      <Form submitUrl="/api/signup" onSuccess="(r) => created = r.id + ' ' + r.name">
        <TextBox bindTo="name" label="Name" required/>
      </Form>
      <Text>created: {created}</Text>
    </App>`);
  await type("Name", "taken");
  await save();
  await waitFor(() => expect(messages()).toEqual(["This name is taken"]));
  expect(summary()).toEqual(["The given data was invalid."]);
  await type("Name", "Grace");
  await save();
  await waitFor(() => expect(text("created:")).toBe("created: 99 Grace"));
  expect(requests().filter((r) => r.startsWith("POST"))).toEqual(["POST /api/signup", "POST /api/signup"]);
});

test("onSubmit wins over submitUrl", async () => {
  mount(`
    <App var.log="">
      <Form submitUrl="/api/signup" onSubmit="(data) => log = 'handler ' + data.name">
        <TextBox bindTo="name" label="Name" initialValue="Ann"/>
      </Form>
      <Text>log: {log}</Text>
    </App>`);
  await save();
  await waitFor(() => expect(text("log:")).toBe("log: handler Ann"));
  expect(requests().some((r) => r.startsWith("POST"))).toBe(false);
});

test("cancel() during a held submit: it ends quietly, cancelled is set, the data stays", async () => {
  mount(PROFILE);
  await waitFor(() => expect(input("Name").value).toBe("Ada"));
  backend.addFault({ route: "PUT /api/people/:id", hold: true, times: 1 });
  await type("Name", "Ada L.");
  await save();
  await waitFor(() => expect(backend.holds().length).toBe(1));
  expect(text("submitting:")).toBe("submitting: true cancelled: false");
  expect(input("Name").disabled).toBe(true);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Stop" })));
  await waitFor(() => expect(text("submitting:")).toBe("submitting: false cancelled: true"));
  expect(text("message:")).toBe("message: ");
  expect(summary()).toEqual([]);
  expect(input("Name").value).toBe("Ada L.");
  expect(input("Name").disabled).toBe(false);
});

test("a failed data load: the form stays disabled, the message in the summary", async () => {
  mount(`<App><Form data="/api/people/7"><TextBox bindTo="name" label="Name"/></Form></App>`);
  await waitFor(() => expect(summary()).toEqual(["Couldn't load the form's data: No person 7"]));
  expect(input("Name").disabled).toBe(true);
});

test("unmounting during a submit aborts the request; nothing fires afterwards", async () => {
  const view = mount(`
    <App var.show="{true}" var.log="">
      <Form when="{show}" submitUrl="/api/signup" onSuccess="log = 'success'" onSubmitError="log = 'error'">
        <TextBox bindTo="name" label="Name" initialValue="Ann"/>
      </Form>
      <Button label="Hide" onClick="show = false"/>
      <Text>log: {log}</Text>
    </App>`);
  backend.addFault({ route: "POST /api/signup", hold: true, times: 1 });
  await save();
  await waitFor(() => expect(backend.holds().length).toBe(1));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hide" })));
  // The aborted request ends its hold (the test server sees the abort).
  await waitFor(() => expect(backend.holds()).toEqual([]));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(text("log:")).toBe("log: ");
  view.unmount();
});
