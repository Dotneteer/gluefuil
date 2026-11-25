// Step 5 end to end in jsdom: markup -> compileModule -> loadModule -> React DOM.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(cleanup);

/**
 * Compiles and renders markup; returns the rendered HTML of the App's content
 * (the App element's attributes carry the theme variables, step 17; the shell
 * around the content is tested in shell.test.tsx).
 */
function renderMarkup(markup: string): string {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  const app = render(<Main />).container.querySelector(".gfui-AppContent")!;
  return `<div class="gfui-App">${app.innerHTML}</div>`;
}

test("the first app", () => {
  const html = renderMarkup(`
      <App>
        <Stack gap="8px">
          <Text value="{1 + 2}"/>
          <Text>Hello, {'gfui'.toUpperCase()}!</Text>
          <Button label="Click me"/>
        </Stack>
      </App>`);
  expect(html).toMatch(
    /^<div class="gfui-App"><div class="gfui-Stack" data-orientation="vertical" data-level="0" style="flex-direction: column; --gfui-gap: 8px;"><span class="gfui-Text">3<\/span><span class="gfui-Text">Hello, GFUI!<\/span><button /,
  );
  // The Button is Mantine's (step 16), with the gfui class and the label.
  const button = screen.getByRole("button", { name: "Click me" });
  expect(button.classList).toContain("gfui-Button");
  expect(button.classList).toContain("mantine-Button-root");
});

test("a Button's nested content (Mantine renders it inside its label part)", () => {
  renderMarkup("<App><Button>Nested <Text value='label'/></Button></App>");
  const button = screen.getByRole("button", { name: "Nested label" });
  expect(button.querySelector(".mantine-Button-label .gfui-Text")!.textContent).toBe("label");
});

test.each<[markup: string, html: string]>([
  // Constant and bound values
  ['<Text value="plain"/>', '<span class="gfui-Text">plain</span>'],
  ['<Text value="{[1, 2, 3].map(x => x * 2).join(\'-\')}"/>', '<span class="gfui-Text">2-4-6</span>'],
  ['<Text value="{Math.max(3, 7)} of {10}"/>', '<span class="gfui-Text">7 of 10</span>'],
  // A lone expression keeps its type until the component renders it.
  ['<Text value="{1 / 4}"/>', '<span class="gfui-Text">0.25</span>'],
  // Nested text instead of value; null renders nothing.
  ["<Text>A {null} B</Text>", '<span class="gfui-Text">A  B</span>'],
  ["<Text>{null}</Text>", '<span class="gfui-Text"></span>'],
  ["<Text>{`x ${'y'}`}</Text>", '<span class="gfui-Text">x y</span>'],
  // Optional chaining by default (step 3), visible in a real render
  ["<Text>[{({}).a.b.c}]</Text>", '<span class="gfui-Text">[]</span>'],
  // Entities and CDATA
  ["<Text>a &lt; b</Text>", '<span class="gfui-Text">a &lt; b</span>'],
  ["<Text><![CDATA[<b>{raw}</b>]]></Text>", '<span class="gfui-Text">&lt;b&gt;{raw}&lt;/b&gt;</span>'],
  // Layout
  [
    '<Stack orientation="{\'horizontal\'}"><Text>1</Text><Text>2</Text></Stack>',
    '<div class="gfui-Stack" data-orientation="horizontal" data-level="0" style="flex-direction: row;"><span class="gfui-Text">1</span><span class="gfui-Text">2</span></div>',
  ],
])("%s", (inner, html) => {
  expect(renderMarkup(`<App>${inner}</App>`)).toBe(`<div class="gfui-App">${html}</div>`);
});

test("the compiled module is the same component on every load (no hidden state)", () => {
  const { code } = compileModule('<App><Text value="{2 * 21}"/></App>', { format: "function" });
  const A = loadModule(code, { components });
  const B = loadModule(code, { components });
  expect(render(<A />).container.textContent).toBe("42");
  cleanup();
  expect(render(<B />).container.textContent).toBe("42");
});
