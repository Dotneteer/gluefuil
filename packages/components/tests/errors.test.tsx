// Step 33 in markup: App onError and App.errors, the per-element onError,
// AppError in script, Fallback, the built-in boundaries, RetryPolicy. Compiled
// markup in jsdom; DataSources answered by the mock backend (MSW in Node).
// Design: .ai/plan/poc-33-errors.md
import { compileModule } from "@gluefuil/compiler";
import { defineBackend, status } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import { loadModule, mountApp, resetAppErrors, resetDataState, resetErrorSinks, resetOverlayState, setDataDefaults, setDiagnosticReporter, setErrorReporter, toasts } from "@gluefuil/runtime";
import { renderStatic } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import * as components from "../src/index";
import { Fallback } from "../src/index";

const backend = defineBackend({
  seed: { items: [{ id: 1, name: "One" }] },
  routes: {
    "GET /api/items": ({ db }) => db.items!.list(),
    "GET /api/missing": () => status(404, { message: "No such thing" }),
  },
});

let server: ReturnType<typeof startTestServer>;
let consoleErrors: unknown[];
let diagnostics: unknown[];
let restore: (() => void)[];
beforeAll(() => {
  server = startTestServer(backend);
});
afterAll(() => server.close());
beforeEach(() => {
  setDataDefaults({ jitter: false });
  consoleErrors = [];
  diagnostics = [];
  restore = [setErrorReporter((e) => consoleErrors.push(e)), setDiagnosticReporter((p) => diagnostics.push(p))];
  // React logs the render errors boundaries catch; they are expected here.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const r of restore) r();
  vi.restoreAllMocks();
  resetErrorSinks();
  resetAppErrors();
  resetOverlayState();
  resetDataState();
  backend.reset();
});

function mount(markup: string) {
  const { code, diagnostics: problems } = compileModule(markup, { format: "function" });
  expect(problems).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const text = (prefix: string) => screen.getByText((content) => content.startsWith(prefix)).textContent;
const toastMessages = () => toasts.peek().map((t) => t.message);

describe("App onError and App.errors", () => {
  test("a handler error: onError gets the AppError; preventDefault suppresses the toast; App.errors counts it", async () => {
    mount(`
      <App var.last="none" onError="(error, event) => { event.preventDefault(); last = error.category + '/' + error.code + '/' + error.message }">
        <Button label="Fail" onClick="throw new Error('Export failed')"/>
        <Text>last: {last}</Text>
        <Text>count: {App.errors.length}</Text>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    await waitFor(() => expect(text("last:")).toBe("last: internal/unknown/Export failed"));
    expect(text("count:")).toBe("count: 1");
    expect(toastMessages()).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("without onError: the default report (a toast, the announcement, the console)", async () => {
    const { container } = mount(`<App><Button label="Fail" onClick="throw new Error('Save failed')"/></App>`);
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    await waitFor(() => expect(toastMessages()).toEqual(["Save failed"]));
    expect(container.querySelector(".gfui-ErrorAnnouncer")?.textContent).toBe("Save failed");
    expect(container.querySelector(".gfui-ErrorAnnouncer")?.getAttribute("aria-live")).toBe("assertive");
    expect(consoleErrors.map(String)).toEqual(["Error: Save failed"]);
  });

  test("throw new AppError({...}) in script: its code and category; instanceof in a catch", async () => {
    mount(`
      <App var.last="" var.caught="" onError="(error) => last = error.code + ':' + error.category + ':' + error.retryable">
        <Button label="Throw" onClick="throw new AppError({ code: 'export-off', category: 'rate-limit', message: 'Slow down' })"/>
        <Button label="Catch" onClick="try { throw new AppError({ category: 'conflict' }) } catch (e) { caught = (e instanceof AppError) + ':' + e.code }"/>
        <Text>last: {last}</Text>
        <Text>caught: {caught}</Text>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Throw" }));
    fireEvent.click(screen.getByRole("button", { name: "Catch" }));
    await waitFor(() => expect(text("last:")).toBe("last: export-off:rate-limit:true"));
    expect(text("caught:")).toBe("caught: true:unknown");
  });

  test("a developer diagnostic (duplicate List ids) never reaches onError", async () => {
    mount(`
      <App var.n="{0}" onError="n++">
        <List data="{[{ id: 1 }, { id: 1 }]}"><Text>{$item.id}</Text></List>
        <Text>errors: {n}</Text>
      </App>`);
    await waitFor(() => expect(diagnostics.length).toBe(1));
    expect(text("errors:")).toBe("errors: 0");
  });
});

describe("the per-element onError", () => {
  test("handles its handlers' errors ('action') and its lifecycle's ('mount'); App onError sees none of them", async () => {
    mount(`
      <App var.log="" var.app="{0}" onError="app++">
        <Button label="Go" onClick="throw new Error('click broke')" onError="(e, source) => log += source + ':' + e.message + ';'"/>
        <Stack onMount="throw new Error('init broke')" onError="(e, source) => log += source + ':' + e.message + ';'"/>
        <Text>log: {log}</Text>
        <Text>app: {app}</Text>
      </App>`);
    await waitFor(() => expect(text("log:")).toBe("log: mount:init broke;"));
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(text("log:")).toBe("log: mount:init broke;action:click broke;"));
    expect(text("app:")).toBe("app: 0");
    expect(toastMessages()).toEqual([]);
  });

  test("an error inside onError itself goes on to App onError", async () => {
    mount(`
      <App var.last="" onError="(e) => last = e.message">
        <Button label="Go" onClick="throw new Error('first')" onError="throw new Error('handler broke')"/>
        <Text>last: {last}</Text>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(text("last:")).toBe("last: handler broke"));
  });
});

describe("DataSource errors", () => {
  test("without its own onError: App onError (a 404 as http-404, not-found); with it: handled there", async () => {
    mount(`
      <App var.app="" var.own="" onError="(e) => app += e.code + ';'">
        <DataSource id="a" url="/api/missing"/>
        <DataSource id="b" url="/api/missing?b" onError="(e) => own = e.category + ':' + e.data.statusCode"/>
        <Text>app: {app}</Text>
        <Text>own: {own}</Text>
      </App>`);
    await waitFor(() => expect(text("own:")).toBe("own: not-found:404"));
    await waitFor(() => expect(text("app:")).toBe("app: http-404;"));
  });
});

describe("Fallback", () => {
  test("a child that throws while rendering: the errorTemplate with $error; the rest of the page and App onError untouched", async () => {
    mount(`
      <App var.app="{0}" onError="app++">
        <Text>before</Text>
        <Fallback>
          <property name="errorTemplate"><Text>failed: {$error.category}: {$error.message}</Text></property>
          <Text value="{JSON.parse('{oops')}"/>
        </Fallback>
        <Text>app: {app}</Text>
      </App>`);
    await waitFor(() => expect(text("failed:")).toMatch(/^failed: internal: .*JSON/));
    expect(screen.getByText("before")).toBeTruthy();
    expect(text("app:")).toBe("app: 0");
  });

  test("a DataSource that fails inside: the template; reset() mounts the children again and they load", async () => {
    backend.addFault({ route: "GET /api/items", status: 503, times: 1 });
    mount(`
      <App>
        <Fallback id="section">
          <property name="errorTemplate">
            <Text>failed: {$error.code}</Text>
            <Button label="Try again" onClick="section.reset()"/>
          </property>
          <DataSource id="items" url="/api/items" retries="0"/>
          <Text>items: {items.value ? items.value.length : '…'}</Text>
        </Fallback>
        <Text>shown: {section.error ? section.error.code : 'none'}</Text>
      </App>`);
    await waitFor(() => expect(text("failed:")).toBe("failed: http-503"));
    expect(text("shown:")).toBe("shown: http-503");
    expect(toastMessages()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(text("items:")).toBe("items: 1"));
    expect(text("shown:")).toBe("shown: none");
  });

  test("a DataSource with its own onError doesn't switch the Fallback", async () => {
    mount(`
      <App var.own="">
        <Fallback>
          <property name="errorTemplate"><Text>failed</Text></property>
          <DataSource id="d" url="/api/missing" onError="(e) => own = e.code"/>
          <Text>own: {own}</Text>
        </Fallback>
      </App>`);
    await waitFor(() => expect(text("own:")).toBe("own: http-404"));
    expect(screen.queryByText("failed")).toBeNull();
  });

  test("an error inside the errorTemplate goes to the next Fallback out", async () => {
    mount(`
      <App>
        <Fallback>
          <property name="errorTemplate"><Text>outer: {$error.message}</Text></property>
          <Fallback>
            <property name="errorTemplate"><Text value="{JSON.parse('in template')}"/></property>
            <Text value="{JSON.parse('first')}"/>
          </Fallback>
        </Fallback>
      </App>`);
    await waitFor(() => expect(text("outer:")).toMatch(/^outer: Unexpected token .i./));
  });

  test("isLoading shows the loadingTemplate; without an errorTemplate an error shows nothing", async () => {
    mount(`
      <App var.loading="{true}">
        <Fallback isLoading="{loading}">
          <property name="loadingTemplate"><Text>loading…</Text></property>
          <Button label="Done" onClick="loading = false"/>
        </Fallback>
        <Fallback><Text value="{JSON.parse('x')}"/></Fallback>
        <Text>end</Text>
      </App>`);
    expect(screen.getByText("loading…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});

describe("the built-in boundaries", () => {
  test("a Page that throws: a panel in its place, the shell stays, App onError gets it; Try again renders it again", async () => {
    mount(`
      <App var.app="" var.broken="{true}" onError="(e) => app = e.message">
        <AppHeader><Text>header</Text></AppHeader>
        <Pages>
          <Page url="/"><Text value="{broken ? JSON.parse('boom') : 'fixed'}"/></Page>
        </Pages>
        <Footer><Button label="Fix" onClick="broken = false"/><Text>app: {app}</Text></Footer>
      </App>`);
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeTruthy());
    expect(screen.getByText("header")).toBeTruthy();
    expect(text("app:")).toMatch(/^app: .*JSON/);
    fireEvent.click(screen.getByRole("button", { name: "Fix" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("fixed")).toBeTruthy());
  });
});

describe("RetryPolicy", () => {
  test("503 twice, then the data: three attempts under the policy", async () => {
    backend.addFault({ route: "GET /api/items", status: 503, times: 2 });
    mount(`
      <App>
        <RetryPolicy attempts="3" backoff="fixed" delayMs="5">
          <DataSource id="items" url="/api/items"/>
        </RetryPolicy>
        <Text>items: {items.value ? items.value.length : '…'}</Text>
      </App>`);
    await waitFor(() => expect(text("items:")).toBe("items: 1"));
    expect(backend.log().length).toBe(3);
  });

  test("a DataSource's own retries win over the policy", async () => {
    backend.addFault({ route: "GET /api/items", status: 503, times: 2 });
    mount(`
      <App var.err="" onError="(e, event) => { event.preventDefault(); err = e.code + '@' + e.attempts }">
        <RetryPolicy attempts="5" delayMs="5">
          <DataSource id="items" url="/api/items" retries="0"/>
        </RetryPolicy>
        <Text>err: {err}</Text>
      </App>`);
    await waitFor(() => expect(text("err:")).toBe("err: http-503@1"));
    expect(backend.log().length).toBe(1);
  });

  test("the circuit breaker: two failed attempts open it; the next DataSource fails fast", async () => {
    backend.addFault({ route: "GET /api/items", status: 503 });
    mount(`
      <App var.codes="" var.second="{false}" onError="(e, event) => { event.preventDefault(); codes += e.code + ';' }">
        <RetryPolicy attempts="2" delayMs="5" circuitBreaker="{{ failureThreshold: 2, resetMs: 60000 }}">
          <DataSource id="a" url="/api/items"/>
          <DataSource id="b" url="/api/items?b" when="{second}"/>
        </RetryPolicy>
        <Button label="Second" onClick="second = true"/>
        <Text>codes: {codes}</Text>
      </App>`);
    await waitFor(() => expect(text("codes:")).toBe("codes: http-503;"));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    await waitFor(() => expect(text("codes:")).toBe("codes: http-503;circuit-open;"));
    expect(backend.log().length).toBe(2);
  });
});

describe("the prerender (decision A)", () => {
  let container: HTMLElement;
  let root: Root | undefined;
  let failOnServer = true;
  let failOnClient = false;
  let phase: "server" | "client" = "server";
  function Flaky() {
    const server = phase === "server";
    if ((server && failOnServer) || (!server && failOnClient)) throw new Error(phase);
    return <p className="content">content</p>;
  }
  const page = () => (
    <main>
      <h1 className="before">before</h1>
      <Fallback errorTemplate={(context) => <p className="failed">failed: {(context.$error as Error).message}</p>}>
        <Flaky />
      </Fallback>
      <footer className="after">after</footer>
    </main>
  );
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    container.remove();
  });

  async function prerenderAndTakeOver(clientFails: boolean) {
    failOnServer = true;
    failOnClient = clientFails;
    phase = "server";
    const { html, attributes } = renderStatic(page());
    phase = "client";
    container.innerHTML = html;
    for (const [name, value] of Object.entries(attributes)) container.setAttribute(name, value);
    const before = container.querySelector(".before");
    const after = container.querySelector(".after");
    const recoverable: unknown[] = [];
    await act(async () => {
      root = mountApp(container, page());
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    return { html, before, after, recoverable };
  }

  test("a child that throws in the server render: the rest is prerendered, the section is marked for the client", () => {
    phase = "server";
    const { html } = renderStatic(page());
    expect(html).toContain('<h1 class="before">before</h1>');
    expect(html).toContain('<footer class="after">after</footer>');
    // React's client-render marker (the plugin warns about it: vite-plugin clientRenderedSections).
    expect(html.split("<!--$!-->").length - 1).toBe(1);
    expect(html).not.toContain("content");
  });

  test("the client renders the content when only the server failed; the other nodes are kept; hydration's recoverable error is a diagnostic", async () => {
    const { before, after } = await prerenderAndTakeOver(false);
    expect(container.querySelector(".content")?.textContent).toBe("content");
    expect(container.querySelector(".before")).toBe(before);
    expect(container.querySelector(".after")).toBe(after);
    expect(consoleErrors).toEqual([]);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test("the client fails too: the errorTemplate; the other nodes are kept", async () => {
    const { before, after } = await prerenderAndTakeOver(true);
    expect(container.querySelector(".failed")?.textContent).toBe("failed: client");
    expect(container.querySelector(".before")).toBe(before);
    expect(container.querySelector(".after")).toBe(after);
  });

  test("outside a Fallback a render error still fails the server render (the build)", () => {
    failOnServer = true;
    phase = "server";
    expect(() => renderStatic(<main><Flaky /></main>)).toThrow("server");
  });
});
