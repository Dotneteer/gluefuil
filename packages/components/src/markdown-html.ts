// Raw HTML inside Markdown (step 23; design: .ai/plan/poc-23-display.md,
// "Raw HTML inside Markdown"). XMLUI passes every known tag through rehype-raw
// (MarkdownReact.tsx KNOWN_HTML_TAGS), scripts and event attributes included.
// gfui keeps an allowlist: formatting, tables, lists, details, images and links,
// with a few attributes each, and URLs only of safe schemes. A tag outside the
// list stays in the text as written; an attribute outside it is dropped.
// React-free: the renderer (markdown-render.tsx) builds elements from the tokens.

export type HtmlToken =
  | { kind: "text"; value: string }
  | { kind: "open"; tag: string; attributes: Record<string, string | true>; selfClosing: boolean }
  | { kind: "close"; tag: string };

/** Tags rendered as elements; any other tag is text. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt", "em",
  "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "samp",
  "small", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "var", "wbr",
]);

/** Elements without content (no closing tag). */
export const VOID_TAGS: ReadonlySet<string> = new Set(["br", "col", "hr", "img", "wbr"]);

const GLOBAL_ATTRIBUTES = ["title", "lang", "dir"];

/** The attributes each tag may have, besides the global ones. */
const TAG_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "target"],
  blockquote: ["cite"],
  col: ["span"],
  colgroup: ["span"],
  del: ["cite"],
  details: ["open"],
  img: ["src", "alt", "width", "height"],
  ins: ["cite"],
  li: ["value"],
  ol: ["start", "type", "reversed"],
  q: ["cite"],
  td: ["colspan", "rowspan", "align"],
  th: ["colspan", "rowspan", "align", "scope"],
};

const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src", "cite"]);

/**
 * A URL that is safe to follow or load: relative (a path, `?query`, `#hash`)
 * or `http:`, `https:`, `mailto:`, `tel:`. Whitespace and control characters
 * are ignored when finding the scheme (`java\nscript:` is `javascript:`).
 */
export function isSafeUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex
  const compact = url.replace(/[\u0000- \u007f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return scheme === null || ["http", "https", "mailto", "tel"].includes(scheme[1]!.toLowerCase());
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", hellip: "…", mdash: "—", ndash: "–" };

/** Decodes the character references of HTML text: a few named ones and every numeric one. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const COMMENT = /<!--[\s\S]*?-->/y;

/** An allowed tag's attributes, filtered: names lowercased, unknown ones and unsafe URLs dropped. */
function allowedAttributes(tag: string, source: string): Record<string, string | true> {
  const allowed = [...GLOBAL_ATTRIBUTES, ...(TAG_ATTRIBUTES[tag] ?? [])];
  const result: Record<string, string | true> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1]!.toLowerCase();
    if (!allowed.includes(name)) continue;
    const raw = match[2] ?? match[3] ?? match[4];
    const value = raw === undefined ? true : decodeHtmlEntities(raw);
    if (URL_ATTRIBUTES.has(name) && (value === true || !isSafeUrl(value))) continue;
    if (name === "target" && value !== "_blank" && value !== "_self") continue;
    result[name] = value;
  }
  return result;
}

/**
 * Splits raw HTML into text and the allowed tags. A tag outside the allowlist
 * (and anything that doesn't parse as a tag) is text, as written; comments are
 * dropped. Text is decoded (character references).
 */
export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") tokens.push({ kind: "text", value: decodeHtmlEntities(text) });
    text = "";
  };
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const end = next < 0 ? html.length : next;
      text += html.slice(i, end);
      i = end;
      continue;
    }
    COMMENT.lastIndex = i;
    const comment = COMMENT.exec(html);
    if (comment) {
      i += comment[0].length;
      continue;
    }
    TAG.lastIndex = i;
    const tag = TAG.exec(html);
    const name = tag?.[2]!.toLowerCase();
    if (!tag || !name || !ALLOWED_TAGS.has(name)) {
      // Not an allowed tag: its source is text (rendered literally, never as markup).
      const end = tag ? i + tag[0].length : i + 1;
      text += html.slice(i, end);
      i = end;
      continue;
    }
    flush();
    if (tag[1] === "/") tokens.push({ kind: "close", tag: name });
    else tokens.push({ kind: "open", tag: name, attributes: allowedAttributes(name, tag[3] ?? ""), selfClosing: tag[4] === "/" || VOID_TAGS.has(name) });
    i += tag[0].length;
  }
  flush();
  return tokens;
}
