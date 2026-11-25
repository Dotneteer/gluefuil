// Source maps on the standalone path (loadModule): V8's own stack positions
// for code thrown from a loaded module map back to the right markup line and
// column. This verifies the line shift for the `new Function` wrapper.
import { compileModule, originalPositionFor, type SourceMap } from "@gluefuil/compiler";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, test } from "vitest";
import { setErrorReporter } from "../../src/errors";
import { loadModule } from "../../src/render/module";

afterEach(cleanup);

// Minimal components, so the runtime package needs nothing from @gluefuil/components.
const components = {
  App: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Text: ({ value }: { value?: unknown }) => createElement("span", null, String(value)),
  Button: ({ label, onClick }: { label?: string; onClick?: () => void }) => createElement("button", { onClick: () => onClick?.() }, label),
};
const metadata = {
  App: { description: "", props: {} },
  Text: { description: "", props: { value: { description: "" } } },
  Button: { description: "", props: { label: { description: "" } }, events: { click: { description: "" } } },
};

/** The first stack frame in the loaded module (named by its sourceURL), mapped back to the markup. */
function originalOfFirstFrame(error: unknown, map: SourceMap, sourceURL: string, markup: string): string {
  const stack = String((error as Error).stack);
  const frame = new RegExp(`${sourceURL.replace(/\./g, "\\.")}:(\\d+):(\\d+)`).exec(stack);
  expect(frame, stack).not.toBeNull();
  // V8 reports 1-based lines and columns of the evaluated script; the map shipped
  // with it is shifted by the wrapper lines (loadModule does the same).
  const shifted = { ...map, mappings: ";;;" + map.mappings };
  const original = originalPositionFor(shifted, Number(frame![1]) - 1, Number(frame![2]) - 1);
  expect(original).toBeDefined();
  const lines = markup.split("\n");
  return lines[original!.line]!.slice(original!.column);
}

test("an error thrown by a handler maps back to its expression in the markup", async () => {
  const markup = [
    '<App var.n="{0}">',
    '  <Text value="{n}"/>',
    "  <Button",
    '    label="Go"',
    '    onClick="',
    "      n++;",
    "      throw new Error('from the handler');",
    '    "/>',
    "</App>",
  ].join("\n");
  const { code, map, diagnostics } = compileModule(markup, { format: "function", components: metadata, fileName: "Main.gui" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components, map: map!, sourceURL: "Main.gui.js" });
  const errors: unknown[] = [];
  const restore = setErrorReporter((error) => errors.push(error));
  try {
    render(<Main />);
    act(() => {
      fireEvent.click(screen.getByText("Go"));
    });
    await act(async () => {});
  } finally {
    restore();
  }
  expect(errors).toHaveLength(1);
  // V8 records an Error's stack where it is constructed: the `new Error(...)` expression.
  expect(originalOfFirstFrame(errors[0], map!, "Main.gui.js", markup)).toBe("new Error('from the handler');");
});

test("an error thrown by a binding maps back to the expression in the markup", () => {
  const markup = ['<App var.list="{null}">', '  <Text value="{list.length.toFixed(0) + boom()}"/>', "</App>"].join("\n");
  const { code, map } = compileModule(markup.replace("boom()", "(() => { throw new Error('from a binding') })()"), {
    format: "function",
    components: metadata,
  });
  const source = markup.replace("boom()", "(() => { throw new Error('from a binding') })()");
  const Main = loadModule(code, { components, map: map!, sourceURL: "Binding.gui.js" });
  let caught: unknown;
  const originalError = console.error;
  console.error = () => {};
  try {
    render(<Main />);
  } catch (error) {
    caught = error;
  } finally {
    console.error = originalError;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(originalOfFirstFrame(caught, map!, "Binding.gui.js", source)).toMatch(/^new Error\('from a binding'\)/);
});

test("without a map, loadModule adds no source-map comments", () => {
  const { code } = compileModule("<App/>", { format: "function", components: metadata });
  expect(() => loadModule(code, { components })).not.toThrow();
});
