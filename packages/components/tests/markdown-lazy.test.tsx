// Step 23: Markdown's renderer is a lazy chunk. This file starts without it
// (Vitest isolates test files), so the tests run in order: the server render
// first finds it missing, the client render after it.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { renderStatic, resetServerState, takeServerLoads } from "@gluefuil/runtime/server";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(cleanup);

const Main = (() => {
  const { code, diagnostics } = compileModule("<App><Markdown># Title</Markdown></App>", { format: "function" });
  expect(diagnostics).toEqual([]);
  return loadModule(code, { components });
})();

test("a server render without the renderer records the load; the next render has the content (the prerender's loop)", async () => {
  resetServerState();
  const first = renderStatic(Main);
  expect(first.html).not.toContain("<h1");
  // React marks the boundary it couldn't render on the server.
  expect(first.html).toContain('<div class="gfui-Markdown"><!--$!-->');
  const loads = takeServerLoads();
  expect(loads).toHaveLength(1);
  await Promise.all(loads);
  resetServerState();
  const second = renderStatic(Main);
  expect(second.html).toContain('<h1 id="title" class="gfui-Heading" data-level="1">Title</h1>');
  expect(takeServerLoads()).toEqual([]);
});

test("the renderer is a dynamic import: one load for every Markdown, cached", async () => {
  const a = components.preloadMarkdown();
  expect(components.preloadMarkdown()).toBe(a);
  await a;
});

test("a client render after the load renders at once", async () => {
  let container!: HTMLElement;
  await act(async () => {
    container = render(<Main />).container;
  });
  expect(container.querySelector(".gfui-Markdown h1")?.textContent).toBe("Title");
});
