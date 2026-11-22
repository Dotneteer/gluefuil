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
