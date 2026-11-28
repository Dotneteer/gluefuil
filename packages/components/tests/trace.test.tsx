// Step 35: compiled markup traced end to end in jsdom: a click, the write, the
// refetch it caused, the render; a password input masked; diagnostics at their
// element's line; an error and who handled it; a navigation; render entries.
import { compileModule } from "@gluefuil/compiler";
import { defineBackend } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import {
  loadModule,
  resetAppErrors,
  resetDataState,
  resetErrorSinks,
  resetOverlayState,
  resetRouter,
  resetTrace,
  setDataDefaults,
  setDiagnosticReporter,
  setErrorReporter,
  trace,
  type TraceEntry,
} from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import * as components from "../src/index";

const backend = defineBackend({
  seed: { people: [{ id: 1, name: "Ada" }, { id: 2, name: "Alan" }, { id: 3, name: "Grace" }] },
  routes: {
    "GET /api/people": ({ db, query }) => db.people!.list().filter((p) => String(p.name).toLowerCase().includes(String(query.q ?? "").toLowerCase())),
  },
});

let server: ReturnType<typeof startTestServer>;
let restore: (() => void)[];
beforeAll(() => {
  server = startTestServer(backend);
});
afterAll(() => server.close());
beforeEach(() => {
  setDataDefaults({ jitter: false });
  resetTrace();
  restore = [setErrorReporter(() => {}), setDiagnosticReporter(() => {})];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const r of restore) r();
  vi.restoreAllMocks();
  resetTrace();
  resetErrorSinks();
  resetAppErrors();
  resetOverlayState();
  resetDataState();
  resetRouter();
  backend.reset();
});

function mount(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function", fileName: "Main.gui", locationFile: "src/Main.gui" });
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const of = <K extends TraceEntry["kind"]>(kind: K) => trace.entries().filter((e): e is Extract<TraceEntry, { kind: K }> => e.kind === kind);
const at = (e: TraceEntry | undefined) => (e?.at ? `${e.at.file}:${e.at.line} ${e.at.element}` : "");

describe("a traced app", () => {
  test("a click: the handler, its write, the refetch the write caused (same trace), at their lines", async () => {
    trace.enable();
    mount(
      [
        '<App var.q="">',
        '  <DataSource id="people" url="/api/people" queryParams="{{ q }}"/>',
        '  <Button label="Find a" onClick="q = \'a\'"/>',
        "  <Text>found {people.value?.length ?? 0}</Text>",
        "</App>",
      ].join("\n"),
    );
    await screen.findByText("found 3");
    fireEvent.click(screen.getByRole("button", { name: "Find a" }));
    await screen.findByText("found 3"); // Ada, Alan, Grace all have an a
    await waitFor(() => expect(of("fetch").filter((f) => f.phase === "end")).toHaveLength(2));
    const handler = of("handler").find((h) => h.event === "click")!;
    const write = of("state").find((s) => s.variable === "q")!;
    const [, second] = of("fetch").filter((f) => f.phase === "start");
    expect(at(handler)).toBe("src/Main.gui:3 Button");
    expect(at(write)).toBe("src/Main.gui:1 q");
    expect(write).toMatchObject({ before: "", after: "a", traceId: handler.traceId });
    expect(second).toMatchObject({ owner: { component: "DataSource", id: "people" }, traceId: handler.traceId, causes: [{ entry: write.seq }] });
    expect(at(second)).toBe("src/Main.gui:2 DataSource");
    expect(second!.url).toContain("q=a");
  });

  test("render entries (opt-in): the elements a write re-rendered, and why", async () => {
    trace.enable({ render: true });
    mount(['<App var.n="{0}">', '  <Button label="Add" onClick="n++"/>', "  <Text>n = {n}</Text>", "</App>"].join("\n"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("n = 1");
    const write = of("state")[0]!;
    const renders = of("render");
    expect(renders.map((r) => at(r))).toEqual(["src/Main.gui:3 #text"]);
    expect(renders[0]).toMatchObject({ changed: ["value"], causes: [{ traceId: write.traceId, entry: write.seq }] });
  });

  test("a password input: its value never reaches the trace", async () => {
    trace.enable();
    mount('<App var.secret=""><PasswordInput label="Password" onDidChange="(v) => secret = v"/></App>');
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    await waitFor(() => expect(of("state")).toHaveLength(1));
    expect(JSON.stringify(trace.entries())).not.toContain("hunter2");
    expect(of("state")[0]).toMatchObject({ before: "•••", after: "•••" });
  });

  test("a component's diagnostic names its element's line", async () => {
    trace.enable();
    mount(['<App>', '  <Table data="{[{ id: 1, n: \'a\' }, { id: 1, n: \'b\' }]}">', '    <Column bindTo="n"/>', "  </Table>", "</App>"].join("\n"));
    await waitFor(() => expect(of("diagnostic")).toHaveLength(1));
    expect(of("diagnostic")[0]).toMatchObject({ category: "component" });
    expect(at(of("diagnostic")[0])).toBe("src/Main.gui:2 Table");
  });

  test("errors: an element's own onError, and App onError", async () => {
    trace.enable();
    mount(`
      <App onError="(e, event) => event.preventDefault()">
        <Button label="Own" onClick="throw new Error('mine')" onError="(e) => 0"/>
        <Button label="App" onClick="throw new Error('app')"/>
      </App>`);
    fireEvent.click(screen.getByRole("button", { name: "Own" }));
    fireEvent.click(screen.getByRole("button", { name: "App" }));
    await waitFor(() => expect(of("error")).toHaveLength(2));
    expect(of("error").map((e) => [e.message, e.handledBy])).toEqual([
      ["mine", "onError"],
      ["app", "app"],
    ]);
  });

  test("a Fallback's errors: handled by the Fallback, a loader's and a render's", async () => {
    trace.enable();
    mount(`
      <App var.boom="{false}">
        <Fallback><property name="errorTemplate"><Text>fell back: {$error.message}</Text></property>
          <DataSource id="missing" url="/api/missing"/>
        </Fallback>
        <Fallback><property name="errorTemplate"><Text>render fell back</Text></property>
          <Text>{boom ? JSON.parse('{oops') : 'fine'}</Text>
        </Fallback>
        <Button label="Boom" onClick="boom = true"/>
      </App>`);
    await screen.findByText(/^fell back:/);
    fireEvent.click(screen.getByRole("button", { name: "Boom" }));
    await screen.findByText("render fell back");
    expect(of("error").map((e) => [e.source, e.handledBy])).toEqual([
      ["loader", "fallback"],
      ["render", "fallback"],
    ]);
  });

  test("off by default: a whole app run records nothing", async () => {
    mount('<App var.n="{0}"><DataSource id="people" url="/api/people"/><Button label="Add" onClick="n++"/><Text>n = {n}</Text></App>');
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("n = 1");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(trace.enabled).toBe(false);
    expect(trace.entries()).toEqual([]);
  });
});
