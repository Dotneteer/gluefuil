// Step 16 in jsdom: Text variants and Heading levels.
import { compileModule } from "@patchfuil/compiler";
import { loadModule } from "@patchfuil/runtime";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { headingLevel } from "../src/text";

afterEach(cleanup);

function inner(markup: string): string {
  const { code, diagnostics } = compileModule(`<App>${markup}</App>`, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />).container.querySelector(".pfui-AppContent")!.innerHTML.replace(/<style[^>]*>.*?<\/style>/gs, "");
}

describe("Text", () => {
  test.each<[markup: string, html: string]>([
    ["<Text>plain</Text>", '<span class="pfui-Text">plain</span>'],
    ['<Text variant="strong">bold</Text>', '<strong class="pfui-Text" data-variant="strong">bold</strong>'],
    ['<Text variant="code" value="x = 1"/>', '<code class="pfui-Text" data-variant="code">x = 1</code>'],
    ['<Text variant="keyboard">Ctrl</Text>', '<kbd class="pfui-Text" data-variant="keyboard">Ctrl</kbd>'],
    ['<Text variant="deleted">old</Text>', '<del class="pfui-Text" data-variant="deleted">old</del>'],
    ['<Text variant="paragraph">para</Text>', '<p class="pfui-Text" data-variant="paragraph">para</p>'],
    ['<Text variant="secondary">dim</Text>', '<span class="pfui-Text" data-variant="secondary">dim</span>'],
    ['<Text variant="{\'nope\'}">bound, unknown: plain</Text>', '<span class="pfui-Text">bound, unknown: plain</span>'],
  ])("%s", (markup, html) => {
    expect(inner(markup)).toBe(html);
  });

  test("maxLines clamps (jsdom serializes the clamp itself oddly: check the properties)", () => {
    const html = inner('<Text maxLines="2">long</Text>');
    expect(html).toContain("display: -webkit-box");
    expect(html).toContain("-webkit-box-orient: vertical");
    expect(html).toContain("overflow: hidden");
    expect(inner('<Text maxLines="0">x</Text>')).toBe('<span class="pfui-Text">x</span>');
  });

  test("an unknown literal variant is a contract error; Text owns variant, so the variant behavior does not attach", () => {
    const result = compileModule('<App><Text variant="shiny">x</Text></App>');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["E023"]);
    expect(compileModule('<App><Text variant="strong">x</Text></App>').code).not.toContain("VariantBehavior");
  });
});

describe("Heading", () => {
  test.each([
    ["h3", 3],
    ["H3", 3],
    ["3", 3],
    [undefined, 1],
    ["h9", 1],
  ])("headingLevel(%j) = %i", (level, n) => {
    expect(headingLevel(level)).toBe(n);
  });

  test.each<[markup: string, html: string]>([
    ['<Heading value="Title"/>', '<h1 class="pfui-Heading" data-level="1">Title</h1>'],
    ['<Heading level="h2">Sub</Heading>', '<h2 class="pfui-Heading" data-level="2">Sub</h2>'],
    ['<Heading level="H4" value="Four"/>', '<h4 class="pfui-Heading" data-level="4">Four</h4>'],
    ["<H3>Three</H3>", '<h3 class="pfui-Heading" data-level="3">Three</h3>'],
    ['<H6 value="Six"/>', '<h6 class="pfui-Heading" data-level="6">Six</h6>'],
  ])("%s", (markup, html) => {
    expect(inner(markup)).toBe(html);
  });

  test("an invalid level is a contract error", () => {
    expect(compileModule('<App><Heading level="h7"/></App>').diagnostics.map((d) => d.code)).toEqual(["E023"]);
  });
});
