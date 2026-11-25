// Markup parser: .gui markup text (XMLUI syntax) -> syntax tree with source positions.
// Design and XMLUI compatibility notes: .ai/plan/poc-01-markup-parser.md
//
// A single-pass, iterative parser. Content mode reads text up to the next
// '<'; tag mode reads names, attributes and quoted values. Open elements are
// kept on an explicit stack, so deep nesting cannot overflow the call stack.

import type { Diagnostic } from "../source/diagnostic";
import type {
  AttributeNode,
  AttributeValue,
  CDataNode,
  CommentNode,
  ContentNode,
  DocumentNode,
  ElementNode,
  Name,
  Span,
} from "./ast";
import { MarkupDiagnostics, type MarkupDiagnosticCode } from "./diagnostics";
import { decodeEntities } from "./entities";

export interface ParseMarkupResult {
  document: DocumentNode;
  diagnostics: Diagnostic[];
}

/** Parses markup text. Never throws: problems are reported as diagnostics. */
export function parseMarkup(text: string): ParseMarkupResult {
  return new MarkupParser(text).parse();
}

const enum Ch {
  Tab = 0x09,
  LineFeed = 0x0a,
  VerticalTab = 0x0b,
  FormFeed = 0x0c,
  CarriageReturn = 0x0d,
  Space = 0x20,
  DoubleQuote = 0x22,
  Dollar = 0x24,
  SingleQuote = 0x27,
  Minus = 0x2d,
  Dot = 0x2e,
  Slash = 0x2f,
  Digit0 = 0x30,
  Digit9 = 0x39,
  Colon = 0x3a,
  LessThan = 0x3c,
  Equals = 0x3d,
  GreaterThan = 0x3e,
  UpperA = 0x41,
  UpperZ = 0x5a,
  Underscore = 0x5f,
  Backtick = 0x60,
  LowerA = 0x61,
  LowerZ = 0x7a,
}

function isNameStart(ch: number): boolean {
  return (
    (ch >= Ch.LowerA && ch <= Ch.LowerZ) ||
    (ch >= Ch.UpperA && ch <= Ch.UpperZ) ||
    ch === Ch.Underscore ||
    ch === Ch.Dollar
  );
}

function isNamePart(ch: number): boolean {
  return (
    isNameStart(ch) || (ch >= Ch.Digit0 && ch <= Ch.Digit9) || ch === Ch.Minus || ch === Ch.Dot
  );
}

function isQuote(ch: number): boolean {
  return ch === Ch.DoubleQuote || ch === Ch.SingleQuote || ch === Ch.Backtick;
}

/** The whitespace set XMLUI's scanner skips inside tags. */
function isWhitespace(ch: number): boolean {
  return (
    ch === Ch.Space ||
    (ch >= Ch.Tab && ch <= Ch.CarriageReturn) ||
    ch === 0x85 ||
    ch === 0xa0 ||
    ch === 0x1680 ||
    (ch >= 0x2000 && ch <= 0x200b) ||
    ch === 0x2028 ||
    ch === 0x2029 ||
    ch === 0x202f ||
    ch === 0x205f ||
    ch === 0x3000 ||
    ch === 0xfeff
  );
}

class MarkupParser {
  private pos = 0;
  private readonly diagnostics: Diagnostic[] = [];
  private readonly openElements: ElementNode[] = [];
  private readonly document: DocumentNode;

  constructor(private readonly text: string) {
    this.document = { kind: "document", children: [], start: 0, end: text.length };
  }

  parse(): ParseMarkupResult {
    const { text } = this;
    while (this.pos < text.length) {
      if (text.charCodeAt(this.pos) === Ch.LessThan) this.parseMarkupConstruct();
      else this.parseText();
    }
    // Everything still open at the end of the input is unclosed.
    while (this.openElements.length > 0) {
      const element = this.openElements.pop()!;
      this.report("M011", element.name, element.name.full);
      element.end = text.length;
    }
    return { document: this.document, diagnostics: this.diagnostics };
  }

  // --- Helpers -------------------------------------------------------------

  private get children(): ContentNode[] {
    return this.openElements.at(-1)?.children ?? this.document.children;
  }

  private at(offset = 0): number {
    return this.text.charCodeAt(this.pos + offset);
  }

  private startsWith(literal: string): boolean {
    return this.text.startsWith(literal, this.pos);
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length && isWhitespace(this.at())) this.pos++;
  }

  private report<C extends MarkupDiagnosticCode>(
    code: C,
    span: Span,
    ...args: Parameters<(typeof MarkupDiagnostics)[C]>
  ): void {
    const message = (MarkupDiagnostics[code] as (...a: unknown[]) => string)(...args);
    this.diagnostics.push({ code, severity: "error", message, start: span.start, end: span.end });
  }

  // --- Content mode --------------------------------------------------------

  private parseText(): void {
    const start = this.pos;
    const next = this.text.indexOf("<", start);
    const end = next < 0 ? this.text.length : next;
    const raw = this.text.slice(start, end);
    this.children.push({ kind: "text", value: decodeEntities(raw), raw, start, end });
    this.pos = end;
  }

  private parseMarkupConstruct(): void {
    if (this.startsWith("<!--")) this.children.push(this.parseComment());
    else if (this.startsWith("<![CDATA[")) this.children.push(this.parseCData());
    else if (this.startsWith("<script>")) this.parseScript();
    else if (this.startsWith("</")) this.parseClosingTag();
    else this.parseOpeningTag();
  }

  private parseComment(): CommentNode {
    const { value, start, end } = this.parseRawSection("<!--", "-->", "M003");
    return { kind: "comment", value, start, end };
  }

  private parseCData(): CDataNode {
    const { value, start, end } = this.parseRawSection("<![CDATA[", "]]>", "M004");
    return { kind: "cdata", value, start, end };
  }

  private parseRawSection(opener: string, closer: string, unterminated: "M003" | "M004") {
    const start = this.pos;
    const contentStart = start + opener.length;
    const close = this.text.indexOf(closer, contentStart);
    const contentEnd = close < 0 ? this.text.length : close;
    if (close < 0) this.report(unterminated, { start, end: contentStart });
    this.pos = close < 0 ? this.text.length : close + closer.length;
    return { value: this.text.slice(contentStart, contentEnd), start, end: this.pos };
  }

  private parseScript(): void {
    const start = this.pos;
    const contentStart = start + "<script>".length;
    const close = this.text.indexOf("</script>", contentStart);
    const contentEnd = close < 0 ? this.text.length : close;
    if (close < 0) this.report("M005", { start, end: contentStart });
    this.pos = close < 0 ? this.text.length : close + "</script>".length;
    this.children.push({
      kind: "script",
      content: this.text.slice(contentStart, contentEnd),
      contentSpan: { start: contentStart, end: contentEnd },
      start,
      end: this.pos,
    });
  }

  // --- Tag mode ------------------------------------------------------------

  /** Reads `local` or `prefix:local` at the current position, if a name starts here. */
  private parseName(): Name | undefined {
    if (!isNameStart(this.at())) return undefined;
    const start = this.pos;
    const first = this.readNamePart();
    if (this.at() !== Ch.Colon) return { local: first, full: first, start, end: this.pos };

    this.pos++; // ':'
    if (!isNameStart(this.at())) {
      this.report("M014", { start, end: this.pos }, first);
      return { local: first, full: first, start, end: this.pos };
    }
    const local = this.readNamePart();
    return { prefix: first, local, full: `${first}:${local}`, start, end: this.pos };
  }

  private readNamePart(): string {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.text.length && isNamePart(this.at())) this.pos++;
    return this.text.slice(start, this.pos);
  }

  private parseOpeningTag(): void {
    const start = this.pos;
    this.pos++; // '<'
    const name = this.parseName();
    if (!name) {
      // Not a tag: report it and keep the '<' as text, so parsing continues.
      this.report("M006", { start, end: start + 1 });
      this.children.push({ kind: "text", value: "<", raw: "<", start, end: start + 1 });
      return;
    }

    const element: ElementNode = {
      kind: "element",
      name,
      attributes: [],
      children: [],
      selfClosing: false,
      openTag: { start, end: name.end },
      start,
      end: name.end,
    };
    this.children.push(element);

    const seen = new Set<string>();
    for (;;) {
      this.skipWhitespace();
      const ch = this.at();

      if (this.startsWith("<!--")) {
        // A comment between attributes (XMLUI treats it as trivia).
        (element.tagComments ??= []).push(this.parseComment());
        continue;
      }
      if (this.pos >= this.text.length || ch === Ch.LessThan) {
        // Broken start tag: close it where it stops; it gets no children.
        this.report("M009", { start: this.pos, end: this.pos });
        element.openTag.end = element.end = this.pos;
        return;
      }
      if (ch === Ch.GreaterThan) {
        this.pos++;
        element.openTag.end = element.end = this.pos;
        this.openElements.push(element);
        return;
      }
      if (ch === Ch.Slash && this.at(1) === Ch.GreaterThan) {
        this.pos += 2;
        element.selfClosing = true;
        element.openTag.end = element.end = this.pos;
        return;
      }
      if (isNameStart(ch)) {
        element.attributes.push(this.parseAttribute(seen));
        continue;
      }
      if (isQuote(ch)) {
        // A string where an attribute name belongs, e.g. <A "x">
        const stringStart = this.pos;
        this.parseQuoted();
        this.report("M007", { start: stringStart, end: this.pos });
        continue;
      }
      if (ch === Ch.Equals) {
        // A value without a name, e.g. <A ="x">
        this.report("M007", { start: this.pos, end: this.pos + 1 });
        this.pos++;
        this.skipWhitespace();
        if (isQuote(this.at())) this.parseQuoted();
        continue;
      }
      const codePoint = this.text.codePointAt(this.pos)!;
      const width = codePoint > 0xffff ? 2 : 1;
      this.report("M001", { start: this.pos, end: this.pos + width }, String.fromCodePoint(codePoint));
      this.pos += width;
    }
  }

  private parseAttribute(seen: Set<string>): AttributeNode {
    const name = this.parseName()!;
    const firstChar = name.local.charCodeAt(0);
    if (!name.prefix && firstChar >= Ch.UpperA && firstChar <= Ch.UpperZ) {
      this.report("M015", name, name.full);
    }
    if (seen.has(name.full)) this.report("M013", name, name.full);
    else seen.add(name.full);

    const attribute: AttributeNode = { kind: "attribute", name, start: name.start, end: name.end };
    const afterName = this.pos;
    this.skipWhitespace();
    if (this.at() !== Ch.Equals) {
      this.pos = afterName; // valueless attribute
      return attribute;
    }

    const equalsPos = this.pos;
    this.pos++;
    this.skipWhitespace();
    if (isQuote(this.at())) {
      attribute.value = this.parseQuoted();
      attribute.end = attribute.value.end;
    } else {
      this.report("M008", { start: equalsPos, end: equalsPos + 1 });
      attribute.end = equalsPos + 1;
    }
    return attribute;
  }

  /** Reads a quoted value; no escapes (XMLUI semantics). Unterminated: runs to the end. */
  private parseQuoted(): AttributeValue {
    const start = this.pos;
    const quote = this.text[start] as AttributeValue["quote"];
    const close = this.text.indexOf(quote, start + 1);
    const innerEnd = close < 0 ? this.text.length : close;
    if (close < 0) this.report("M002", { start, end: start + 1 });
    this.pos = close < 0 ? this.text.length : close + 1;
    const raw = this.text.slice(start + 1, innerEnd);
    return {
      value: decodeEntities(raw),
      raw,
      quote,
      inner: { start: start + 1, end: innerEnd },
      start,
      end: this.pos,
    };
  }

  private parseClosingTag(): void {
    const start = this.pos;
    this.pos += 2; // '</'
    const name = this.parseName();
    if (!name) {
      this.report("M006", { start, end: this.pos });
      // Skip the rest of the broken closing tag.
      while (this.pos < this.text.length && this.at() !== Ch.GreaterThan && this.at() !== Ch.LessThan) {
        this.pos++;
      }
      if (this.at() === Ch.GreaterThan) this.pos++;
      return;
    }

    this.skipWhitespace();
    if (this.at() === Ch.GreaterThan) this.pos++;
    else this.report("M009", { start: this.pos, end: this.pos });
    const closeTag: Span = { start, end: this.pos };

    const stack = this.openElements;
    let index = stack.length - 1;
    while (index >= 0 && stack[index]!.name.full !== name.full) index--;

    if (index < 0) {
      if (stack.length === 0) this.report("M012", closeTag, name.full);
      else this.report("M010", closeTag, name.full, stack.at(-1)!.name.full);
      return; // the closing tag is ignored
    }

    // Elements opened after the matching one were never closed.
    while (stack.length - 1 > index) {
      const unclosed = stack.pop()!;
      this.report("M011", unclosed.name, unclosed.name.full);
      unclosed.end = start;
    }
    const element = stack.pop()!;
    element.closeTag = closeTag;
    element.end = closeTag.end;
  }
}
