// Source markers: how code generation records source positions.
//
// The emitter and the module compiler build JavaScript as strings. At the
// start of every expression, statement and element they insert a marker,
// MARK_OPEN + original offset (base 36) + MARK_CLOSE, using two private-use
// characters. One pass at the end strips the markers and returns the
// [generated offset, original offset] pairs a source map is built from.
//
// User text that reaches the output verbatim (string, template and regex
// literals) has those two characters escaped (`\uE000`), so a marker can
// never be confused with user text.

export const MARK_OPEN = "\uE000";
export const MARK_CLOSE = "\uE001";
const MARKER = /\uE000([0-9a-z]+)\uE001/g;
const MARKER_CHARS = /[\uE000\uE001]/g;

/** Prefixes `text` with a marker for `offset` (a position in the source file). */
export function mark(offset: number, text: string): string {
  return `${MARK_OPEN}${offset.toString(36)}${MARK_CLOSE}${text}`;
}

/** `text` without its markers (for inspecting generated text). */
export function bare(text: string): string {
  return text.replace(MARKER, "");
}

/** Escapes the marker characters in literal source text copied into the output. */
export function escapeMarkerChars(text: string): string {
  return text.replace(MARKER_CHARS, (ch) => `\\u${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `JSON.stringify` for strings, with the marker characters escaped. */
export function jsString(value: string): string {
  return escapeMarkerChars(JSON.stringify(value));
}

/** Removes the markers; returns the clean code and its mappings (one per distinct generated position, last wins). */
export function extractMarkers(text: string): { code: string; pairs: [generated: number, original: number][] } {
  const pairs: [number, number][] = [];
  let code = "";
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    code += text.slice(last, match.index);
    last = match.index + match[0].length;
    const generated = code.length;
    const original = parseInt(match[1]!, 36);
    const previous = pairs[pairs.length - 1];
    if (previous && previous[0] === generated) previous[1] = original;
    else pairs.push([generated, original]);
  }
  code += text.slice(last);
  return { code, pairs };
}
