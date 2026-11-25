// Lexer for gfui script. Driven by the parser: `next()` scans one token;
// `rescanRegex()` and `rescanTemplate()` re-read a token in a context the
// lexer cannot know on its own ('/' as regex vs division; template
// continuation after '}').
//
// Positions are raw indices into `text`; the parser maps them to file offsets.

import type { ScriptDiagnosticCode } from "./diagnostics";

export type TokenKind = "eof" | "name" | "punct" | "number" | "string" | "template" | "regex" | "privateName";

export interface Token {
  kind: TokenKind;
  /** Identifier name, punctuator text, or raw source for literals. */
  value: string;
  start: number;
  end: number;
  /** A line terminator occurred between the previous token and this one. */
  newlineBefore: boolean;
  /** number: numeric value; string: cooked value. */
  literal?: number | string;
  /** BigInt literal digits (without the `n` suffix). */
  bigint?: string;
  /** Template chunk: cooked text (null on an invalid escape) and whether it ends the template. */
  cooked?: string | null;
  tail?: boolean;
  /** Regular expression literal parts. */
  regex?: { pattern: string; flags: string };
}

export type LexerReport = (code: ScriptDiagnosticCode, start: number, end: number, ...args: string[]) => void;

// Longest first, so a greedy scan picks the longest punctuator.
const PUNCTUATORS = [
  ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "**", "<<", ">>",
  "{", "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^", "!", "~", "?", ":", "=", ".",
];

const ID_START = /[\p{ID_Start}$_]/u;
const ID_CONTINUE = /[\p{ID_Continue}$‌‍]/u;

export function isIdentifierStart(ch: string): boolean {
  return ID_START.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return ID_CONTINUE.test(ch);
}

function isLineTerminator(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
}

function isWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0b ||
    code === 0x0c ||
    code === 0xa0 ||
    code === 0xfeff ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

const isDigit = (ch: string | undefined) => ch !== undefined && ch >= "0" && ch <= "9";

export class Lexer {
  pos: number;
  /** While true (during lookahead), diagnostics are not reported. */
  private silent = false;

  constructor(
    private readonly text: string,
    start: number,
    private readonly end: number,
    private readonly report: LexerReport,
  ) {
    this.pos = start;
  }

  /** Scans one token without reporting diagnostics, then restores the position. */
  peek(): Token {
    const saved = this.pos;
    this.silent = true;
    try {
      return this.next();
    } finally {
      this.silent = false;
      this.pos = saved;
    }
  }

  private error(code: ScriptDiagnosticCode, start: number, end: number, ...args: string[]) {
    if (!this.silent) this.report(code, start, end, ...args);
  }

  private char(offset = 0): string | undefined {
    const i = this.pos + offset;
    return i < this.end ? this.text[i] : undefined;
  }

  /** Skips whitespace and comments; returns whether a line terminator was crossed. */
  private skipTrivia(): boolean {
    let newline = false;
    while (this.pos < this.end) {
      const code = this.text.charCodeAt(this.pos);
      if (isLineTerminator(code)) {
        newline = true;
        this.pos++;
      } else if (isWhitespace(code)) {
        this.pos++;
      } else if (code === 0x2f /* / */ && this.char(1) === "/") {
        while (this.pos < this.end && !isLineTerminator(this.text.charCodeAt(this.pos))) this.pos++;
      } else if (code === 0x2f && this.char(1) === "*") {
        const start = this.pos;
        const close = this.text.indexOf("*/", this.pos + 2);
        if (close < 0 || close + 2 > this.end) {
          this.error("S005", start, start + 2);
          this.pos = this.end;
        } else {
          const body = this.text.slice(this.pos, close);
          if (/[\n\r\u2028\u2029]/.test(body)) newline = true;
          this.pos = close + 2;
        }
      } else {
        break;
      }
    }
    return newline;
  }

  next(): Token {
    const newlineBefore = this.skipTrivia();
    const start = this.pos;
    if (start >= this.end) return { kind: "eof", value: "", start, end: start, newlineBefore };

    const ch = this.text[start]!;

    if (isIdentifierStart(ch)) return this.scanName(start, newlineBefore);
    if (isDigit(ch) || (ch === "." && isDigit(this.char(1)))) return this.scanNumber(start, newlineBefore);
    if (ch === '"' || ch === "'") return this.scanString(start, newlineBefore);
    if (ch === "`") {
      this.pos++;
      return this.scanTemplateChunk(start, newlineBefore);
    }
    if (ch === "#" && this.pos + 1 < this.end && isIdentifierStart(this.text[this.pos + 1]!)) {
      this.pos++;
      const name = this.scanName(this.pos, newlineBefore);
      return { ...name, kind: "privateName", value: `#${name.value}`, start };
    }

    for (const punct of PUNCTUATORS) {
      if (this.text.startsWith(punct, start) && start + punct.length <= this.end) {
        // `?.` followed by a digit is `?` then a number: `a?.5:b`
        if (punct === "?." && isDigit(this.text[start + 2])) continue;
        this.pos = start + punct.length;
        return { kind: "punct", value: punct, start, end: this.pos, newlineBefore };
      }
    }

    const codePoint = this.text.codePointAt(start)!;
    const width = codePoint > 0xffff ? 2 : 1;
    this.pos = start + width;
    this.error("S001", start, this.pos, String.fromCodePoint(codePoint));
    return this.next();
  }

  private scanName(start: number, newlineBefore: boolean): Token {
    this.pos = start;
    while (this.pos < this.end) {
      const codePoint = this.text.codePointAt(this.pos)!;
      const ch = String.fromCodePoint(codePoint);
      if (!(this.pos === start ? isIdentifierStart(ch) : isIdentifierPart(ch))) break;
      this.pos += ch.length;
    }
    return { kind: "name", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore };
  }

  private scanNumber(start: number, newlineBefore: boolean): Token {
    const rest = this.text.slice(start, this.end);
    const match =
      /^0[xX][0-9a-fA-F_]*n?/.exec(rest) ??
      /^0[bB][01_]*n?/.exec(rest) ??
      /^0[oO][0-7_]*n?/.exec(rest) ??
      /^(?:\d[\d_]*)?(?:\.[\d_]*)?(?:[eE][+-]?[\d_]*)?n?/.exec(rest)!;
    let raw = match[0];
    this.pos = start + raw.length;

    let valid = true;
    const isBigInt = raw.endsWith("n");
    const digits = isBigInt ? raw.slice(0, -1) : raw;
    const withoutSeparators = digits.replaceAll("_", "");
    // Separators only between digits; no legacy octal (012); BigInt only for integers.
    if (/(^|[^0-9a-fA-F])_|_($|[^0-9a-fA-F])|__/.test(digits.replace(/^0[xXbBoO]/, "0"))) valid = false;
    if (/^0\d/.test(withoutSeparators)) valid = false;
    if (/^0[xXbBoO]$/.test(withoutSeparators)) valid = false;
    if (/[eE][+-]?$/.test(withoutSeparators)) valid = false;
    if (isBigInt && /[.eE]/.test(withoutSeparators) && !/^0[xX]/.test(withoutSeparators)) valid = false;
    // A number must not run straight into an identifier: `3in`, `1px`.
    if (this.pos < this.end && isIdentifierStart(this.text[this.pos]!)) {
      while (this.pos < this.end && isIdentifierPart(this.text[this.pos]!)) this.pos++;
      raw = this.text.slice(start, this.pos);
      valid = false;
    }
    if (!valid) this.error("S006", start, this.pos);

    const token: Token = { kind: "number", value: raw, start, end: this.pos, newlineBefore };
    if (isBigInt && valid) {
      token.bigint = withoutSeparators;
      token.literal = Number(withoutSeparators);
    } else {
      const value = Number(withoutSeparators);
      token.literal = Number.isNaN(value) ? 0 : value;
    }
    return token;
  }

  /**
   * Reads one escape sequence after a backslash at `this.pos`.
   * Returns the cooked text, or null when the escape is invalid.
   */
  private readEscape(): string | null {
    this.pos++; // the backslash
    const ch = this.char();
    if (ch === undefined) return null;
    this.pos++;
    switch (ch) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0":
        return isDigit(this.char()) ? null : "\0";
      case "x": {
        const hex = this.text.slice(this.pos, this.pos + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
        this.pos += 2;
        return String.fromCharCode(parseInt(hex, 16));
      }
      case "u": {
        if (this.char() === "{") {
          const close = this.text.indexOf("}", this.pos);
          const hex = close < 0 ? "" : this.text.slice(this.pos + 1, close);
          if (!/^[0-9a-fA-F]+$/.test(hex) || parseInt(hex, 16) > 0x10ffff) return null;
          this.pos = close + 1;
          return String.fromCodePoint(parseInt(hex, 16));
        }
        const hex = this.text.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        this.pos += 4;
        return String.fromCharCode(parseInt(hex, 16));
      }
      case "\r":
        if (this.char() === "\n") this.pos++;
        return ""; // line continuation
      case "\n":
      case "\u2028":
      case "\u2029":
        return "";
      default:
        if (isDigit(ch)) return null; // legacy octal escapes
        return ch;
    }
  }

  private scanString(start: number, newlineBefore: boolean): Token {
    const quote = this.text[start]!;
    this.pos = start + 1;
    let cooked = "";
    for (;;) {
      if (this.pos >= this.end || isLineTerminator(this.text.charCodeAt(this.pos))) {
        this.error("S002", start, start + 1);
        break;
      }
      const ch = this.text[this.pos]!;
      if (ch === quote) {
        this.pos++;
        break;
      }
      if (ch === "\\") {
        const escapeStart = this.pos;
        const value = this.readEscape();
        if (value === null) {
          this.error("S008", escapeStart, this.pos);
          cooked += this.text.slice(escapeStart + 1, this.pos);
        } else {
          cooked += value;
        }
        continue;
      }
      cooked += ch;
      this.pos++;
    }
    return { kind: "string", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore, literal: cooked };
  }

  /**
   * Scans a template chunk starting at `this.pos` (just after '`' or '}'),
   * up to and including the closing '`' (tail) or '${' (not tail).
   */
  private scanTemplateChunk(start: number, newlineBefore: boolean): Token {
    let cooked: string | null = "";
    for (;;) {
      if (this.pos >= this.end) {
        this.error("S003", start, start + 1);
        return { kind: "template", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore, cooked, tail: true };
      }
      const ch = this.text[this.pos]!;
      if (ch === "`") {
        this.pos++;
        return { kind: "template", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore, cooked, tail: true };
      }
      if (ch === "$" && this.char(1) === "{") {
        this.pos += 2;
        return { kind: "template", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore, cooked, tail: false };
      }
      if (ch === "\\") {
        const escapeStart = this.pos;
        const value = this.readEscape();
        if (value === null) {
          this.error("S008", escapeStart, this.pos);
          cooked = null;
        } else if (cooked !== null) {
          cooked += value;
        }
        continue;
      }
      if (ch === "\r") {
        // Template literals normalize CRLF and CR to LF.
        this.pos += this.char(1) === "\n" ? 2 : 1;
        if (cooked !== null) cooked += "\n";
        continue;
      }
      if (cooked !== null) cooked += ch;
      this.pos++;
    }
  }

  /** Re-reads the token at `token.start` (a `}`) as a template continuation. */
  rescanTemplate(token: Token): Token {
    this.pos = token.start + 1;
    return this.scanTemplateChunk(token.start, token.newlineBefore);
  }

  /** Re-reads the token at `token.start` (a `/` or `/=`) as a regular expression literal. */
  rescanRegex(token: Token): Token {
    const start = token.start;
    this.pos = start + 1;
    let inClass = false;
    for (;;) {
      if (this.pos >= this.end || isLineTerminator(this.text.charCodeAt(this.pos))) {
        this.error("S004", start, start + 1);
        return { kind: "regex", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore: token.newlineBefore, regex: { pattern: this.text.slice(start + 1, this.pos), flags: "" } };
      }
      const ch = this.text[this.pos]!;
      if (ch === "\\") {
        this.pos += 2;
        continue;
      }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
      this.pos++;
    }
    const pattern = this.text.slice(start + 1, this.pos);
    this.pos++; // closing '/'
    const flagsStart = this.pos;
    while (this.pos < this.end && isIdentifierPart(this.text[this.pos]!)) this.pos++;
    const flags = this.text.slice(flagsStart, this.pos);
    try {
      new RegExp(pattern, flags);
    } catch (error) {
      this.error("S007", start, this.pos, error instanceof Error ? error.message : String(error));
    }
    return { kind: "regex", value: this.text.slice(start, this.pos), start, end: this.pos, newlineBefore: token.newlineBefore, regex: { pattern, flags } };
  }
}
