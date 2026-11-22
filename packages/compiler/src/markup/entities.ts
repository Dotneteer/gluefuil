// Entities decoded in text content. Matches XMLUI's transform.ts
// (tryEscapeEntities): unknown "&…;" sequences are kept literally.
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|nbsp);/g;

/** Decodes the supported entities in a text-content string. */
export function decodeEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  return raw.replace(ENTITY_PATTERN, (_, name: string) => ENTITIES[name]!);
}

export interface DecodedText {
  value: string;
  /**
   * File offset of each decoded character, plus one entry for the end
   * (length = value.length + 1). A decoded entity maps to where it starts.
   */
  offsets: number[];
}

/**
 * Decodes entities like `decodeEntities`, and records where each decoded
 * character came from, so positions in the decoded text (for example of an
 * expression) can be mapped back to the raw markup.
 */
export function decodeEntitiesWithOffsets(raw: string, start: number): DecodedText {
  let value = "";
  const offsets: number[] = [];
  let i = 0;
  ENTITY_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(ENTITY_PATTERN)) {
    for (; i < match.index; i++) {
      value += raw[i];
      offsets.push(start + i);
    }
    value += ENTITIES[match[1]!]!;
    offsets.push(start + match.index);
    i = match.index + match[0].length;
  }
  for (; i < raw.length; i++) {
    value += raw[i];
    offsets.push(start + i);
  }
  offsets.push(start + raw.length);
  return { value, offsets };
}
