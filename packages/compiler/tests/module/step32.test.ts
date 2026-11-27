// Step 32: the compiler's part of the remaining components: a component that
// receives its literal id ($$id), API members left out with a reason (C015),
// a deprecated component (E024), a removed one (E032).
// Design: .ai/plan/poc-32-remaining.md
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) => {
  const result = compileModule(markup, { sourceMap: false });
  return result.diagnostics.map((d) => [d.severity ?? "error", d.code, markup.slice(d.start, d.end)]);
};
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;

describe("step 32 in the compiler", () => {
  test("a Bookmark receives its literal id as $$id (and keeps its API)", () => {
    const out = code('<App><Bookmark id="faq"/><Button onClick="faq.scrollIntoView()"/></App>');
    expect(out).toContain('"$$id": "faq"');
    expect(code('<App><Text id="t"/></App>')).not.toContain("$$id");
  });

  test("a Bookmark's id may be any anchor name; one that isn't an identifier has no API (other components: E011)", () => {
    const result = compileModule('<App><Bookmark id="getting-started"/></App>', { sourceMap: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('"$$id": "getting-started"');
    expect(result.code).not.toMatch(/id: "getting-started"/);
    expect(problems('<App><Text id="getting-started"/></App>')).toEqual([["error", "E011", '"getting-started"']]);
  });

  test.each<[string, string, string[][]]>([
    ["IFrame getContentWindow, with why", '<App><IFrame id="f"/><Button onClick="f.getContentWindow()"/></App>', [["error", "C015", "getContentWindow"]]],
    ["IFrame postMessage is fine", '<App><IFrame id="f"/><Button onClick="f.postMessage(1)"/></App>', []],
    ["ToneChangerButton is deprecated", "<App><ToneChangerButton/></App>", [["warning", "E024", "ToneChangerButton"]]],
    ["AppState is removed", '<App><AppState id="s"/></App>', [["error", "E032", "AppState"]]],
    ["IncludeMarkup is unknown", '<App><IncludeMarkup url="/x.gui"/></App>', [["error", "E001", "IncludeMarkup"]]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("the removed member's message replaces 'did you mean'", () => {
    const [d] = compileModule('<App><IFrame id="f"/><Button onClick="f.getContentDocument()"/></App>', { sourceMap: false }).diagnostics;
    expect(d!.message).toBe("'f' (IFrame) has no member 'getContentDocument'. gfui gives script no document object (the sandbox); use postMessage() and a MessageListener.");
  });
});
