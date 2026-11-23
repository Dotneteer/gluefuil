// Source Map v3 (https://tc39.es/ecma426/): building maps from offset pairs,
// and reading them back (tests, error overlays, tooling).

import { LineMap } from "./line-map";

export interface SourceMap {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

/** One mapping: a generated position and the original position it comes from (0-based). */
export interface Mapping {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUE = new Map([...BASE64].map((ch, i) => [ch, i]));

export function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += BASE64[digit];
  } while (vlq > 0);
  return out;
}

/** Decodes the VLQ numbers of one segment. */
export function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = BASE64_VALUE.get(ch);
    if (digit === undefined) throw new Error(`Invalid base64 VLQ character '${ch}'`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/** Encodes mappings (single source, no names) as a Source Map v3 `mappings` string. */
export function encodeMappings(mappings: readonly Mapping[]): string {
  const sorted = [...mappings].sort((a, b) => a.generatedLine - b.generatedLine || a.generatedColumn - b.generatedColumn);
  const lines: string[] = [];
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;
  let line = 0;
  let segments: string[] = [];
  let previousGeneratedColumn = 0;
  for (const m of sorted) {
    while (line < m.generatedLine) {
      lines.push(segments.join(","));
      segments = [];
      previousGeneratedColumn = 0;
      line++;
    }
    segments.push(
      encodeVlq(m.generatedColumn - previousGeneratedColumn) +
        encodeVlq(0) + // source index (always the one source)
        encodeVlq(m.originalLine - previousOriginalLine) +
        encodeVlq(m.originalColumn - previousOriginalColumn),
    );
    previousGeneratedColumn = m.generatedColumn;
    previousOriginalLine = m.originalLine;
    previousOriginalColumn = m.originalColumn;
  }
  lines.push(segments.join(","));
  return lines.join(";");
}

/** Decodes a `mappings` string (single-source maps; names are ignored). */
export function decodeMappings(mappings: string): Mapping[] {
  const result: Mapping[] = [];
  let originalLine = 0;
  let originalColumn = 0;
  mappings.split(";").forEach((lineText, generatedLine) => {
    let generatedColumn = 0;
    for (const segment of lineText.split(",")) {
      if (!segment) continue;
      const fields = decodeVlq(segment);
      generatedColumn += fields[0]!;
      if (fields.length < 4) continue;
      originalLine += fields[2]!;
      originalColumn += fields[3]!;
      result.push({ generatedLine, generatedColumn, originalLine, originalColumn });
    }
  });
  return result;
}

/**
 * The original position of a generated position: the closest mapping at or
 * before it on the same generated line (as debuggers resolve positions).
 */
export function originalPositionFor(map: SourceMap, generatedLine: number, generatedColumn: number): { source: string; line: number; column: number } | undefined {
  let best: Mapping | undefined;
  for (const m of decodeMappings(map.mappings)) {
    if (m.generatedLine !== generatedLine || m.generatedColumn > generatedColumn) continue;
    if (!best || m.generatedColumn >= best.generatedColumn) best = m;
  }
  return best ? { source: map.sources[0]!, line: best.originalLine, column: best.originalColumn } : undefined;
}

/** Builds a map from `[generated offset, original offset]` pairs. */
export function buildSourceMap(
  generated: string,
  original: string,
  pairs: readonly (readonly [generatedOffset: number, originalOffset: number])[],
  options: { source: string; file?: string; includeContent?: boolean },
): SourceMap {
  const generatedLines = new LineMap(generated);
  const originalLines = new LineMap(original);
  const mappings = pairs.map(([g, o]) => {
    const gp = generatedLines.positionAt(g);
    const op = originalLines.positionAt(o);
    return { generatedLine: gp.line, generatedColumn: gp.column, originalLine: op.line, originalColumn: op.column };
  });
  return {
    version: 3,
    ...(options.file !== undefined ? { file: options.file } : {}),
    sources: [options.source],
    ...(options.includeContent === false ? {} : { sourcesContent: [original] }),
    names: [],
    mappings: encodeMappings(mappings),
  };
}

/** Shifts a map's generated positions down by `lines` (code was prefixed with that many lines). */
export function offsetSourceMapLines(map: SourceMap, lines: number): SourceMap {
  return { ...map, mappings: ";".repeat(lines) + map.mappings };
}
