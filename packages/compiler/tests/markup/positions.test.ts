// Every node must carry exact source positions: they feed diagnostics and,
// later, source maps.
import { describe, expect, test } from "vitest";
import type { ElementNode } from "../../src/markup/ast";
import { parseMarkup } from "../../src/markup/parser";
import { sliceOf } from "./helpers";

function firstElement(markup: string): ElementNode {
  const node = parseMarkup(markup).document.children.find((n) => n.kind === "element");
  if (node?.kind !== "element") throw new Error("no element");
  return node;
}

describe("element spans", () => {
  const markup = `<App title="x">\n  <Text>Hi</Text>\n</App>`;
  const app = firstElement(markup);

  test("element covers the whole element", () => {
    expect(sliceOf(markup, app)).toBe(markup);
  });

  test("open tag, name and close tag", () => {
    expect(sliceOf(markup, app.openTag)).toBe(`<App title="x">`);
    expect(sliceOf(markup, app.name)).toBe("App");
    expect(sliceOf(markup, app.closeTag!)).toBe("</App>");
  });

  test("nested element and its text", () => {
    const text = app.children.find((n) => n.kind === "element") as ElementNode;
    expect(sliceOf(markup, text)).toBe("<Text>Hi</Text>");
    expect(sliceOf(markup, text.children[0]!)).toBe("Hi");
  });

  test("self-closing element: open tag equals the element", () => {
    const markup = `<A x="1" />`;
    const a = firstElement(markup);
    expect(sliceOf(markup, a)).toBe(markup);
    expect(a.openTag).toEqual({ start: a.start, end: a.end });
  });

  test("namespaced name span includes the prefix", () => {
    const markup = `<Ext:Gauge/>`;
    expect(sliceOf(markup, firstElement(markup).name)).toBe("Ext:Gauge");
  });
});

describe("attribute spans", () => {
  const markup = `<A first="1" second='{a + b}' flag third = \`x\`/>`;
  const [first, second, flag, third] = firstElement(markup).attributes;

  test("attribute covers name to closing quote", () => {
    expect(sliceOf(markup, first!)).toBe(`first="1"`);
    expect(sliceOf(markup, third!)).toBe("third = `x`");
  });

  test("value span includes quotes; inner span excludes them", () => {
    expect(sliceOf(markup, second!.value!)).toBe(`'{a + b}'`);
    expect(sliceOf(markup, second!.value!.inner)).toBe("{a + b}");
  });

  test("inner span starts at the first character after the quote (expression positions start here)", () => {
    const inner = second!.value!.inner;
    expect(markup[inner.start]).toBe("{");
    expect(markup[inner.start - 1]).toBe("'");
  });

  test("valueless attribute spans only its name", () => {
    expect(sliceOf(markup, flag!)).toBe("flag");
    expect(flag!.value).toBeUndefined();
  });
});

describe("raw section spans", () => {
  test("comment and CDATA cover their delimiters", () => {
    const markup = `<A><!-- c --><![CDATA[d]]></A>`;
    const [comment, cdata] = firstElement(markup).children;
    expect(sliceOf(markup, comment!)).toBe("<!-- c -->");
    expect(sliceOf(markup, cdata!)).toBe("<![CDATA[d]]>");
  });

  test("script node and its content span", () => {
    const markup = `<A><script>let x = 1;</script></A>`;
    const script = firstElement(markup).children[0];
    if (script?.kind !== "script") throw new Error("expected script");
    expect(sliceOf(markup, script)).toBe("<script>let x = 1;</script>");
    expect(sliceOf(markup, script.contentSpan)).toBe("let x = 1;");
  });
});

test("positions are UTF-16 offsets, also after astral characters", () => {
  const markup = `<T>😀</T><B x="1"/>`;
  const { document } = parseMarkup(markup);
  const b = document.children[1] as ElementNode;
  expect(sliceOf(markup, b)).toBe(`<B x="1"/>`);
  // "<T>" (3 units) + "😀" (2 units: a surrogate pair) + "</T>" (4 units) = 9
  expect(b.start).toBe(9);
});
