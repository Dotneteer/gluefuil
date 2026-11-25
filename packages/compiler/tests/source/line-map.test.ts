import { describe, expect, test } from "vitest";
import { codeFrame, formatDiagnostic } from "../../src/source/diagnostic";
import { LineMap } from "../../src/source/line-map";

describe("LineMap", () => {
  test.each([
    ["\\n", "ab\ncd\nef"],
    ["\\r\\n", "ab\r\ncd\r\nef"],
    ["\\r", "ab\rcd\ref"],
  ])("line breaks: %s", (_, text) => {
    const map = new LineMap(text);
    expect(map.lineCount).toBe(3);
    expect(map.positionAt(0)).toEqual({ line: 0, column: 0 });
    expect(map.positionAt(text.indexOf("c"))).toEqual({ line: 1, column: 0 });
    expect(map.positionAt(text.indexOf("d"))).toEqual({ line: 1, column: 1 });
    expect(map.positionAt(text.length)).toEqual({ line: 2, column: 2 });
  });

  test("a line break belongs to the line it ends", () => {
    const text = "ab\r\ncd";
    const map = new LineMap(text);
    expect(map.positionAt(2)).toEqual({ line: 0, column: 2 }); // '\r'
    expect(map.positionAt(3)).toEqual({ line: 0, column: 3 }); // '\n'
    expect(map.positionAt(4)).toEqual({ line: 1, column: 0 });
  });

  test("offsetAt is the inverse of positionAt", () => {
    const text = "<A>\n  <B x=\"1\"/>\r\n</A>\r";
    const map = new LineMap(text);
    for (let offset = 0; offset <= text.length; offset++) {
      const position = map.positionAt(offset);
      // Offsets inside a "\r\n" pair map back to the same line/column.
      expect(map.offsetAt(position)).toBe(offset);
    }
  });

  test("out-of-range values are clamped", () => {
    const map = new LineMap("ab\ncd");
    expect(map.positionAt(-5)).toEqual({ line: 0, column: 0 });
    expect(map.positionAt(99)).toEqual({ line: 1, column: 2 });
    expect(map.offsetAt({ line: 9, column: 0 })).toBe(3);
    expect(map.offsetAt({ line: 0, column: 99 })).toBe(3);
  });

  test("empty text has one line", () => {
    const map = new LineMap("");
    expect(map.lineCount).toBe(1);
    expect(map.positionAt(0)).toEqual({ line: 0, column: 0 });
  });
});

test("formatDiagnostic uses 1-based line and column", () => {
  const text = "<App>\n  <A x=\"1\" x=\"2\"/>\n</App>";
  const start = text.lastIndexOf("x");
  const formatted = formatDiagnostic(
    { code: "M013", severity: "error", message: "Duplicate attribute 'x'", start, end: start + 1 },
    new LineMap(text),
    "Main.gui",
  );
  expect(formatted).toBe("Main.gui:2:12: error M013: Duplicate attribute 'x'");
});

test.each([
  ["\\n", "<App>\n  <Text value=\"{x}\"/>\n</App>"],
  ["\\r\\n", "<App>\r\n  <Text value=\"{x}\"/>\r\n</App>"],
  ["\\r", "<App>\r  <Text value=\"{x}\"/>\r</App>"],
])("codeFrame shows the line and a caret (%s line breaks)", (_, text) => {
  expect(codeFrame(text, new LineMap(text), text.indexOf("x}"))).toBe('    <Text value="{x}"/>\n' + " ".repeat(18) + "^");
});

test("codeFrame on the last line and at the end of the text", () => {
  const text = "<App>\n<Text";
  expect(codeFrame(text, new LineMap(text), text.length)).toBe("  <Text\n       ^");
});
