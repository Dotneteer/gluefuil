// The standalone loader against a mocked server: compile, cache, errors, watching.
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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
