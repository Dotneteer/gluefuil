// The router (step 19): matching, locations, navigate, the server view.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { inServerView } from "../../src/reactivity/server-view";
import { computed, watch } from "../../src/reactivity/signals";
import {
  currentLocation,
  currentRouteParams,
  findRoute,
  hrefFor,
  matchRoute,
  navigate,
  parseLocation,
  registerRoutes,
  resetRouter,
  setRoutingMode,
} from "../../src/render/router";

beforeEach(() => {
  resetRouter();
  window.history.replaceState(null, "", "/");
});
afterEach(() => resetRouter());

describe("matchRoute (React Router v6 style patterns)", () => {
  test.each<[pattern: string, path: string, params: Record<string, string> | undefined]>([
    ["/", "/", {}],
    ["/", "/x", undefined],
    ["/about", "/about", {}],
    ["/about", "/about/", {}],
    ["/about", "/About", undefined],
    ["/users/:id", "/users/42", { id: "42" }],
    ["/users/:id", "/users", undefined],
    ["/users/:id", "/users/42/edit", undefined],
    ["/users/:id?", "/users", {}],
    ["/users/:id?", "/users/7", { id: "7" }],
    ["/posts/:post/comments/:comment", "/posts/a/comments/b", { post: "a", comment: "b" }],
    ["/tests/:name", "/tests/a%20b", { name: "a b" }],
    ["/files/*", "/files/a/b.txt", { "*": "a/b.txt" }],
    ["/files/*", "/files", { "*": "" }],
    ["*", "/anything/at/all", { "*": "anything/at/all" }],
  ])("%s against %s", (pattern, path, params) => {
    expect(matchRoute(pattern, path)).toEqual(params);
  });

  test("findRoute: the first matching pattern wins", () => {
    expect(findRoute("/a/b", ["/a/:x", "/a/b", "*"])).toEqual({ pattern: "/a/:x", params: { x: "b" } });
    expect(findRoute("/zzz", ["/a"])).toBeUndefined();
  });
});

test.each<[path: string, pathname: string, query: Record<string, string>]>([
  ["", "/", {}],
  ["/", "/", {}],
  ["tests", "/tests", {}],
  ["/tests/x/", "/tests/x", {}],
  ["/search?q=a%20b&page=2", "/search", { q: "a b", page: "2" }],
])("parseLocation(%j)", (path, pathname, query) => {
  expect(parseLocation(path)).toEqual({ pathname, query });
});

describe("hash mode (the default)", () => {
  test("the location is read from the hash, and follows the browser (popstate)", () => {
    window.history.replaceState(null, "", "/#/start?x=1");
    setRoutingMode("hash");
    expect(currentLocation()).toEqual({ pathname: "/start", query: { x: "1" } });
    window.location.hash = "#/next";
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(currentLocation().pathname).toBe("/next");
  });

  test("navigate writes the hash, keeps the page path, and updates the (reactive) location", () => {
    setRoutingMode("hash");
    const seen: string[] = [];
    const path = computed(() => currentLocation().pathname);
    const stop = watch(path, () => seen.push(path.peek()));
    navigate("/tests/theming");
    expect(window.location.hash).toBe("#/tests/theming");
    expect(window.location.pathname).toBe("/");
    expect(seen).toEqual(["/tests/theming"]);
    stop();
    expect(hrefFor("/a?b=1")).toBe("#/a?b=1");
  });

  test("navigate with replace: no new history entry", () => {
    setRoutingMode("hash");
    const before = window.history.length;
    navigate("/a");
    navigate("/b", { replace: true });
    expect(window.history.length).toBe(before + 1);
    expect(currentLocation().pathname).toBe("/b");
  });
});

describe("browser mode", () => {
  test("the location is the path; navigate pushes it; popstate follows the history", () => {
    window.history.replaceState(null, "", "/first?q=1");
    setRoutingMode("browser");
    expect(currentLocation()).toEqual({ pathname: "/first", query: { q: "1" } });
    navigate("/second");
    expect(window.location.pathname).toBe("/second");
    expect(hrefFor("/x")).toBe("/x");
    window.history.replaceState(null, "", "/third");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(currentLocation().pathname).toBe("/third");
  });
});

test("$routeParams: the first registered route's parameters", () => {
  setRoutingMode("hash");
  registerRoutes(["/", "/tests/:name"]);
  navigate("/tests/theming");
  expect(currentRouteParams()).toEqual({ name: "theming" });
  navigate("/nowhere");
  expect(currentRouteParams()).toEqual({});
});

test("the server view sees the prerender path, whatever the browser shows", () => {
  setRoutingMode("hash");
  navigate("/deep/link");
  registerRoutes(["/", "/deep/:x"]);
  expect(currentLocation().pathname).toBe("/deep/link");
  expect(inServerView(() => currentLocation().pathname)).toBe("/");
  expect(inServerView(currentRouteParams)).toEqual({});
});
