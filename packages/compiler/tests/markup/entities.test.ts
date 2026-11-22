import { expect, test } from "vitest";
import { decodeEntities, decodeEntitiesWithOffsets } from "../../src/markup/entities";

test.each([
  ["no entities", "plain", "plain"],
  ["all supported entities", "&amp;&lt;&gt;&quot;&apos;&nbsp;", `&<>"' `],
  ["decoding is not recursive", "&amp;lt;", "&lt;"],
  ["unknown entity kept", "&copy;", "&copy;"],
  ["missing semicolon kept", "&amp", "&amp"],
  ["bare ampersand kept", "a & b", "a & b"],
  ["numeric references are not supported (as in XMLUI)", "&#60;", "&#60;"],
])("%s", (_, input, expected) => {
  expect(decodeEntities(input)).toBe(expected);
});

test("decodeEntitiesWithOffsets maps each decoded character to its source offset", () => {
  const raw = "a&lt;b&amp;&amp;c";
  const { value, offsets } = decodeEntitiesWithOffsets(raw, 10);
  expect(value).toBe("a<b&&c");
  // a=10, '<' from "&lt;" at 11, b=15, '&' at 16, '&' at 21, c=26, end=27
  expect(offsets).toEqual([10, 11, 15, 16, 21, 26, 27]);
});

test("decodeEntitiesWithOffsets without entities is the identity mapping", () => {
  expect(decodeEntitiesWithOffsets("abc", 5)).toEqual({ value: "abc", offsets: [5, 6, 7, 8] });
});
