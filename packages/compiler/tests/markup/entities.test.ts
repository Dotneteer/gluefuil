import { expect, test } from "vitest";
import { decodeEntities } from "../../src/markup/entities";

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
