// DataSource and APICall in markup (step 20; catalog rows marked I): compiled
// markup in jsdom, its `fetch` calls answered by the mock backend through MSW's
// interception (the app's code is the same as against a server). The cores'
// own tests: runtime/tests/data/*.test.ts.
import { compileModule } from "@patchfuil/compiler";
import { defineBackend, status } from "@patchfuil/mock-backend";
import { startTestServer } from "@patchfuil/mock-backend/node";
import { loadModule, resetDataState, setDataDefaults, setErrorReporter } from "@patchfuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as components from "../src/index";

const backend = defineBackend({
  seed: {
    users: [
      { id: 1, name: "Ada", role: "admin" },
      { id: 2, name: "Alan", role: "editor" },
      { id: 3, name: "Grace", role: "editor" },
    ],
  },
  routes: {
    "GET /api/users": ({ db, query }) => db.users!.list((u) => String(u.name).toLowerCase().includes(String(query.q ?? "").toLowerCase())),
    "GET /api/users/:id": ({ db, params }) => db.users!.get(params.id) ?? status(404, { message: `No user ${params.id}` }),
    "PUT /api/users/:id": ({ db, params, body }) => {
      const name = (body as { name?: unknown } | undefined)?.name;
      if (typeof name !== "string" || name === "") return status(422, { message: "Invalid user", errors: { name: "Required" } });
      return db.users!.update(params.id, { name }) ?? status(404);
    },
    "GET /api/wrapped": () => ({ data: { items: [{ n: 1 }, { n: 2 }, { n: 3 }] } }),
  },
});

let server: ReturnType<typeof startTestServer>;
let reported: unknown[];
let restoreReporter: () => void;
beforeAll(() => {
  server = startTestServer(backend);
});
afterAll(() => server.close());
beforeEach(() => {
  setDataDefaults({ jitter: false });
  reported = [];
  restoreReporter = setErrorReporter((error) => reported.push(error));
});
afterEach(() => {
  cleanup();
  restoreReporter();
  resetDataState();
  backend.reset();
});

function mount(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const seen = () => backend.log().map((e) => `${e.method} ${e.url}`);
async function held(count: number) {
  await waitFor(() => expect(backend.holds().length).toBeGreaterThanOrEqual(count));
  return backend.holds();
}

// A list with its states; ids in data-testid via a Text inside an element we can find.
const LIST = `
  <DataSource id="users" url="/api/users" queryParams="{{ q }}" retryDelay="10"/>
  <Text when="{users.inProgress}">Loading…</Text>
  <Text when="{users.error}">Error: {users.error.category} {users.error.attempts}</Text>
  <Text>Names: {(users.value ?? []).map(u => u.name).join(', ')}</Text>
  <Text>Loaded: {users.loaded}</Text>
`;

describe("DataSource", () => {
  test("loading, then the list (L1); the search changes the request (L4)", async () => {
    mount(`<App var.q=""><VStack>${LIST}<Button label="Search gr" onClick="q = 'gr'"/></VStack></App>`);
    expect(await screen.findByText("Names: Ada, Alan, Grace")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search gr" }));
    expect(await screen.findByText("Names: Grace")).toBeTruthy();
    expect(seen()).toEqual(["GET /api/users?q=", "GET /api/users?q=gr"]);
  });

  test("dependent: no request while the URL has an unresolved part or `when` is false (L3)", async () => {
    mount(`
      <App var.selected="{null}" var.enabled="{false}">
        <DataSource id="user" url="/api/users/{selected}"/>
        <DataSource id="admin" url="/api/users/1" when="{enabled}"/>
        <Text>User: {user.value.name} {user.loaded}</Text>
        <Text>Admin: {admin.value.name} {admin.loaded}</Text>
        <Button label="Pick" onClick="selected = 2"/>
        <Button label="Enable" onClick="enabled = true"/>
      </App>`);
    expect(await screen.findByText("Admin: false")).toBeTruthy();
    expect(screen.getByText("User: false")).toBeTruthy();
    expect(seen()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Pick" }));
    expect(await screen.findByText("User: Alan true")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(await screen.findByText("Admin: Ada true")).toBeTruthy();
    expect(seen()).toEqual(["GET /api/users/2", "GET /api/users/1"]);
  });

  test("resultSelector and transformResult (L5); onLoaded with the data", async () => {
    mount(`
      <App var.count="{0}">
        <DataSource id="w" url="/api/wrapped" resultSelector="data.items" transformResult="(items) => items.map(i => i.n * 10)"
          onLoaded="(data) => count = data.length"/>
        <Text>Values: {w.value.join('+')} ({count})</Text>
      </App>`);
    expect(await screen.findByText("Values: 10+20+30 (3)")).toBeTruthy();
  });

  test("errors: retried, then shown with category and attempts; onError (R1, R2)", async () => {
    backend.addFault({ route: "GET /api/users", status: 503 });
    mount(`<App var.q="" var.errors="{0}"><VStack>${LIST}</VStack><DataSource url="/api/users/1" retries="0" onError="errors++"/><Text>onError: {errors}</Text></App>`);
    expect(await screen.findByText("Error: server 3")).toBeTruthy();
    expect(seen().filter((s) => s === "GET /api/users?q=")).toHaveLength(3);
    // The other DataSource's route isn't faulted: it loaded, so no onError.
    expect(screen.getByText("onError: 0")).toBeTruthy();
  });

  test("onError once per failed fetch, with the error (a 404: no retries)", async () => {
    mount(`<App var.errors=""><DataSource url="/api/users/9" onError="(e) => errors += e.category + ':' + e.message + ';'"/><Text>Errors: {errors}</Text></App>`);
    expect(await screen.findByText("Errors: not-found:No user 9;")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    expect(seen()).toEqual(["GET /api/users/9"]);
  });

  test("a failed refetch keeps the list and shows the error; the next one clears it (X5)", async () => {
    mount(`<App var.q=""><VStack>${LIST}<Button label="Reload" onClick="users.refetch()"/></VStack></App>`);
    await screen.findByText("Names: Ada, Alan, Grace");
    backend.addFault({ route: "GET /api/users", network: "error", times: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("Error: network 3")).toBeTruthy();
    expect(screen.getByText("Names: Ada, Alan, Grace")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByText(/^Error:/)).toBeNull());
  });

  test("cancel(): the previous value stays; cancelled, reason, onCancel (C1)", async () => {
    mount(`
      <App var.q="" var.reason="">
        <VStack>${LIST}
          <DataSource id="slow" url="/api/users/1" onCancel="(r) => reason = r"/>
          <Button label="Stop" onClick="slow.cancel('stop')"/>
          <Text>Slow: {slow.inProgress} {slow.cancelled} {slow.lastCancelReason} {reason}</Text>
        </VStack>
      </App>`);
    backend.addFault({ route: "GET /api/users/:id", hold: true, times: 1 });
    await held(1);
    expect(screen.getByText("Slow: true false")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Slow: false true stop stop")).toBeTruthy();
  });

  test("unmounted while loading (a `when` above it turns false): the request aborted, no onLoaded (O3)", async () => {
    backend.addFault({ route: "GET /api/users/:id", hold: true, times: 1 });
    mount(`
      <App var.show="{true}" var.loadedCount="{0}">
        <VStack when="{show}">
          <DataSource url="/api/users/1" onLoaded="loadedCount++"/>
        </VStack>
        <Button label="Leave" onClick="show = false"/>
        <Text>Loaded: {loadedCount}</Text>
      </App>`);
    const [hold] = await held(1);
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(backend.log()[0]!.outcome).toBe("aborted"));
    backend.release(hold!.id);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("Loaded: 0")).toBeTruthy();
  });

  test("Items data=\"/api/users\": the URL shorthand", async () => {
    mount(`<App><Items data="/api/users"><Text>{$item.name};</Text></Items></App>`);
    expect(await screen.findByText("Grace;")).toBeTruthy();
    expect(screen.getByText("Ada;")).toBeTruthy();
  });
});

describe("APICall", () => {
  const EDIT = `
    <DataSource id="users" url="/api/users"/>
    <APICall id="rename" method="put" url="/api/users/{$param.id}" body="{$param}" invalidates="/api/users"
      onError="(e) => message = e.category + ': ' + (e.body.errors.name ?? e.message)"/>
    <Text>Names: {(users.value ?? []).map(u => u.name).join(', ')}</Text>
    <Text>Message: {message}</Text>
    <Text>Saving: {rename.inProgress}</Text>
  `;

  test("execute($param): the PUT from the arguments, then the list refetches (W1, W5)", async () => {
    mount(`<App var.message=""><VStack>${EDIT}<Button label="Rename" onClick="rename.execute({ id: 2, name: 'Alan Turing' })"/></VStack></App>`);
    await screen.findByText("Names: Ada, Alan, Grace");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("Names: Ada, Alan Turing, Grace")).toBeTruthy();
    expect(seen()).toEqual(["GET /api/users", "PUT /api/users/2", "GET /api/users"]);
    expect(backend.log()[1]!.body).toEqual({ id: 2, name: "Alan Turing" });
  });

  test("a 422's field errors reach script through the error (X6)", async () => {
    mount(`<App var.message=""><VStack>${EDIT}<Button label="Rename" onClick="rename.execute({ id: 2, name: '' })"/></VStack></App>`);
    await screen.findByText("Names: Ada, Alan, Grace");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("Message: validation: Required")).toBeTruthy();
  });

  test("beforeRequest returning false: no request (W2); its result reaches the component", async () => {
    mount(`
      <App>
        <APICall id="save" method="put" url="/api/users/{$param}" body="{{ name: 'X' }}" onBeforeRequest="(id) => id !== 2"/>
        <Button label="Save 2" onClick="save.execute(2)"/>
        <Button label="Save 3" onClick="save.execute(3)"/>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Save 2" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Save 3" }));
    await waitFor(() => expect(seen()).toEqual(["PUT /api/users/3"]));
  });

  test("without onError, execute() rejects: the handler stops and the error is reported once (X7)", async () => {
    mount(`
      <App var.after="{false}">
        <APICall id="save" method="put" url="/api/users/1" body="{{ name: '' }}"/>
        <Button label="Save" onClick="save.execute(); after = true"/>
        <Text>After: {after}</Text>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0]).toMatchObject({ category: "validation", status: 422 });
    expect(screen.getByText("After: false")).toBeTruthy();
  });

  test("the handler is superseded (single-flight): its request is aborted (C4)", async () => {
    backend.addFault({ route: "PUT /api/users/:id", hold: true, times: 1 });
    mount(`
      <App var.reasons="">
        <APICall id="save" method="put" url="/api/users/1" body="{{ name: 'Ada' }}" invalidates="/nothing" onCancel="(r) => reasons += r"/>
        <Button label="Save" handlerPolicy="single-flight" onClick="save.execute()"/>
        <Text>Reasons: {reasons}</Text>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await held(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Reasons: supersede")).toBeTruthy();
    await waitFor(() => expect(backend.log()[0]!.outcome).toBe("aborted"));
    await waitFor(() => expect(seen()).toEqual(["PUT /api/users/1", "PUT /api/users/1"]));
  });

  test("cancel() from markup during execute(): no success, onCancel (C3)", async () => {
    backend.addFault({ route: "PUT /api/users/:id", hold: true, times: 1 });
    mount(`
      <App var.log="">
        <APICall id="save" method="put" url="/api/users/1" body="{{ name: 'Ada' }}" onSuccess="log += 'success'" onCancel="(r) => log += 'cancel:' + r"/>
        <Button label="Save" onClick="save.execute()"/>
        <Button label="Cancel" onClick="save.cancel()"/>
        <Text>Log: {log}</Text>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await held(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(await screen.findByText("Log: cancel:user")).toBeTruthy();
  });
});
