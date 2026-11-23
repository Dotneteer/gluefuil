// Step 5 end to end in jsdom: markup -> compileModule -> loadModule -> React DOM.
import { compileModule } from "@patchfuil/compiler";
import { loadModule } from "@patchfuil/runtime";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(cleanup);

/** Compiles and renders markup; returns the rendered HTML. */
function renderMarkup(markup: string): string {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />).container.innerHTML;
}

test("the first app", () => {
  expect(
    renderMarkup(`
      <App>
        <Stack gap="8px">
          <Text value="{1 + 2}"/>
          <Text>Hello, {'pfui'.toUpperCase()}!</Text>
          <Button label="Click me"/>
        </Stack>
      </App>`),
  ).toBe(
    '<div class="pfui-App"><div class="pfui-Stack" style="display: flex; flex-direction: column; gap: 8px;">' +
      '<span class="pfui-Text">3</span>' +
      '<span class="pfui-Text">Hello, PFUI!</span>' +
      '<button type="button" class="pfui-Button">Click me</button>' +
      "</div></div>",
  );
});

test.each<[markup: string, html: string]>([
  // Constant and bound values
  ['<Text value="plain"/>', '<span class="pfui-Text">plain</span>'],
  ['<Text value="{[1, 2, 3].map(x => x * 2).join(\'-\')}"/>', '<span class="pfui-Text">2-4-6</span>'],
  ['<Text value="{Math.max(3, 7)} of {10}"/>', '<span class="pfui-Text">7 of 10</span>'],
  // A lone expression keeps its type until the component renders it.
  ['<Text value="{1 / 4}"/>', '<span class="pfui-Text">0.25</span>'],
  // Nested text instead of value; null renders nothing.
  ["<Text>A {null} B</Text>", '<span class="pfui-Text">A  B</span>'],
  ["<Text>{null}</Text>", '<span class="pfui-Text"></span>'],
  ["<Text>{`x ${'y'}`}</Text>", '<span class="pfui-Text">x y</span>'],
  // Optional chaining by default (step 3), visible in a real render
  ["<Text>[{({}).a.b.c}]</Text>", '<span class="pfui-Text">[]</span>'],
  // Entities and CDATA
  ["<Text>a &lt; b</Text>", '<span class="pfui-Text">a &lt; b</span>'],
  ["<Text><![CDATA[<b>{raw}</b>]]></Text>", '<span class="pfui-Text">&lt;b&gt;{raw}&lt;/b&gt;</span>'],
  // Children and layout
  ["<Button>Nested <Text value='label'/></Button>", '<button type="button" class="pfui-Button">Nested <span class="pfui-Text">label</span></button>'],
  [
    '<Stack orientation="{\'horizontal\'}"><Text>1</Text><Text>2</Text></Stack>',
    '<div class="pfui-Stack" style="display: flex; flex-direction: row;"><span class="pfui-Text">1</span><span class="pfui-Text">2</span></div>',
  ],
])("%s", (inner, html) => {
  expect(renderMarkup(`<App>${inner}</App>`)).toBe(`<div class="pfui-App">${html}</div>`);
});

test("the compiled module is the same component on every load (no hidden state)", () => {
  const { code } = compileModule('<App><Text value="{2 * 21}"/></App>', { format: "function" });
  const A = loadModule(code, { components });
  const B = loadModule(code, { components });
  expect(render(<A />).container.textContent).toBe("42");
  cleanup();
  expect(render(<B />).container.textContent).toBe("42");
});
