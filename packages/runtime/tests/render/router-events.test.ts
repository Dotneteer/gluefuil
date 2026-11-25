// Navigation events (step 21): willNavigate (the guard) and didNavigate, for
// every kind of navigation; held browser moves and their restore; latest wins.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setErrorReporter } from "../../src/errors";
import { HandlerTimeoutError } from "../../src/render/handlers";
import { inServerView } from "../../src/reactivity/server-view";
import {
  currentLocation,
  getBasename,
  hrefFor,
  navigate,
  normalizeBasename,
  redirect,
  resetRouter,
  setBasename,
  setNavigationHandlers,
  setRoutingMode,
  setServerPath,
  type NavigationHandlers,
} from "../../src/render/router";

let errors: unknown[];
let restoreReporter: () => void;

beforeEach(() => {
  resetRouter();
  window.history.replaceState(null, "", "/");
  errors = [];
  restoreReporter = setErrorReporter((error) => errors.push(error));
});
afterEach(() => {
  resetRouter();
  restoreReporter();
});

/** Records the events; `decide` answers the guard. */
function record(decide: (to: string) => unknown = () => undefined) {
  const events: string[] = [];
  const handlers: NavigationHandlers = {
    willNavigate: (to, query) => {
      events.push(`will ${to} ${JSON.stringify(query)}`);
      return Promise.resolve(decide(to));
    },
    didNavigate: (to, query) => {
      events.push(`did ${to} ${JSON.stringify(query)}`);
      return Promise.resolve();
    },
  };
  setNavigationHandlers(handlers);
  return events;
}

const path = () => currentLocation().pathname;
/** Lets promise callbacks and history traversals (a task in jsdom) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("navigate()", () => {
  test("without handlers it moves synchronously and returns a resolved promise", async () => {
    setRoutingMode("hash");
    const result = navigate("/a");
    expect(path()).toBe("/a");
    await expect(result).resolves.toBeUndefined();
  });

  test.each<[guard: unknown, moves: boolean]>([
    [undefined, true],
    [null, true],
    [true, true],
    ["no", true],
    [0, true],
    [false, false],
  ])("the guard resolving to %j: moves %s", async (answer, moves) => {
    setRoutingMode("hash");
    const events = record(() => answer);
    await navigate("/a");
    expect(path()).toBe(moves ? "/a" : "/");
    expect(events).toEqual(moves ? ["will /a {}", "did /a {}"] : ["will /a {}"]);
  });

  test("the guard runs before the move: the location is unchanged while it decides", async () => {
    setRoutingMode("hash");
    let release!: (value: unknown) => void;
    setNavigationHandlers({ willNavigate: () => new Promise((resolve) => (release = resolve)) });
    const done = navigate("/a");
    await settle();
    expect(path()).toBe("/");
    expect(window.location.hash).toBe("");
    release(undefined);
    await done;
    expect(path()).toBe("/a");
  });

  test("a guard that throws cancels the navigation; the error is reported", async () => {
    setRoutingMode("hash");
    setNavigationHandlers({ willNavigate: () => Promise.reject(new Error("guard failed")) });
    await navigate("/a");
    expect(path()).toBe("/");
    expect(errors).toEqual([new Error("guard failed")]);
  });

  test("a guard that times out (HandlerTimeoutError) cancels the navigation", async () => {
    setRoutingMode("hash");
    setNavigationHandlers({ willNavigate: () => Promise.reject(new HandlerTimeoutError(10)) });
    await navigate("/a");
    expect(path()).toBe("/");
    expect(errors[0]).toBeInstanceOf(HandlerTimeoutError);
  });

  test("queryParams are added to a path without a query; the events get the full path and the query", async () => {
    setRoutingMode("hash");
    const events = record();
    await navigate("/search", { queryParams: { q: "a b", page: 2, skip: null, none: undefined } });
    expect(window.location.hash).toBe("#/search?q=a+b&page=2");
    expect(currentLocation().query).toEqual({ q: "a b", page: "2" });
    expect(events).toEqual(['will /search?q=a+b&page=2 {"q":"a b","page":"2"}', 'did /search?q=a+b&page=2 {"q":"a b","page":"2"}']);
    // A path with a query keeps it; queryParams are ignored (as XMLUI).
    await navigate("/x?y=1", { queryParams: { z: 2 } });
    expect(currentLocation().query).toEqual({ y: "1" });
  });

  test("replace: the guard runs, and no history entry is added", async () => {
    setRoutingMode("hash");
    const events = record();
    const length = window.history.length;
    await navigate("/a", { replace: true });
    expect(window.history.length).toBe(length);
    expect(events).toEqual(["will /a {}", "did /a {}"]);
  });

  test("the latest navigation wins: an older guard's late answer is ignored", async () => {
    setRoutingMode("hash");
    const releases: Record<string, () => void> = {};
    setNavigationHandlers({ willNavigate: (to) => new Promise((resolve) => (releases[to] = () => resolve(undefined))) });
    const first = navigate("/first");
    const second = navigate("/second");
    releases["/second"]!();
    await second;
    expect(path()).toBe("/second");
    releases["/first"]!();
    await first;
    expect(path()).toBe("/second");
  });

  test("a guard that redirects (navigate inside it, then false) ends on the redirect", async () => {
    setRoutingMode("hash");
    const events = record((to) => {
      if (to === "/admin") {
        void navigate("/login");
        return false;
      }
      return undefined;
    });
    await navigate("/admin");
    await settle();
    expect(path()).toBe("/login");
    expect(events).toEqual(["will /admin {}", "will /login {}", "did /login {}"]);
  });

  test("handlers are removed by the function setNavigationHandlers returns (only its own)", async () => {
    setRoutingMode("hash");
    const events: string[] = [];
    const remove = setNavigationHandlers({ didNavigate: (to) => events.push(to) });
    const second = setNavigationHandlers({ didNavigate: (to) => events.push(`2 ${to}`) });
    remove(); // not the current registration: no effect
    await navigate("/a");
    second();
    await navigate("/b");
    expect(events).toEqual(["2 /a"]);
  });

  test("a didNavigate that fails is reported; the navigation stands", async () => {
    setRoutingMode("hash");
    setNavigationHandlers({ didNavigate: () => Promise.reject(new Error("log failed")) });
    await navigate("/a");
    await settle();
    expect(path()).toBe("/a");
    expect(errors).toEqual([new Error("log failed")]);
  });
});

describe("redirect() (the Pages fallback)", () => {
  test("replaces the entry and fires didNavigate, without the guard", () => {
    setRoutingMode("hash");
    const events = record(() => false);
    const length = window.history.length;
    redirect("/home");
    expect(path()).toBe("/home");
    expect(window.history.length).toBe(length);
    expect(events).toEqual(["did /home {}"]);
  });
});

describe("browser moves (back, forward, a typed hash)", () => {
  test("the first load fires nothing", () => {
    window.history.replaceState(null, "", "/#/deep");
    const events = record();
    setRoutingMode("hash");
    expect(path()).toBe("/deep");
    expect(events).toEqual([]);
  });

  test("an allowed back move: will, then the location, then did", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    const events = record();
    window.history.back();
    await settle();
    expect(path()).toBe("/");
    expect(events).toEqual(["will / {}", "did / {}"]);
  });

  test("a refused back move never shows the target and restores the URL with history.go", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    const length = window.history.length;
    const events = record(() => false);
    const seen: string[] = [];
    const go = vi.spyOn(window.history, "go");
    window.history.back();
    // Observe the location while the move is held and after the restore.
    for (let i = 0; i < 5; i++) {
      seen.push(path());
      await settle();
    }
    expect(seen.every((p) => p === "/a")).toBe(true);
    expect(go).toHaveBeenCalledWith(1);
    expect(window.location.hash).toBe("#/a");
    expect(window.history.length).toBe(length);
    expect(events).toEqual(["will / {}"]);
    // Allowed again: back works, and forward returns.
    setNavigationHandlers({});
    window.history.back();
    await settle();
    expect(path()).toBe("/");
    window.history.forward();
    await settle();
    expect(path()).toBe("/a");
    go.mockRestore();
  });

  test("a refused typed hash (an entry we did not push) goes one step back", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    record((to) => (to === "/typed" ? false : undefined));
    window.location.hash = "#/typed";
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    await settle();
    expect(path()).toBe("/a");
    expect(window.location.hash).toBe("#/a");
  });

  test("a hash typed while a refused back move is held: the app's entry is gone, so the current one is rewritten; back and forward still work", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    const length = window.history.length;
    let release!: (value: unknown) => void;
    setNavigationHandlers({ willNavigate: (to) => (to === "/" ? new Promise((resolve) => (release = resolve)) : Promise.resolve(false)) });
    window.history.back();
    await settle();
    // Held: the browser is on "/", the app still shows /a.
    expect(path()).toBe("/a");
    // Typed now: the browser drops the /a entry (a new entry after "/").
    window.location.hash = "#/typed";
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    release(false);
    await settle();
    await settle();
    expect(path()).toBe("/a");
    expect(window.location.hash).toBe("#/a");
    expect(window.history.length).toBe(length);
    setNavigationHandlers({});
    window.history.back();
    await settle();
    expect(path()).toBe("/");
    window.history.forward();
    await settle();
    expect(path()).toBe("/a");
  });

  test("an allowed typed hash gets the next index in history.state", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    record();
    window.location.hash = "#/typed";
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(path()).toBe("/typed");
    expect(window.history.state).toEqual({ gfui: 2 });
  });

  test("every entry we push or replace carries its index", async () => {
    setRoutingMode("browser");
    expect(window.history.state).toEqual({ gfui: 0 });
    await navigate("/a");
    expect(window.history.state).toEqual({ gfui: 1 });
    await navigate("/b", { replace: true });
    expect(window.history.state).toEqual({ gfui: 1 });
  });
});

describe("the server view", () => {
  test("renders the server path; setServerPath normalizes it", () => {
    setServerPath("/about/?x=1");
    window.history.replaceState(null, "", "/#/elsewhere");
    expect(inServerView(() => currentLocation())).toEqual({ pathname: "/about", query: { x: "1" } });
  });
});

describe("navigate(n): history moves (part 2)", () => {
  test("navigate(-1) goes back through the guard, which sees the path it lands on", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    await navigate("/b");
    const events = record();
    await navigate(-1);
    expect(path()).toBe("/a");
    expect(events).toEqual(["will /a {}", "did /a {}"]);
    await navigate(1);
    expect(path()).toBe("/b");
  });

  test("a refused navigate(-1) never shows the target and adds no entry", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    await navigate("/b");
    const length = window.history.length;
    const events = record(() => false);
    await navigate(-1);
    await settle();
    expect(path()).toBe("/b");
    expect(window.location.hash).toBe("#/b");
    expect(window.history.length).toBe(length);
    expect(events).toEqual(["will /a {}"]);
  });

  test("the promise waits for a held move's decision", async () => {
    setRoutingMode("hash");
    await navigate("/a");
    let release!: (value: unknown) => void;
    setNavigationHandlers({ willNavigate: () => new Promise((resolve) => (release = resolve)) });
    let done = false;
    const move = navigate(-1).then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    expect(path()).toBe("/a");
    release(undefined);
    await move;
    expect(path()).toBe("/");
  });

  test("with no entry that far, nothing moves and the promise still resolves", async () => {
    setRoutingMode("hash");
    const events = record();
    await navigate(-50);
    expect(path()).toBe("/");
    expect(events).toEqual([]);
  });

  test.each([0, Number.NaN])("navigate(%s) does nothing", async (delta) => {
    setRoutingMode("hash");
    const go = vi.spyOn(window.history, "go");
    if (Number.isNaN(delta)) await expect(navigate(delta)).rejects.toThrow(TypeError);
    else await navigate(delta);
    expect(go).not.toHaveBeenCalled();
    go.mockRestore();
  });

  test("a fractional delta is an error", async () => {
    await expect(navigate(-1.5)).rejects.toThrow("a history move must be a whole number");
  });
});

describe('navigate(to, { target: "_blank" }) (part 2)', () => {
  test.each<[mode: "hash" | "browser", basename: string, url: string]>([
    ["hash", "", "/#/docs?q=a+b"],
    ["browser", "", "/docs?q=a+b"],
    ["browser", "/app", "/app/docs?q=a+b"],
  ])("%s mode, basename %j: opens %s after the guard; the page does not move", async (mode, base, url) => {
    setRoutingMode(mode);
    setBasename(base);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const events = record();
    await navigate("/docs", { target: "_blank", queryParams: { q: "a b" } });
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
    expect(path()).toBe("/");
    expect(events).toEqual(['will /docs?q=a+b {"q":"a b"}']);
    open.mockRestore();
  });

  test("a refusing guard opens nothing", async () => {
    setRoutingMode("hash");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    record(() => false);
    await navigate("/docs", { target: "_blank" });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  test("another target navigates in this tab", async () => {
    setRoutingMode("hash");
    await navigate("/docs", { target: "_self" });
    expect(path()).toBe("/docs");
  });
});

describe("the basename (part 2)", () => {
  test.each([
    ["/app/", "/app"],
    ["app", "/app"],
    ["/a/b//", "/a/b"],
    ["/", ""],
    ["", ""],
  ])("normalizeBasename(%j) is %j", (input, expected) => {
    expect(normalizeBasename(input)).toBe(expected);
  });

  test("browser mode reads routes below it and puts it in front of every URL", async () => {
    window.history.replaceState(null, "", "/app/docs?x=1");
    setBasename("/app/");
    setRoutingMode("browser");
    expect(getBasename()).toBe("/app");
    expect(currentLocation()).toEqual({ pathname: "/docs", query: { x: "1" } });
    expect(hrefFor("/about")).toBe("/app/about");
    expect(hrefFor("/")).toBe("/app/");
    await navigate("/about");
    expect(window.location.pathname).toBe("/app/about");
    await navigate("/");
    expect(window.location.pathname).toBe("/app/");
    expect(path()).toBe("/");
    window.history.back();
    await settle();
    expect(path()).toBe("/about");
  });

  test("the base itself is the root route; a path outside it is read as is", () => {
    window.history.replaceState(null, "", "/app");
    setBasename("/app");
    setRoutingMode("browser");
    expect(path()).toBe("/");
    window.history.replaceState(null, "", "/application/x");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(path()).toBe("/application/x");
  });

  test("hash mode ignores it", async () => {
    setBasename("/app");
    setRoutingMode("hash");
    expect(hrefFor("/about")).toBe("#/about");
    await navigate("/about");
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("#/about");
  });

  test("resetRouter clears it", () => {
    setBasename("/app");
    resetRouter();
    expect(getBasename()).toBe("");
  });
});
