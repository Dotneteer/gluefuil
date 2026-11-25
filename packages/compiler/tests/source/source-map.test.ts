// Source Map v3 encoding and decoding.
import { describe, expect, test } from "vitest";
import {
  buildSourceMap,
  decodeMappings,
  decodeVlq,
  encodeMappings,
  encodeVlq,
  offsetSourceMapLines,
  originalPositionFor,
} from "../../src/source/source-map";

describe("base64 VLQ", () => {
  test.each<[value: number, encoded: string]>([
    [0, "A"],
    [1, "C"],
    [-1, "D"],
    [15, "e"],
    [16, "gB"],
    [-16, "hB"],
    [123456, "gkxH"],
  ])("%i <-> %s", (value, encoded) => {
    expect(encodeVlq(value)).toBe(encoded);
    expect(decodeVlq(encoded)).toEqual([value]);
  });

  test("round trip of many values", () => {
    for (let v = -2000; v <= 2000; v += 7) expect(decodeVlq(encodeVlq(v))).toEqual([v]);
  });

  test("invalid characters are rejected", () => {
    expect(() => decodeVlq("A!")).toThrow(/Invalid/);
  });
});

describe("mappings", () => {
  const mappings = [
    { generatedLine: 0, generatedColumn: 4, originalLine: 2, originalColumn: 3 },
    { generatedLine: 0, generatedColumn: 10, originalLine: 2, originalColumn: 9 },
    { generatedLine: 2, generatedColumn: 0, originalLine: 0, originalColumn: 0 },
    { generatedLine: 2, generatedColumn: 5, originalLine: 5, originalColumn: 1 },
  ];

  test("encode and decode are inverse; lines without mappings stay empty", () => {
    const encoded = encodeMappings(mappings);
    expect(encoded.split(";")).toHaveLength(3);
    expect(encoded.split(";")[1]).toBe("");
    expect(decodeMappings(encoded)).toEqual(mappings);
  });

  test("encoding sorts by generated position", () => {
    expect(decodeMappings(encodeMappings([...mappings].reverse()))).toEqual(mappings);
  });

  test("originalPositionFor: the closest mapping at or before the column, on the same line", () => {
    const map = { version: 3 as const, sources: ["a.gui"], names: [], mappings: encodeMappings(mappings) };
    expect(originalPositionFor(map, 0, 4)).toEqual({ source: "a.gui", line: 2, column: 3 });
    expect(originalPositionFor(map, 0, 9)).toEqual({ source: "a.gui", line: 2, column: 3 });
    expect(originalPositionFor(map, 0, 99)).toEqual({ source: "a.gui", line: 2, column: 9 });
    expect(originalPositionFor(map, 0, 2)).toBeUndefined();
    expect(originalPositionFor(map, 1, 0)).toBeUndefined();
  });

  test("offsetSourceMapLines shifts every generated line", () => {
    const map = { version: 3 as const, sources: ["a"], names: [], mappings: encodeMappings(mappings) };
    const shifted = offsetSourceMapLines(map, 3);
    expect(decodeMappings(shifted.mappings)).toEqual(mappings.map((m) => ({ ...m, generatedLine: m.generatedLine + 3 })));
  });
});

test("buildSourceMap converts offsets to lines and columns, and embeds the source", () => {
  const original = "ab\ncd\nef";
  const generated = "xx\nyyyy";
  const map = buildSourceMap(generated, original, [[3, 4], [5, 7]], { source: "f.gui", file: "f.gui.js" });
  expect(map).toMatchObject({ version: 3, file: "f.gui.js", sources: ["f.gui"], sourcesContent: [original], names: [] });
  expect(decodeMappings(map.mappings)).toEqual([
    { generatedLine: 1, generatedColumn: 0, originalLine: 1, originalColumn: 1 },
    { generatedLine: 1, generatedColumn: 2, originalLine: 2, originalColumn: 1 },
  ]);
  expect(buildSourceMap(generated, original, [], { source: "f", includeContent: false }).sourcesContent).toBeUndefined();
});
