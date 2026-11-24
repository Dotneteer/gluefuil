// The standalone loader against a mocked server: compile, cache, errors, watching.
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { StorageLike } from "../src/cache";
import { StandaloneApp } from "../src/loader";

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

/** A tiny "server": files by name; counts requests. */
function server(files: Record<string, string>) {
  const requests: { url: string; init?: RequestInit }[] = [];
  return {
    files,
    requests,
    fetch: async (url: string, init?: RequestInit) => {
      requests.push({ url, ...(init ? { init } : {}) });
      const body = files[url];
      return body === undefined ? new Response("not found", { status: 404, statusText: "Not Found" }) : new Response(body);
    },
  };
}

let apps: StandaloneApp[] = [];
let container: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  for (const app of apps) act(() => app.stop());
  apps = [];
  container.remove();
  cleanup();
});

async function startApp(options: ConstructorParameters<typeof StandaloneApp>[0]) {
  const app = new StandaloneApp({ root: container, watch: false, buildId: "test", ...options });
  apps.push(app);
  await act(() => app.start());
  return app;
}

const MAIN = '<App var.n="{2}"><Text>n * 21 = {n * 21}</Text></App>';

describe("loading", () => {
  test("the first load compiles; the next load (same source) comes from the cache", async () => {
    const storage = new MemoryStorage();
    const files = server({ "Main.pfui": MAIN });
    const first = await startApp({ fetch: files.fetch, storage });
    expect(container.textContent).toBe("n * 21 = 42");
    expect(first.status).toMatchObject({ source: "compiled", loads: 1 });
    expect(first.status!.compileMs).toBeGreaterThanOrEqual(0);
    expect([...storage.items.keys()]).toEqual(["pfui:test:Main.pfui"]);
    act(() => first.stop());

    const second = await startApp({ fetch: files.fetch, storage });
    expect(container.textContent).toBe("n * 21 = 42");
    expect(second.status).toMatchObject({ source: "cache" });
  });

  test("a changed source is compiled again", async () => {
    const storage = new MemoryStorage();
    const files = server({ "Main.pfui": MAIN });
    const first = await startApp({ fetch: files.fetch, storage });
    act(() => first.stop());
    files.files["Main.pfui"] = MAIN.replace("{2}", "{3}");
    const second = await startApp({ fetch: files.fetch, storage });
    expect(second.status!.source).toBe("compiled");
    expect(container.textContent).toBe("n * 21 = 63");
  });

  test("cache: false never touches the storage", async () => {
    const storage = new MemoryStorage();
    const app = await startApp({ fetch: server({ "Main.pfui": MAIN }).fetch, storage, cache: false });
    expect(app.status!.source).toBe("compiled");
    expect(storage.items.size).toBe(0);
  });

  test("the entry file and the first fetch's cache mode", async () => {
    const files = server({ "app/Start.pfui": "<App><Text>start</Text></App>" });
    await startApp({ fetch: files.fetch, main: "app/Start.pfui" });
    expect(container.textContent).toBe("start");
    expect(files.requests[0]).toEqual({ url: "app/Start.pfui", init: { cache: "no-cache" } });
  });
});

describe("errors", () => {
  test("compile errors show the overlay with positions and the source line; nothing is cached", async () => {
    const storage = new MemoryStorage();
    const app = await startApp({ fetch: server({ "Main.pfui": "<App>\n  <Text value=\"{missing}\"/>\n</App>" }).fetch, storage });
    const overlay = container.querySelector('[role="alert"]');
    expect(overlay?.textContent).toContain("Main.pfui:2:17: error C001: Cannot find name 'missing'");
    expect(overlay?.textContent).toContain('<Text value="{missing}"/>');
    expect(app.status!.source).toBe("error");
    expect(storage.items.size).toBe(0);
  });

  test("a missing file shows the overlay", async () => {
    await startApp({ fetch: server({}).fetch });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Main.pfui: HTTP 404 Not Found");
  });
});

describe("watching", () => {
  test("refresh() picks up a change; an error shows the overlay; fixing it recovers", async () => {
    const files = server({ "Main.pfui": MAIN });
    const app = await startApp({ fetch: files.fetch });
    expect(await act(() => app.refresh())).toBe(false); // unchanged
    expect(files.requests.at(-1)!.init).toEqual({ cache: "no-store" });

    files.files["Main.pfui"] = "<App><Text>edited</Text></App>";
    expect(await act(() => app.refresh())).toBe(true);
    expect(container.textContent).toBe("edited");
    expect(app.status!.loads).toBe(2);

    files.files["Main.pfui"] = "<App><Text>broken</App>";
    await act(() => app.refresh());
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    files.files["Main.pfui"] = "<App><Text>fixed</Text></App>";
    await act(() => app.refresh());
    expect(container.textContent).toBe("fixed");
  });

  test("polling refreshes on its own", async () => {
    const files = server({ "Main.pfui": MAIN });
    await startApp({ fetch: files.fetch, watch: true, watchInterval: 20 });
    files.files["Main.pfui"] = "<App><Text>polled</Text></App>";
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));
    expect(container.textContent).toBe("polled");
  });
});

describe("component files and code-behind (step 14)", () => {
  const COUNTER = `
    <Component name="Counter">
      <Stack><Button label="{label + ': ' + count}" onClick="bump()"/><Slot/></Stack>
    </Component>`;
  const COUNTER_XS = "var count = 0;\nvar label = 'count';\nfunction bump() { count++; }";

  test("used components are fetched from components/ next to the entry file, with their code-behind", async () => {
    const files = server({
      "app/Main.pfui": "<App><Counter><Text>{title}</Text></Counter><Badge/></App>",
      "app/Main.pfui.xs": "var title = 'inside';",
      "app/components/Counter.pfui": COUNTER,
      "app/components/Counter.pfui.xs": COUNTER_XS,
      "app/components/Badge.pfui": '<Component name="Badge"><Text>badge</Text></Component>',
    });
    const app = await startApp({ fetch: files.fetch, main: "app/Main.pfui" });
    expect(container.textContent).toBe("count: 0insidebadge");
    // Referenced names are visited in sorted order.
    expect(app.status!.components).toEqual(["app/components/Badge.pfui", "app/components/Counter.pfui"]);
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("button")!.textContent).toBe("count: 1");
    // Built-in names are never fetched.
    expect(files.requests.map((r) => r.url).filter((u) => u.includes("components/")).sort()).toEqual([
      "app/components/Badge.pfui",
      "app/components/Badge.pfui.xs",
      "app/components/Counter.pfui",
      "app/components/Counter.pfui.xs",
    ]);
  });

  test("components using components are followed; each file is cached on its own", async () => {
    const storage = new MemoryStorage();
    const files = server({
      "Main.pfui": "<App><Outer/></App>",
      "components/Outer.pfui": '<Component name="Outer"><Inner/></Component>',
      "components/Inner.pfui": '<Component name="Inner"><Text>inner</Text></Component>',
    });
    const first = await startApp({ fetch: files.fetch, storage });
    expect(container.textContent).toBe("inner");
    expect([...storage.items.keys()].sort()).toEqual(["pfui:test:Main.pfui", "pfui:test:components/Inner.pfui", "pfui:test:components/Outer.pfui"]);
    act(() => first.stop());
    const second = await startApp({ fetch: files.fetch, storage });
    expect(second.status!.source).toBe("cache");
  });

  test("a missing component file: the compiler's unknown-component error", async () => {
    await startApp({ fetch: server({ "Main.pfui": "<App><Nope/></App>" }).fetch });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Main.pfui:1:7: error E001: Unknown component 'Nope'");
  });

  test("errors in a component file and in code-behind name their file", async () => {
    await startApp({
      fetch: server({ "Main.pfui": "<App><Bad/></App>", "components/Bad.pfui": '<Component name="Bad"><Text>{missing}</Text></Component>' }).fetch,
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("components/Bad.pfui:1:30: error C001: Cannot find name 'missing'");
    act(() => apps.pop()!.stop());

    await startApp({ fetch: server({ "Main.pfui": "<App/>", "Main.pfui.xs": "let x = 1;" }).fetch });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Main.pfui.xs:1:1: error E019:");
  });

  test("watching: a change in a component file or its code-behind reloads; so does creating a missing one", async () => {
    const files = server({ "Main.pfui": "<App><Counter/><Later/></App>", "components/Counter.pfui": COUNTER, "components/Counter.pfui.xs": COUNTER_XS });
    const app = await startApp({ fetch: files.fetch });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unknown component 'Later'");
    files.files["components/Later.pfui"] = '<Component name="Later"><Text>later</Text></Component>';
    expect(await act(() => app.refresh())).toBe(true);
    expect(container.textContent).toBe("count: 0later");
    expect(await act(() => app.refresh())).toBe(false);
    files.files["components/Counter.pfui.xs"] = COUNTER_XS.replace("'count'", "'clicks'");
    expect(await act(() => app.refresh())).toBe(true);
    expect(container.textContent).toBe("clicks: 0later");
  });
});

describe("globals (step 21B)", () => {
  const FILES = {
    "app/Main.pfui": '<App global.count="{1}"><Text>main {count} {label()}</Text><Bump/></App>',
    "app/Globals.xs": "function label() { return 'n=' + count; }",
    "app/components/Bump.pfui": '<Component name="Bump"><Button label="{label()}" onClick="count++"/></Component>',
  };

  test("a component file reads and writes the entry's globals; Globals.xs is fetched beside the entry", async () => {
    const files = server({ ...FILES });
    await startApp({ fetch: files.fetch, main: "app/Main.pfui" });
    expect(container.textContent).toBe("main 1 n=1n=1");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("main 2 n=2n=2");
    expect(files.requests.map((r) => r.url)).toContain("app/Globals.xs");
  });

  test("a cached component file compiled against other globals is not reused", async () => {
    const storage = new MemoryStorage();
    const files = server({ ...FILES });
    const first = await startApp({ fetch: files.fetch, main: "app/Main.pfui", storage });
    act(() => first.stop());
    // The global disappears: the component must compile again, and fail.
    files.files["app/Main.pfui"] = "<App><Bump/></App>";
    files.files["app/Globals.xs"] = "function label() { return 'x'; }";
    await startApp({ fetch: files.fetch, main: "app/Main.pfui", storage });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("app/components/Bump.pfui:1:59: error C001: Cannot find name 'count'");
  });

  test("Globals.xs errors name the file; watching picks up its changes", async () => {
    const files = server({ ...FILES, "app/Globals.xs": `${FILES["app/Globals.xs"]}\nlet x = 1;` });
    const app = await startApp({ fetch: files.fetch, main: "app/Main.pfui" });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("app/Globals.xs:2:1: error E019:");
    files.files["app/Globals.xs"] = FILES["app/Globals.xs"];
    expect(await act(() => app.refresh())).toBe(true);
    expect(container.textContent).toBe("main 1 n=1n=1");
  });
});

describe("contracts (step 15)", () => {
  test("a contract violation is an error by default; with strictContracts: false a console warning, and the app runs", async () => {
    const markup = '<App><Text valu="x">ok</Text></App>';
    await startApp({ fetch: server({ "Main.pfui": markup }).fetch });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Main.pfui:1:12: error E020: 'Text' has no prop 'valu'. Did you mean 'value'?");
    act(() => apps.pop()!.stop());

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await startApp({ fetch: server({ "Main.pfui": markup }).fetch, strictContracts: false });
    expect(container.textContent).toBe("ok");
    expect(warn).toHaveBeenCalledWith("pfui: Main.pfui:1:12: warning E020: 'Text' has no prop 'valu'. Did you mean 'value'?");
    warn.mockRestore();
  });
});
