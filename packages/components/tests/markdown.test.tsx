// Step 23: Markdown in jsdom. The renderer chunk is preloaded here, so renders
// are synchronous; the lazy paths (suspending, the prerender's second render)
// are in markdown-lazy.test.tsx, which starts without it.
import { compileModule } from "@gluefuil/compiler";
import { defineBackend } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import { loadModule, resetDataState, resetRouter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { bindingText, decodeHtmlEntities, isSafeUrl, removeIndents, tokenizeHtml } from "../src/index";

beforeAll(async () => {
  await components.preloadMarkdown();
});
afterEach(() => {
  cleanup();
  resetRouter();
});

function mount(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />).container;
}

/** The rendered Markdown's inner HTML (the text in CDATA, so it is kept as written). */
function html(markdown: string, attributes = ""): string {
  const container = mount(`<App><Markdown ${attributes}><![CDATA[${markdown}]]></Markdown></App>`);
  return container.querySelector(".gfui-Markdown")!.innerHTML;
}

describe("Markdown → HTML (GFM)", () => {
  test.each<[name: string, markdown: string, expected: string]>([
    ["a paragraph", "Hello", "<p>Hello</p>"],
    ["emphasis, strong, strikethrough", "*a* **b** ~~c~~", "<p><em>a</em> <strong>b</strong> <del>c</del></p>"],
    ["inline code is a Text code variant", "`x = 1`", '<p><code class="gfui-Text" data-variant="code">x = 1</code></p>'],
    ["headings are Heading components", "## Two", '<h2 id="two" class="gfui-Heading" data-level="2">Two</h2>'],
    ["a fenced code block keeps its language", "```js\nlet a;\n```", '<pre class="gfui-Markdown-code"><code data-language="js">let a;</code></pre>'],
    ["a tight list has no paragraphs", "- a\n- b", "<ul><li>a</li><li>b</li></ul>"],
    ["an ordered list keeps its start", "3. c\n4. d", '<ol start="3"><li>c</li><li>d</li></ol>'],
    ["a task list", "- [x] done\n- [ ] todo", '<ul><li data-task=""><input disabled="" readonly="" type="checkbox" checked="">done</li><li data-task=""><input disabled="" readonly="" type="checkbox">todo</li></ul>'],
    ["a blockquote", "> q", "<blockquote><p>q</p></blockquote>"],
    ["a rule", "a\n\n---\n\nb", "<p>a</p><hr><p>b</p>"],
    ["a hard break", "a  \nb", "<p>a<br>b</p>"],
    [
      "a table with alignment",
      "| a | b |\n|:--|--:|\n| 1 | 2 |",
      '<div class="gfui-Markdown-table"><table><thead><tr><th style="text-align: left;">a</th><th style="text-align: right;">b</th></tr></thead><tbody><tr><td style="text-align: left;">1</td><td style="text-align: right;">2</td></tr></tbody></table></div>',
    ],
    ["an internal link goes through the router (#/ in hash mode)", "[home](/home)", '<p><a class="gfui-Link" href="#/home">home</a></p>'],
    ["an external link is followed by the browser", "[e](https://example.com)", '<p><a class="gfui-Link" href="https://example.com">e</a></p>'],
    ["an autolink (GFM)", "see https://example.com", '<p>see <a class="gfui-Link" href="https://example.com">https://example.com</a></p>'],
    ["a javascript: link is its text only", "[x](javascript:alert(1))", "<p>x</p>"],
    ["an image", '![alt](/a.png "t")', '<p><img class="gfui-Markdown-image" alt="alt" title="t" src="/a.png"></p>'],
    ["a data: image is its alt text", "![alt](data:image/png;base64,AAAA)", "<p>alt</p>"],
    ["a reference link", "[x][r]\n\n[r]: /ref", '<p><a class="gfui-Link" href="#/ref">x</a></p>'],
    ["an undefined reference stays as text", "[x][nope]", "<p>[x][nope]</p>"],
    [
      "a footnote: the reference and the notes at the end",
      "a[^1]\n\n[^1]: note",
      '<p>a<sup class="gfui-Markdown-footnoteRef"><a href="#footnote-1">1</a></sup></p><section class="gfui-Markdown-footnotes"><ol><li id="footnote-1"><p>note</p></li></ol></section>',
    ],
  ])("%s", (_name, markdown, expected) => {
    expect(html(markdown)).toBe(expected);
  });
});

describe("raw HTML: the allowlist", () => {
  test.each<[name: string, markdown: string, expected: string]>([
    ["inline formatting tags", "a <b>bold <i>it</i></b> c", "<p>a <b>bold <i>it</i></b> c</p>"],
    ["a script is text, not an element", "<script>alert(1)</script>", "&lt;script&gt;alert(1)&lt;/script&gt;"],
    ["an iframe is text", "x <iframe src='https://e.com'></iframe>", "<p>x &lt;iframe src='https://e.com'&gt;&lt;/iframe&gt;</p>"],
    ["event attributes are dropped", '<details open onclick="x()"><summary>S</summary>body</details>', '<details open=""><summary>S</summary>body</details>'],
    ["style and class are dropped (inline HTML: in a paragraph)", '<span style="color:red" class="c" title="t">s</span>', '<p><span title="t">s</span></p>'],
    ["a javascript: href is dropped", '<a href="javascript:alert(1)">x</a>', "<p>x</p>"],
    ["a table with colspan", '<table><tr><td colspan="2">a</td></tr></table>', '<table><tr><td colspan="2">a</td></tr></table>'],
    ["an unclosed tag is closed at the end of its parent", "a <b>b", "<p>a <b>b</b></p>"],
    ["a stray closing tag is dropped", "a </b> c", "<p>a  c</p>"],
    ["comments are dropped", "a <!-- hidden --> b", "<p>a  b</p>"],
  ])("%s", (_name, markdown, expected) => {
    expect(html(markdown)).toBe(expected);
  });

  test('allowHtml="false": every tag is text', () => {
    expect(html("a <b>b</b>", 'allowHtml="false"')).toBe("<p>a &lt;b&gt;b&lt;/b&gt;</p>");
  });

  test("an <a> in raw HTML is a router link", () => {
    expect(html('<a href="/x" target="_blank">x</a>')).toBe('<p><a class="gfui-Link" href="#/x" target="_blank" rel="noopener noreferrer">x</a></p>');
  });

  test.each<[url: string, safe: boolean]>([
    ["/relative", true],
    ["page.html", true],
    ["#anchor", true],
    ["?q=1", true],
    ["https://e.com", true],
    ["HTTP://e.com", true],
    ["mailto:a@b.c", true],
    ["tel:123", true],
    ["javascript:alert(1)", false],
    ["JavaScript:alert(1)", false],
    ["java\nscript:alert(1)", false],
    [" javascript:alert(1)", false],
    ["data:text/html,x", false],
    ["vbscript:x", false],
  ])("isSafeUrl(%j) is %s", (url, safe) => {
    expect(isSafeUrl(url)).toBe(safe);
  });

  test("the tokenizer: allowed tags, text, filtered attributes", () => {
    expect(tokenizeHtml('<p title="a &amp; b" onclick="x">t &lt; u</p><foo>')).toEqual([
      { kind: "open", tag: "p", attributes: { title: "a & b" }, selfClosing: false },
      { kind: "text", value: "t < u" },
      { kind: "close", tag: "p" },
      { kind: "text", value: "<foo>" },
    ]);
  });

  test("character references", () => {
    expect(decodeHtmlEntities("&amp;&lt;&#65;&#x42;&nbsp;&unknown;")).toBe("&<AB &unknown;");
  });
});

describe("content", () => {
  test("the nested text's common indent is removed (removeIndents, default true)", () => {
    const container = mount("<App><Markdown>\n    # Title\n\n    Text\n  </Markdown></App>");
    expect(container.querySelector(".gfui-Markdown")!.innerHTML).toBe('<h1 id="title" class="gfui-Heading" data-level="1">Title</h1><p>Text</p>');
  });

  test('removeIndents="false": an indented line is a code block', () => {
    const container = mount('<App><Markdown removeIndents="false"><![CDATA[    code]]></Markdown></App>');
    expect(container.querySelector(".gfui-Markdown pre")).not.toBeNull();
  });

  test("content wins over the nested text; it is not interpolated with @{…}", () => {
    const container = mount(`<App var.t="{'**@{x}**'}"><Markdown content="{t}">nested</Markdown></App>`);
    expect(container.querySelector(".gfui-Markdown")!.innerHTML).toBe("<p><strong>@{x}</strong></p>");
  });

  test("@{…} values are reactive, and formatted: objects as JSON, nullish as nothing", async () => {
    const container = mount(`<App var.n="{1}" var.o="{{ a: 1 }}"><Markdown>n = @{n}, o = @{o}, u = [@{undefined}]</Markdown><Button label="inc" onClick="n++"/></App>`);
    const text = () => container.querySelector(".gfui-Markdown")!.textContent;
    expect(text()).toBe('n = 1, o = {"a":1}, u = []');
    fireEvent.click(screen.getByText("inc"));
    await waitFor(() => expect(text()).toBe('n = 2, o = {"a":1}, u = []'));
  });

  test("removeIndents() and bindingText()", () => {
    expect(removeIndents("\n\n    a\n      b\n\n    c\n  ")).toBe("a\n  b\n\nc");
    expect(removeIndents("a\n  b")).toBe("a\n  b");
    expect([bindingText(null), bindingText(undefined), bindingText(() => 1), bindingText([1, "x"]), bindingText(2)]).toEqual(["", "", "[function]", '[1,"x"]', "2"]);
  });

  test("showHeadingAnchors: ids from the heading's text, formatting included", () => {
    expect(html("## Getting *started*", 'showHeadingAnchors="true"')).toBe(
      '<h2 id="getting-started" class="gfui-Heading" data-level="2">Getting <em>started</em><a class="gfui-Heading-anchor" href="#getting-started" aria-label="Link to this heading">#</a></h2>',
    );
  });

  test("openLinkInNewTab, grayscale, truncateLinks", () => {
    expect(html("[x](/x)", 'openLinkInNewTab="true"')).toBe('<p><a class="gfui-Link" href="#/x" target="_blank" rel="noopener noreferrer">x</a></p>');
    const container = mount('<App><Markdown grayscale="true" truncateLinks="true">x</Markdown></App>');
    const root = container.querySelector(".gfui-Markdown")!;
    expect(root.hasAttribute("data-grayscale")).toBe(true);
    expect(root.hasAttribute("data-truncate-links")).toBe(true);
  });

  test("an internal link navigates without a page load", async () => {
    mount("<App><Markdown>[go](/next)</Markdown><Text>{$pathname}</Text></App>");
    await act(async () => fireEvent.click(screen.getByText("go")));
    expect(screen.getByText("/next")).toBeTruthy();
  });
});

describe("data: a URL", () => {
  const backend = defineBackend({ routes: { "GET /docs/intro": () => "# Intro\n\nFrom the server" } });
  let server: ReturnType<typeof startTestServer>;
  beforeAll(() => {
    server = startTestServer(backend);
  });
  afterAll(() => server.close());
  afterEach(() => resetDataState());

  test("loads the text and renders it", async () => {
    const container = mount('<App><Markdown data="/docs/intro"/></App>');
    await waitFor(() => expect(container.querySelector(".gfui-Markdown h1")?.textContent).toBe("Intro"));
    expect(container.querySelector(".gfui-Markdown p")!.textContent).toBe("From the server");
  });
});
