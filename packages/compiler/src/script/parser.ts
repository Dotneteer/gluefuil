// Parser for pfui script (a JavaScript subset). Produces an ESTree-subset tree.
// Design notes: .ai/plan/poc-02-expression-parser.md
//
// - Expressions: precedence climbing. Arrow parameters and destructuring
//   assignment use a "cover grammar": parse as an expression, then convert to
//   a pattern when `=>` or `=` follows.
// - Statements: JavaScript's automatic semicolon insertion rules.
// - Errors: a syntax error throws an internal ParseError that statement lists
//   catch; the parser then skips to the next statement boundary.

import type { Diagnostic } from "../source/diagnostic";
import type * as AST from "./ast";
import { ScriptDiagnostics, type ScriptDiagnosticCode } from "./diagnostics";
import { Lexer, type Token } from "./lexer";

/** Where the parsed text sits in the .pfui file. */
export interface ScriptSourceOptions {
  /** File offset of the first character of the text (default 0). */
  offset?: number;
  /**
   * Per-character file offsets (length = text.length + 1), for text whose
   * characters don't map 1:1 to the file (entity-decoded text content).
   * Takes precedence over `offset`.
   */
  offsets?: readonly number[];
}

class ParseError extends Error {}

/** Words that can never be identifiers. */
const RESERVED = new Set([
  "break", "case", "catch", "const", "continue", "default", "delete", "do", "else", "finally", "for",
  "function", "if", "import", "in", "instanceof", "let", "new", "return", "switch", "throw", "try",
  "typeof", "var", "while", "true", "false", "null",
  // Reserved by JavaScript and not supported in pfui script:
  "class", "enum", "export", "extends", "super", "this", "void", "with", "debugger", "yield", "await",
]);

/** Reserved words that name a JavaScript feature pfui script doesn't support. */
const UNSUPPORTED_WORDS: Record<string, string> = {
  class: "'class'",
  enum: "'enum'",
  export: "'export'",
  extends: "'extends'",
  super: "'super'",
  this: "'this'",
  void: "The 'void' operator",
  with: "The 'with' statement",
  debugger: "The 'debugger' statement",
  yield: "'yield'",
};

const ASSIGNMENT_OPERATORS = new Set([
  "=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "|=", "^=", "&=", "&&=", "||=", "??=",
]);

const BINARY_PRECEDENCE: Record<string, number> = {
  "??": 1,
  "||": 2,
  "&&": 3,
  "|": 4,
  "^": 5,
  "&": 6,
  "==": 7, "!=": 7, "===": 7, "!==": 7,
  "<": 8, ">": 8, "<=": 8, ">=": 8, instanceof: 8, in: 8,
  "<<": 9, ">>": 9, ">>>": 9,
  "+": 10, "-": 10,
  "*": 11, "/": 11, "%": 11,
  "**": 12,
};

const UNARY_OPERATORS = new Set(["!", "~", "+", "-", "typeof", "delete"]);

export class ScriptParser {
  readonly diagnostics: Diagnostic[] = [];
  private readonly lexer: Lexer;
  private tok: Token;
  /** Raw end index of the previously consumed token. */
  private lastEnd: number;
  /** While true, `in` is not a binary operator (the init clause of `for`). */
  private noIn = false;
  /** Raw position of the first `{ a = 1 }` shorthand initializer not yet turned into a pattern; -1 if none. */
  private pendingCover = -1;
  /** Expressions written in parentheses: `(a) = 1` is fine, `({a}) = 1` is not. */
  private readonly parenthesized = new WeakSet<object>();

  constructor(
    private readonly text: string,
    start: number,
    end: number,
    private readonly source: ScriptSourceOptions = {},
  ) {
    this.lexer = new Lexer(text, start, end, (code, s, e, ...args) => this.report(code, s, e, ...args));
    this.lastEnd = start;
    this.tok = this.lexer.next();
  }

  // --- Positions and diagnostics ------------------------------------------------

  /** File offset of a raw index into `text`. */
  private at(index: number): number {
    const { offsets, offset = 0 } = this.source;
    return offsets ? offsets[index]! : offset + index;
  }

  private report(code: ScriptDiagnosticCode, start: number, end: number, ...args: unknown[]): void {
    const message = (ScriptDiagnostics[code] as (...a: unknown[]) => string)(...args);
    this.diagnostics.push({ code, severity: "error", message, start: this.at(start), end: this.at(end) });
  }

  private fail(code: ScriptDiagnosticCode, token: { start: number; end: number } = this.tok, ...args: unknown[]): never {
    this.report(code, token.start, token.end, ...args);
    throw new ParseError();
  }

  /** Reports at a node's span. Nodes already hold file offsets, so no mapping is applied. */
  private reportNode(code: ScriptDiagnosticCode, node: AST.Node, ...args: unknown[]): void {
    const message = (ScriptDiagnostics[code] as (...a: unknown[]) => string)(...args);
    this.diagnostics.push({ code, severity: "error", message, start: node.start, end: node.end });
  }

  private failNode(code: ScriptDiagnosticCode, node: AST.Node, ...args: unknown[]): never {
    this.reportNode(code, node, ...args);
    throw new ParseError();
  }

  private unexpected(): never {
    if (this.tok.kind === "eof") this.fail("S010");
    if (this.tok.kind === "name" && UNSUPPORTED_WORDS[this.tok.value]) {
      this.fail("S030", this.tok, UNSUPPORTED_WORDS[this.tok.value]);
    }
    this.fail("S011", this.tok, this.tok.value);
  }

  /** Creates a node spanning from the raw index `start` to the end of the last consumed token. */
  private finish<T extends AST.Node>(start: number, fields: Omit<T, "start" | "end">): T {
    return { ...fields, start: this.at(start), end: this.at(this.lastEnd) } as T;
  }

  // --- Token helpers -----------------------------------------------------------

  private next(): void {
    this.lastEnd = this.tok.end;
    this.tok = this.lexer.next();
  }

  private isPunct(value: string): boolean {
    return this.tok.kind === "punct" && this.tok.value === value;
  }

  private isName(value?: string): boolean {
    return this.tok.kind === "name" && (value === undefined || this.tok.value === value);
  }

  private eat(value: string): boolean {
    if (this.isPunct(value) || (this.tok.kind === "name" && this.tok.value === value)) {
      this.next();
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) this.fail("S012", this.tok, value);
  }

  private peekToken(): Token {
    return this.lexer.peek();
  }

  /** Statement terminator with JavaScript's automatic semicolon insertion. */
  private consumeSemicolon(): void {
    if (this.eat(";")) return;
    if (this.isPunct("}") || this.tok.kind === "eof" || this.tok.newlineBefore) return;
    this.fail("S012", { start: this.lastEnd, end: this.lastEnd }, ";");
  }

  private withIn<T>(parse: () => T): T {
    const saved = this.noIn;
    this.noIn = false;
    try {
      return parse();
    } finally {
      this.noIn = saved;
    }
  }

  get atEnd(): boolean {
    return this.tok.kind === "eof";
  }

  /** The current token's raw start (used by interpolation to find the closing '}'). */
  get current(): Token {
    return this.tok;
  }

  // --- Entry points ------------------------------------------------------------

  /** Parses a whole expression and requires the end of input. */
  parseOnlyExpression(): AST.Expression | null {
    try {
      const expression = this.parseExpression();
      if (this.tok.kind !== "eof") this.unexpected();
      return expression;
    } catch (error) {
      if (error instanceof ParseError) return null;
      throw error;
    }
  }

  /** Parses an expression and stops at the first token that can't continue it. */
  parseExpressionPrefix(): AST.Expression | null {
    try {
      return this.parseExpression();
    } catch (error) {
      if (error instanceof ParseError) return null;
      throw error;
    }
  }

  parseProgram(): AST.Program {
    const start = this.tok.start;
    const body = this.parseStatementList(false);
    return { type: "Program", body, start: this.at(start), end: this.at(this.tok.start) };
  }

  // --- Statements ----------------------------------------------------------------

  /** Statements until `}` (inBlock) or the end of input, recovering from errors. */
  private parseStatementList(inBlock: boolean): AST.Statement[] {
    const body: AST.Statement[] = [];
    while (this.tok.kind !== "eof" && !(inBlock && this.isPunct("}"))) {
      const before = this.tok.start;
      try {
        body.push(this.parseStatement());
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
        this.synchronize(before);
      }
    }
    return body;
  }

  /**
   * Skips to a likely statement boundary after a syntax error: a `;` or a line
   * break outside any brackets, or the `}` that closes the enclosing block.
   * Bracketed regions opened while skipping (`(…)`, `[…]`, `{…}`) are skipped
   * as a whole, so `class A { … }` or `label: for (;;) {}` is one error.
   */
  private synchronize(statementStart: number): void {
    // Open brackets while skipping; "${" marks a template substitution, whose
    // closing '}' must be rescanned as the template's continuation.
    const open: string[] = [];
    let first = this.tok.start === statementStart; // always consume at least one token
    while (this.tok.kind !== "eof") {
      if (open.length === 0 && !first) {
        if (this.eat(";")) return;
        if (this.isPunct("}") || this.tok.newlineBefore) return;
      }
      first = false;
      if (this.tok.kind === "template" && !this.tok.tail) {
        open.push("${");
      } else if (this.tok.kind === "punct") {
        const value = this.tok.value;
        if (value === "(" || value === "[" || value === "{") {
          open.push(value);
        } else if (value === "}" && open.at(-1) === "${") {
          open.pop();
          this.tok = this.lexer.rescanTemplate(this.tok);
          continue; // examine the template continuation token
        } else if (value === ")" || value === "]" || value === "}") {
          open.pop();
          if (open.length === 0 && value === "}") {
            this.next();
            this.eat(";");
            return;
          }
        }
      }
      this.next();
    }
  }

  private parseStatement(): AST.Statement {
    const start = this.tok.start;
    if (this.isPunct("{")) return this.parseBlock();
    if (this.isPunct(";")) {
      this.next();
      return this.finish<AST.EmptyStatement>(start, { type: "EmptyStatement" });
    }
    if (this.tok.kind === "name") {
      switch (this.tok.value) {
        case "var":
        case "let":
        case "const": {
          const declaration = this.parseVariableDeclaration();
          this.consumeSemicolon();
          declaration.end = this.at(this.lastEnd); // the statement span includes its ';'
          return declaration;
        }
        case "function":
          return this.parseFunction(start, false, true) as AST.FunctionDeclaration;
        case "if":
          return this.parseIf();
        case "while":
          return this.parseWhile();
        case "do":
          return this.parseDoWhile();
        case "for":
          return this.parseFor();
        case "return":
          return this.parseReturn();
        case "break":
        case "continue":
          return this.parseBreakContinue();
        case "throw":
          return this.parseThrow();
        case "try":
          return this.parseTry();
        case "switch":
          return this.parseSwitch();
        case "import":
          if (!this.peekIs("(") && !this.peekIs(".")) return this.parseImport();
          break;
        case "export":
          return this.parseExport();
        case "async": {
          const following = this.peekToken();
          if (following.kind === "name" && following.value === "function" && !following.newlineBefore) {
            this.report("S030", this.tok.start, this.tok.end, "'async'");
            this.next();
            return this.parseFunction(start, true, true) as AST.FunctionDeclaration;
          }
          break;
        }
        default:
          if (!RESERVED.has(this.tok.value) && this.peekIs(":")) {
            this.fail("S030", this.tok, "Labeled statements");
          }
      }
    }
    const expression = this.parseExpression();
    this.consumeSemicolon();
    return this.finish<AST.ExpressionStatement>(start, { type: "ExpressionStatement", expression });
  }

  private peekIs(punct: string): boolean {
    const next = this.peekToken();
    return next.kind === "punct" && next.value === punct;
  }

  private parseBlock(): AST.BlockStatement {
    const start = this.tok.start;
    this.expect("{");
    const body = this.withIn(() => this.parseStatementList(true));
    this.expect("}");
    return this.finish<AST.BlockStatement>(start, { type: "BlockStatement", body });
  }

  private parseVariableDeclaration(inFor = false): AST.VariableDeclaration {
    const start = this.tok.start;
    const kind = this.tok.value as AST.VariableDeclaration["kind"];
    this.next();
    const declarations: AST.VariableDeclarator[] = [];
    do {
      const declStart = this.tok.start;
      const id = this.parseBindingTarget();
      let init: AST.Expression | null = null;
      if (this.eat("=")) {
        init = this.parseAssign();
      } else if (!inFor || !(this.isName("of") || this.isName("in"))) {
        if (kind === "const" || id.type !== "Identifier") {
          this.report("S017", declStart, this.lastEnd);
        }
      }
      declarations.push(this.finish<AST.VariableDeclarator>(declStart, { type: "VariableDeclarator", id, init }));
    } while (this.eat(","));
    return this.finish<AST.VariableDeclaration>(start, { type: "VariableDeclaration", kind, declarations });
  }

  private parseIf(): AST.IfStatement {
    const start = this.tok.start;
    this.next();
    const test = this.parseParenthesizedExpression();
    const consequent = this.parseStatement();
    const alternate = this.eat("else") ? this.parseStatement() : null;
    return this.finish<AST.IfStatement>(start, { type: "IfStatement", test, consequent, alternate });
  }

  private parseParenthesizedExpression(): AST.Expression {
    this.expect("(");
    const expression = this.withIn(() => this.parseExpression());
    this.expect(")");
    return expression;
  }

  private parseWhile(): AST.WhileStatement {
    const start = this.tok.start;
    this.next();
    const test = this.parseParenthesizedExpression();
    const body = this.parseStatement();
    return this.finish<AST.WhileStatement>(start, { type: "WhileStatement", test, body });
  }

  private parseDoWhile(): AST.DoWhileStatement {
    const start = this.tok.start;
    this.next();
    const body = this.parseStatement();
    this.expect("while");
    const test = this.parseParenthesizedExpression();
    this.eat(";"); // the semicolon after do-while is always optional
    return this.finish<AST.DoWhileStatement>(start, { type: "DoWhileStatement", body, test });
  }

  private parseFor(): AST.ForStatement | AST.ForInStatement | AST.ForOfStatement {
    const start = this.tok.start;
    this.next();
    if (this.isName("await")) this.fail("S030", this.tok, "'for await'");
    this.expect("(");

    let init: AST.VariableDeclaration | AST.Expression | null = null;
    if (!this.isPunct(";")) {
      const saved = this.noIn;
      this.noIn = true;
      try {
        if (this.isName("var") || this.isName("let") || this.isName("const")) {
          init = this.parseVariableDeclaration(true);
        } else {
          init = this.parseExpression();
        }
      } finally {
        this.noIn = saved;
      }
    }

    if (init && (this.isName("of") || this.isName("in"))) {
      const isOf = this.tok.value === "of";
      let left: AST.VariableDeclaration | AST.Pattern;
      if (init.type === "VariableDeclaration") {
        if (init.declarations.length !== 1 || init.declarations[0]!.init) this.fail("S011", this.tok, this.tok.value);
        left = init;
      } else {
        left = this.toPattern(init, false);
      }
      this.next();
      const right = this.withIn(() => (isOf ? this.parseAssign() : this.parseExpression()));
      this.expect(")");
      const body = this.parseStatement();
      return isOf
        ? this.finish<AST.ForOfStatement>(start, { type: "ForOfStatement", left, right, body })
        : this.finish<AST.ForInStatement>(start, { type: "ForInStatement", left, right, body });
    }

    this.expect(";");
    const test = this.isPunct(";") ? null : this.withIn(() => this.parseExpression());
    this.expect(";");
    const update = this.isPunct(")") ? null : this.withIn(() => this.parseExpression());
    this.expect(")");
    const body = this.parseStatement();
    return this.finish<AST.ForStatement>(start, { type: "ForStatement", init, test, update, body });
  }

  private parseReturn(): AST.ReturnStatement {
    const start = this.tok.start;
    this.next();
    let argument: AST.Expression | null = null;
    if (!this.isPunct(";") && !this.isPunct("}") && this.tok.kind !== "eof" && !this.tok.newlineBefore) {
      argument = this.parseExpression();
    }
    this.consumeSemicolon();
    return this.finish<AST.ReturnStatement>(start, { type: "ReturnStatement", argument });
  }

  private parseBreakContinue(): AST.BreakStatement | AST.ContinueStatement {
    const start = this.tok.start;
    const isBreak = this.tok.value === "break";
    this.next();
    if (this.tok.kind === "name" && !this.tok.newlineBefore && !RESERVED.has(this.tok.value)) {
      this.fail("S030", this.tok, "Labeled statements");
    }
    this.consumeSemicolon();
    return isBreak
      ? this.finish<AST.BreakStatement>(start, { type: "BreakStatement" })
      : this.finish<AST.ContinueStatement>(start, { type: "ContinueStatement" });
  }

  private parseThrow(): AST.ThrowStatement {
    const start = this.tok.start;
    this.next();
    if (this.tok.newlineBefore) this.fail("S020", { start, end: start + 5 });
    const argument = this.parseExpression();
    this.consumeSemicolon();
    return this.finish<AST.ThrowStatement>(start, { type: "ThrowStatement", argument });
  }

  private parseTry(): AST.TryStatement {
    const start = this.tok.start;
    this.next();
    const block = this.parseBlock();
    let handler: AST.CatchClause | null = null;
    if (this.isName("catch")) {
      const catchStart = this.tok.start;
      this.next();
      let param: AST.Pattern | null = null;
      if (this.eat("(")) {
        param = this.parseBindingTarget();
        this.expect(")");
      }
      const body = this.parseBlock();
      handler = this.finish<AST.CatchClause>(catchStart, { type: "CatchClause", param, body });
    }
    const finalizer = this.eat("finally") ? this.parseBlock() : null;
    if (!handler && !finalizer) this.fail("S019");
    return this.finish<AST.TryStatement>(start, { type: "TryStatement", block, handler, finalizer });
  }

  private parseSwitch(): AST.SwitchStatement {
    const start = this.tok.start;
    this.next();
    const discriminant = this.parseParenthesizedExpression();
    this.expect("{");
    const cases: AST.SwitchCase[] = [];
    let sawDefault = false;
    while (!this.isPunct("}")) {
      const caseStart = this.tok.start;
      let test: AST.Expression | null = null;
      if (this.eat("case")) {
        test = this.withIn(() => this.parseExpression());
      } else if (this.isName("default")) {
        if (sawDefault) this.report("S018", this.tok.start, this.tok.end);
        sawDefault = true;
        this.next();
      } else {
        this.fail("S012", this.tok, "case");
      }
      this.expect(":");
      const consequent: AST.Statement[] = [];
      while (!this.isName("case") && !this.isName("default") && !this.isPunct("}") && this.tok.kind !== "eof") {
        const before = this.tok.start;
        try {
          consequent.push(this.parseStatement());
        } catch (error) {
          if (!(error instanceof ParseError)) throw error;
          this.synchronize(before);
        }
      }
      cases.push(this.finish<AST.SwitchCase>(caseStart, { type: "SwitchCase", test, consequent }));
    }
    this.expect("}");
    return this.finish<AST.SwitchStatement>(start, { type: "SwitchStatement", discriminant, cases });
  }

  private parseImport(): AST.ImportDeclaration {
    const start = this.tok.start;
    this.next();
    if (this.tok.kind === "string") this.fail("S030", this.tok, "Side-effect imports");
    if (this.isPunct("*")) this.fail("S030", this.tok, "Namespace imports");
    if (this.tok.kind === "name") this.fail("S030", this.tok, "Default imports");
    this.expect("{");
    const specifiers: AST.ImportSpecifier[] = [];
    while (!this.isPunct("}")) {
      const specStart = this.tok.start;
      const imported = this.parseIdentifierName();
      const local = this.eat("as") ? this.parseIdentifier() : imported;
      specifiers.push(this.finish<AST.ImportSpecifier>(specStart, { type: "ImportSpecifier", imported, local }));
      if (!this.isPunct("}")) this.expect(",");
    }
    this.expect("}");
    this.expect("from");
    // Read the token afresh: TypeScript keeps the narrowing from the checks above across next().
    const sourceToken: Token = this.tok;
    if (sourceToken.kind !== "string") this.fail("S012", sourceToken, "string literal");
    const source = this.parseLiteral();
    this.consumeSemicolon();
    return this.finish<AST.ImportDeclaration>(start, { type: "ImportDeclaration", specifiers, source });
  }

  /** `export function f() {}`; other export forms are not supported. */
  private parseExport(): AST.ExportNamedDeclaration {
    const start = this.tok.start;
    const exportToken = this.tok;
    this.next();
    if (!this.isName("function")) this.fail("S030", exportToken, "This form of 'export'");
    const declaration = this.parseFunction(this.tok.start, false, true) as AST.FunctionDeclaration;
    return this.finish<AST.ExportNamedDeclaration>(start, { type: "ExportNamedDeclaration", declaration });
  }

  // --- Functions -----------------------------------------------------------------

  private parseFunction(start: number, isAsync: boolean, isDeclaration: boolean): AST.FunctionDeclaration | AST.FunctionExpression {
    this.expect("function");
    if (this.isPunct("*")) this.fail("S030", this.tok, "Generator functions");
    let id: AST.Identifier | null = null;
    if (isDeclaration || this.tok.kind === "name") id = this.parseIdentifier();
    const params = this.parseParams();
    const body = this.parseFunctionBody();
    return isDeclaration
      ? this.finish<AST.FunctionDeclaration>(start, { type: "FunctionDeclaration", id: id!, params, body, async: isAsync })
      : this.finish<AST.FunctionExpression>(start, { type: "FunctionExpression", id, params, body, async: isAsync });
  }

  private parseParams(): AST.Pattern[] {
    this.expect("(");
    const params: AST.Pattern[] = [];
    while (!this.isPunct(")")) {
      if (this.isPunct("...")) {
        const restStart = this.tok.start;
        this.next();
        const argument = this.parseBindingTarget();
        params.push(this.finish<AST.RestElement>(restStart, { type: "RestElement", argument }));
        if (!this.isPunct(")")) this.fail("S016", this.tok);
        break;
      }
      params.push(this.parseBindingElement());
      if (!this.isPunct(")")) this.expect(",");
    }
    this.expect(")");
    return params;
  }

  private parseFunctionBody(): AST.BlockStatement {
    const savedCover = this.pendingCover;
    this.pendingCover = -1;
    try {
      return this.parseBlock();
    } finally {
      this.pendingCover = savedCover;
    }
  }

  // --- Binding patterns (declarations and parameters) -------------------------------

  private parseBindingTarget(): AST.Pattern {
    const start = this.tok.start;
    if (this.isPunct("[")) {
      this.next();
      const elements: (AST.Pattern | null)[] = [];
      while (!this.isPunct("]")) {
        if (this.isPunct(",")) {
          this.next();
          elements.push(null);
          continue;
        }
        if (this.isPunct("...")) {
          const restStart = this.tok.start;
          this.next();
          const argument = this.parseBindingTarget();
          elements.push(this.finish<AST.RestElement>(restStart, { type: "RestElement", argument }));
          if (!this.isPunct("]")) this.fail("S016", this.tok);
          break;
        }
        elements.push(this.parseBindingElement());
        if (!this.isPunct("]")) this.expect(",");
      }
      this.expect("]");
      return this.finish<AST.ArrayPattern>(start, { type: "ArrayPattern", elements });
    }
    if (this.isPunct("{")) {
      this.next();
      const properties: (AST.PatternProperty | AST.RestElement)[] = [];
      while (!this.isPunct("}")) {
        const propStart = this.tok.start;
        if (this.isPunct("...")) {
          this.next();
          const argument = this.parseIdentifier();
          properties.push(this.finish<AST.RestElement>(propStart, { type: "RestElement", argument }));
          if (!this.isPunct("}")) this.fail("S016", this.tok);
          break;
        }
        const { key, computed } = this.parsePropertyKey();
        let value: AST.Pattern;
        let shorthand = false;
        if (this.eat(":")) {
          value = this.parseBindingElement();
        } else {
          if (key.type !== "Identifier" || computed) this.fail("S012", this.tok, ":");
          this.checkBindingName(key as AST.Identifier);
          shorthand = true;
          value = key as AST.Identifier;
          if (this.isPunct("=")) {
            this.next();
            const right = this.parseAssign();
            value = this.finish<AST.AssignmentPattern>(propStart, { type: "AssignmentPattern", left: key as AST.Identifier, right });
          }
        }
        properties.push(this.finish<AST.PatternProperty>(propStart, { type: "Property", key, value, kind: "init", computed, shorthand, method: false }));
        if (!this.isPunct("}")) this.expect(",");
      }
      this.expect("}");
      return this.finish<AST.ObjectPattern>(start, { type: "ObjectPattern", properties });
    }
    return this.parseIdentifier();
  }

  /** A binding target with an optional `= default`. */
  private parseBindingElement(): AST.Pattern {
    const start = this.tok.start;
    const target = this.parseBindingTarget();
    if (!this.isPunct("=")) return target;
    this.next();
    const right = this.parseAssign();
    return this.finish<AST.AssignmentPattern>(start, { type: "AssignmentPattern", left: target, right });
  }

  private checkBindingName(identifier: AST.Identifier): void {
    if (RESERVED.has(identifier.name)) this.reportNode("S013", identifier);
  }

  // --- Expressions -----------------------------------------------------------------

  private parseExpression(): AST.Expression {
    const start = this.tok.start;
    const first = this.parseAssign();
    if (!this.isPunct(",")) return first;
    const expressions = [first];
    while (this.eat(",")) expressions.push(this.parseAssign());
    return this.finish<AST.SequenceExpression>(start, { type: "SequenceExpression", expressions });
  }

  /**
   * AssignmentExpression. With `allowCover`, an object/array literal containing
   * a `{ a = 1 }` shorthand initializer is passed up, because an enclosing
   * literal may still turn into a destructuring pattern.
   */
  private parseAssign(allowCover = false): AST.Expression {
    const outerPending = this.pendingCover;
    this.pendingCover = -1;
    const start = this.tok.start;

    const arrow = this.tryParseArrow();
    if (arrow) {
      this.pendingCover = outerPending;
      return arrow;
    }

    const left = this.parseConditional();

    if (this.tok.kind === "punct" && ASSIGNMENT_OPERATORS.has(this.tok.value)) {
      const operator = this.tok.value as AST.AssignmentOperator;
      let target: AST.Pattern | AST.MemberExpression;
      if (operator === "=" && (left.type === "ObjectExpression" || left.type === "ArrayExpression") && !this.parenthesized.has(left)) {
        target = this.toPattern(left, false);
        this.pendingCover = -1;
      } else if (left.type === "Identifier" || (left.type === "MemberExpression" && !left.optional)) {
        target = left;
      } else {
        this.fail("S014", { start, end: this.lastEnd });
      }
      this.next();
      const right = this.parseAssign();
      this.pendingCover = outerPending;
      return this.finish<AST.AssignmentExpression>(start, { type: "AssignmentExpression", operator, left: target, right });
    }

    if (this.pendingCover >= 0) {
      const isLiteral = (left.type === "ObjectExpression" || left.type === "ArrayExpression") && !this.parenthesized.has(left);
      if (!(allowCover && isLiteral)) this.fail("S011", { start: this.pendingCover, end: this.pendingCover + 1 }, "=");
      this.pendingCover = outerPending >= 0 ? outerPending : this.pendingCover;
    } else {
      this.pendingCover = outerPending;
    }
    return left;
  }

  /** Arrow functions that start with an identifier: `x => …`, `async x => …`. */
  private tryParseArrow(): AST.ArrowFunctionExpression | null {
    if (this.tok.kind !== "name") return null;
    const start = this.tok.start;
    const following = this.peekToken();

    if (following.kind === "punct" && following.value === "=>" && !RESERVED.has(this.tok.value)) {
      const param = this.parseIdentifier();
      return this.parseArrowRest(start, [param], false);
    }
    if (this.tok.value === "async" && following.kind === "name" && !following.newlineBefore && !RESERVED.has(following.value)) {
      // `async x => …`
      this.report("S030", this.tok.start, this.tok.end, "'async'");
      this.next();
      const param = this.parseIdentifier();
      if (!this.isPunct("=>")) this.fail("S012", this.tok, "=>");
      return this.parseArrowRest(start, [param], true);
    }
    return null;
  }

  private parseArrowRest(start: number, params: AST.Pattern[], isAsync: boolean): AST.ArrowFunctionExpression {
    // JavaScript forbids a line break before `=>`; XMLUI allows it (it ignores
    // line breaks), and real XMLUI code relies on it, so pfui allows it too.
    this.expect("=>");
    const savedCover = this.pendingCover;
    this.pendingCover = -1;
    try {
      if (this.isPunct("{")) {
        const body = this.parseFunctionBody();
        return this.finish<AST.ArrowFunctionExpression>(start, { type: "ArrowFunctionExpression", params, body, expression: false, async: isAsync });
      }
      const body = this.withIn(() => this.parseAssign());
      return this.finish<AST.ArrowFunctionExpression>(start, { type: "ArrowFunctionExpression", params, body, expression: true, async: isAsync });
    } finally {
      this.pendingCover = savedCover;
    }
  }

  private parseConditional(): AST.Expression {
    const start = this.tok.start;
    const test = this.parseBinary(0);
    if (!this.eat("?")) return test;
    const consequent = this.withIn(() => this.parseAssign());
    this.expect(":");
    const alternate = this.parseAssign();
    return this.finish<AST.ConditionalExpression>(start, { type: "ConditionalExpression", test, consequent, alternate });
  }

  private binaryPrecedence(): number {
    const { kind, value } = this.tok;
    if (kind === "punct" || (kind === "name" && (value === "instanceof" || (value === "in" && !this.noIn)))) {
      return BINARY_PRECEDENCE[value] ?? -1;
    }
    return -1;
  }

  private parseBinary(minPrecedence: number): AST.Expression {
    const start = this.tok.start;
    let left = this.parseUnary();
    for (;;) {
      const precedence = this.binaryPrecedence();
      if (precedence < 0 || precedence <= minPrecedence) {
        // `**` is right-associative: allow the same precedence on the right.
        if (!(precedence === 12 && minPrecedence === 12)) break;
      }
      const operator = this.tok.value;
      if (operator === "**" && left.type === "UnaryExpression" && !this.parenthesized.has(left)) {
        this.fail("S011", this.tok, "**");
      }
      this.next();
      const right = this.parseBinary(operator === "**" ? precedence - 1 : precedence);
      left =
        operator === "&&" || operator === "||" || operator === "??"
          ? this.finish<AST.LogicalExpression>(start, { type: "LogicalExpression", operator, left, right })
          : this.finish<AST.BinaryExpression>(start, { type: "BinaryExpression", operator: operator as AST.BinaryOperator, left, right });
    }
    return left;
  }

  private parseUnary(): AST.Expression {
    const start = this.tok.start;
    const { kind, value } = this.tok;
    if ((kind === "punct" || kind === "name") && UNARY_OPERATORS.has(value)) {
      this.next();
      const argument = this.parseUnary();
      return this.finish<AST.UnaryExpression>(start, { type: "UnaryExpression", operator: value as AST.UnaryOperator, prefix: true, argument });
    }
    if (kind === "punct" && (value === "++" || value === "--")) {
      this.next();
      const argument = this.parseUnary();
      this.checkUpdateTarget(argument);
      return this.finish<AST.UpdateExpression>(start, { type: "UpdateExpression", operator: value, prefix: true, argument });
    }
    if (kind === "name" && value === "await") {
      this.report("S030", this.tok.start, this.tok.end, "'await'");
      this.next();
      const argument = this.parseUnary();
      return this.finish<AST.AwaitExpression>(start, { type: "AwaitExpression", argument });
    }
    if (kind === "name" && value === "void") this.fail("S030", this.tok, UNSUPPORTED_WORDS.void);

    const expression = this.parseLeftHandSide();
    if (this.tok.kind === "punct" && (this.tok.value === "++" || this.tok.value === "--") && !this.tok.newlineBefore) {
      const operator = this.tok.value;
      this.checkUpdateTarget(expression);
      this.next();
      return this.finish<AST.UpdateExpression>(start, { type: "UpdateExpression", operator, prefix: false, argument: expression });
    }
    return expression;
  }

  private checkUpdateTarget(target: AST.Expression): void {
    if (target.type !== "Identifier" && !(target.type === "MemberExpression" && !target.optional)) {
      this.reportNode("S014", target);
    }
  }

  /** Member access, calls and `new`, including optional chains. */
  private parseLeftHandSide(): AST.Expression {
    const start = this.tok.start;
    let expression = this.isName("new") ? this.parseNew() : this.parsePrimary();
    if (expression.type === "ArrowFunctionExpression" && !this.parenthesized.has(expression)) return expression;

    let chained = false;
    for (;;) {
      if (this.isPunct(".")) {
        this.next();
        const property = this.parsePropertyName();
        expression = this.finish<AST.MemberExpression>(start, { type: "MemberExpression", object: expression, property, computed: false, optional: false });
      } else if (this.isPunct("?.")) {
        chained = true;
        this.next();
        if (this.isPunct("(")) {
          const args = this.parseArguments();
          expression = this.finish<AST.CallExpression>(start, { type: "CallExpression", callee: expression, arguments: args, optional: true });
        } else if (this.isPunct("[")) {
          this.next();
          const property = this.withIn(() => this.parseExpression());
          this.expect("]");
          expression = this.finish<AST.MemberExpression>(start, { type: "MemberExpression", object: expression, property, computed: true, optional: true });
        } else {
          const property = this.parsePropertyName();
          expression = this.finish<AST.MemberExpression>(start, { type: "MemberExpression", object: expression, property, computed: false, optional: true });
        }
      } else if (this.isPunct("[")) {
        this.next();
        const property = this.withIn(() => this.parseExpression());
        this.expect("]");
        expression = this.finish<AST.MemberExpression>(start, { type: "MemberExpression", object: expression, property, computed: true, optional: false });
      } else if (this.isPunct("(")) {
        const args = this.parseArguments();
        expression = this.finish<AST.CallExpression>(start, { type: "CallExpression", callee: expression, arguments: args, optional: false });
      } else if (this.tok.kind === "template") {
        this.fail("S030", this.tok, "Tagged templates");
      } else {
        break;
      }
    }
    if (chained) {
      expression = this.finish<AST.ChainExpression>(start, { type: "ChainExpression", expression: expression as AST.CallExpression | AST.MemberExpression });
    }
    return expression;
  }

  private parseNew(): AST.NewExpression {
    const start = this.tok.start;
    this.next(); // new
    if (this.isPunct(".")) this.fail("S030", this.tok, "'new.target'");
    const calleeStart = this.tok.start;
    let callee: AST.Expression = this.isName("new") ? this.parseNew() : this.parsePrimary();
    for (;;) {
      if (this.isPunct(".")) {
        this.next();
        const property = this.parsePropertyName();
        callee = this.finish<AST.MemberExpression>(calleeStart, { type: "MemberExpression", object: callee, property, computed: false, optional: false });
      } else if (this.isPunct("[")) {
        this.next();
        const property = this.withIn(() => this.parseExpression());
        this.expect("]");
        callee = this.finish<AST.MemberExpression>(calleeStart, { type: "MemberExpression", object: callee, property, computed: true, optional: false });
      } else if (this.isPunct("?.")) {
        this.fail("S011", this.tok, "?.");
      } else {
        break;
      }
    }
    const args = this.isPunct("(") ? this.parseArguments() : [];
    return this.finish<AST.NewExpression>(start, { type: "NewExpression", callee, arguments: args });
  }

  private parseArguments(): (AST.Expression | AST.SpreadElement)[] {
    this.expect("(");
    const args: (AST.Expression | AST.SpreadElement)[] = [];
    this.withIn(() => {
      while (!this.isPunct(")")) {
        args.push(this.parseSpreadOrAssign());
        if (!this.isPunct(")")) this.expect(",");
      }
    });
    this.expect(")");
    return args;
  }

  private parseSpreadOrAssign(allowCover = false): AST.Expression | AST.SpreadElement {
    if (!this.isPunct("...")) return this.parseAssign(allowCover);
    const start = this.tok.start;
    this.next();
    const argument = this.parseAssign(allowCover);
    return this.finish<AST.SpreadElement>(start, { type: "SpreadElement", argument });
  }

  private parsePrimary(): AST.Expression {
    const tok = this.tok;
    const start = tok.start;
    switch (tok.kind) {
      case "number":
      case "string":
        return this.parseLiteral();
      case "template":
        return this.parseTemplate();
      case "privateName":
        this.fail("S030", tok, "Private names");
      case "punct":
        switch (tok.value) {
          case "(":
            return this.parseParenthesizedOrArrow();
          case "[":
            return this.parseArrayLiteral();
          case "{":
            return this.parseObjectLiteral();
          case "/":
          case "/=":
            this.tok = this.lexer.rescanRegex(tok);
            return this.parseLiteral();
        }
        this.fail("S010");
      case "name":
        switch (tok.value) {
          case "true":
          case "false":
          case "null":
            return this.parseLiteral();
          case "function":
            return this.parseFunction(start, false, false) as AST.FunctionExpression;
          case "async": {
            const following = this.peekToken();
            if (following.kind === "name" && following.value === "function" && !following.newlineBefore) {
              this.report("S030", tok.start, tok.end, "'async'");
              this.next();
              return this.parseFunction(start, true, false) as AST.FunctionExpression;
            }
            if (following.kind === "punct" && following.value === "(" && !following.newlineBefore) {
              return this.parseAsyncCallOrArrow();
            }
            break;
          }
          case "import":
            this.fail("S030", tok, "Dynamic 'import()'");
        }
        if (RESERVED.has(tok.value)) this.unexpected();
        return this.parseIdentifier();
      case "eof":
      default:
        this.fail("S010");
    }
  }

  /** `async(...)`: a call to a function named async, or an async arrow function. */
  private parseAsyncCallOrArrow(): AST.Expression {
    const start = this.tok.start;
    const asyncToken = this.tok;
    const callee = this.parseIdentifier();
    const args = this.parseArgumentsWithCover();
    if (this.isPunct("=>")) {
      this.report("S030", asyncToken.start, asyncToken.end, "'async'");
      const params = args.map((arg) => this.toPattern(arg, true));
      this.pendingCover = -1;
      return this.parseArrowRest(start, params, true);
    }
    return this.finish<AST.CallExpression>(start, { type: "CallExpression", callee, arguments: args, optional: false });
  }

  private parseArgumentsWithCover(): (AST.Expression | AST.SpreadElement)[] {
    this.expect("(");
    const args: (AST.Expression | AST.SpreadElement)[] = [];
    this.withIn(() => {
      while (!this.isPunct(")")) {
        args.push(this.parseSpreadOrAssign(true));
        if (!this.isPunct(")")) this.expect(",");
      }
    });
    this.expect(")");
    return args;
  }

  /** `( … )`: a parenthesized expression, or the parameter list of an arrow function. */
  private parseParenthesizedOrArrow(): AST.Expression {
    const start = this.tok.start;
    this.next(); // (
    const items: (AST.Expression | AST.SpreadElement)[] = [];
    let trailingComma = false;
    let restIndex = -1;
    let restToken: Token | undefined;
    this.withIn(() => {
      while (!this.isPunct(")")) {
        if (this.isPunct("...")) {
          restIndex = items.length;
          restToken = this.tok;
        }
        items.push(this.parseSpreadOrAssign(true));
        if (this.isPunct(")")) break;
        this.expect(",");
        if (this.isPunct(")")) trailingComma = true;
      }
    });
    this.expect(")");

    if (this.isPunct("=>")) {
      if (restIndex >= 0 && restIndex !== items.length - 1) this.fail("S016", restToken);
      const params = items.map((item) => this.toPattern(item, true));
      this.pendingCover = -1;
      return this.parseArrowRest(start, params, false);
    }

    if (items.length === 0 || trailingComma || restIndex >= 0) this.fail("S012", this.tok, "=>");
    if (this.pendingCover >= 0) this.fail("S011", { start: this.pendingCover, end: this.pendingCover + 1 }, "=");
    const expression =
      items.length === 1
        ? (items[0] as AST.Expression)
        : this.finish<AST.SequenceExpression>(start + 1, { type: "SequenceExpression", expressions: items as AST.Expression[] });
    this.parenthesized.add(expression);
    return expression;
  }

  private parseArrayLiteral(): AST.ArrayExpression {
    const start = this.tok.start;
    this.next(); // [
    const elements: (AST.Expression | AST.SpreadElement | null)[] = [];
    this.withIn(() => {
      while (!this.isPunct("]")) {
        if (this.isPunct(",")) {
          this.next();
          elements.push(null);
          continue;
        }
        elements.push(this.parseSpreadOrAssign(true));
        if (!this.isPunct("]")) this.expect(",");
      }
    });
    this.expect("]");
    return this.finish<AST.ArrayExpression>(start, { type: "ArrayExpression", elements });
  }

  private parseObjectLiteral(): AST.ObjectExpression {
    const start = this.tok.start;
    this.next(); // {
    const properties: (AST.Property | AST.SpreadElement)[] = [];
    this.withIn(() => {
      while (!this.isPunct("}")) {
        properties.push(this.parseObjectMember());
        if (!this.isPunct("}")) this.expect(",");
      }
    });
    this.expect("}");
    return this.finish<AST.ObjectExpression>(start, { type: "ObjectExpression", properties });
  }

  private parseObjectMember(): AST.Property | AST.SpreadElement {
    const start = this.tok.start;
    if (this.isPunct("...")) {
      this.next();
      const argument = this.parseAssign(true);
      return this.finish<AST.SpreadElement>(start, { type: "SpreadElement", argument });
    }

    // get/set accessors and async methods: `get name() {}`, `async name() {}`
    if (this.tok.kind === "name" && (this.tok.value === "get" || this.tok.value === "set" || this.tok.value === "async")) {
      const following = this.peekToken();
      const startsKey =
        following.kind === "name" || following.kind === "string" || following.kind === "number" ||
        (following.kind === "punct" && following.value === "[");
      if (startsKey) {
        const modifier = this.tok;
        this.next();
        const { key, computed } = this.parsePropertyKey();
        const fnStart = this.tok.start;
        const params = this.parseParams();
        const body = this.parseFunctionBody();
        const value = this.finish<AST.FunctionExpression>(fnStart, { type: "FunctionExpression", id: null, params, body, async: modifier.value === "async" });
        if (modifier.value === "async") {
          this.report("S030", modifier.start, modifier.end, "'async'");
          return this.finish<AST.Property>(start, { type: "Property", key, value, kind: "init", computed, shorthand: false, method: true });
        }
        const kind = modifier.value as "get" | "set";
        if ((kind === "get" && params.length !== 0) || (kind === "set" && params.length !== 1)) {
          this.report("S021", modifier.start, modifier.end, kind);
        }
        return this.finish<AST.Property>(start, { type: "Property", key, value, kind, computed, shorthand: false, method: false });
      }
    }

    const keyToken = this.tok;
    const { key, computed } = this.parsePropertyKey();

    if (this.isPunct("(")) {
      // Method shorthand: `{ f() { … } }`
      const fnStart = this.tok.start;
      const params = this.parseParams();
      const body = this.parseFunctionBody();
      const value = this.finish<AST.FunctionExpression>(fnStart, { type: "FunctionExpression", id: null, params, body, async: false });
      return this.finish<AST.Property>(start, { type: "Property", key, value, kind: "init", computed, shorthand: false, method: true });
    }

    if (this.eat(":")) {
      const value = this.parseAssign(true);
      return this.finish<AST.Property>(start, { type: "Property", key, value, kind: "init", computed, shorthand: false, method: false });
    }

    // Shorthand `{ a }`, or the cover form `{ a = 1 }` (valid only as a pattern).
    if (computed || key.type !== "Identifier" || keyToken.kind !== "name" || RESERVED.has(keyToken.value)) {
      this.fail("S012", this.tok, ":");
    }
    if (this.isPunct("=")) {
      if (this.pendingCover < 0) this.pendingCover = this.tok.start;
      this.next();
      const right = this.parseAssign();
      const value = this.finish<AST.AssignmentPattern>(start, { type: "AssignmentPattern", left: key, right });
      return this.finish<AST.Property>(start, { type: "Property", key, value: value as unknown as AST.Expression, kind: "init", computed: false, shorthand: true, method: false });
    }
    return this.finish<AST.Property>(start, { type: "Property", key, value: key, kind: "init", computed: false, shorthand: true, method: false });
  }

  /** An object key: identifier name (reserved words allowed), string, number, or `[computed]`. */
  private parsePropertyKey(): { key: AST.Expression; computed: boolean } {
    if (this.isPunct("[")) {
      this.next();
      const key = this.withIn(() => this.parseAssign());
      this.expect("]");
      return { key, computed: true };
    }
    if (this.tok.kind === "string" || this.tok.kind === "number") return { key: this.parseLiteral(), computed: false };
    return { key: this.parseIdentifierName(), computed: false };
  }

  /** The name after `.`: any identifier name, including reserved words. */
  private parsePropertyName(): AST.Identifier {
    if (this.tok.kind === "privateName") this.fail("S030", this.tok, "Private names");
    return this.parseIdentifierName();
  }

  private parseIdentifierName(): AST.Identifier {
    if (this.tok.kind !== "name") this.fail("S013");
    const start = this.tok.start;
    const name = this.tok.value;
    this.next();
    return this.finish<AST.Identifier>(start, { type: "Identifier", name });
  }

  private parseIdentifier(): AST.Identifier {
    if (this.tok.kind !== "name") this.fail("S013");
    if (RESERVED.has(this.tok.value)) {
      if (UNSUPPORTED_WORDS[this.tok.value]) this.fail("S030", this.tok, UNSUPPORTED_WORDS[this.tok.value]);
      this.fail("S013");
    }
    return this.parseIdentifierName();
  }

  private parseLiteral(): AST.Literal {
    const tok = this.tok;
    const start = tok.start;
    this.next();
    const raw = tok.value;
    switch (tok.kind) {
      case "number":
        if (tok.bigint !== undefined) {
          return this.finish<AST.Literal>(start, { type: "Literal", value: BigInt(tok.bigint), raw, bigint: tok.bigint });
        }
        return this.finish<AST.Literal>(start, { type: "Literal", value: tok.literal as number, raw });
      case "string":
        return this.finish<AST.Literal>(start, { type: "Literal", value: tok.literal as string, raw });
      case "regex":
        return this.finish<AST.Literal>(start, { type: "Literal", value: { regex: true }, raw, regex: tok.regex! });
      default:
        return this.finish<AST.Literal>(start, {
          type: "Literal",
          value: raw === "true" ? true : raw === "false" ? false : null,
          raw,
        });
    }
  }

  private parseTemplate(): AST.TemplateLiteral {
    const start = this.tok.start;
    const quasis: AST.TemplateElement[] = [];
    const expressions: AST.Expression[] = [];
    for (;;) {
      const chunk = this.tok;
      // The chunk's text without its delimiters: '`' or '}' before, '`' or '${' after.
      const rawStart = chunk.start + 1;
      const rawEnd = chunk.end - (chunk.tail ? 1 : 2);
      const raw = this.text.slice(rawStart, Math.max(rawStart, rawEnd)).replace(/\r\n?/g, "\n");
      quasis.push({ type: "TemplateElement", value: { raw, cooked: chunk.cooked ?? null }, tail: !!chunk.tail, start: this.at(rawStart), end: this.at(Math.max(rawStart, rawEnd)) });
      if (chunk.tail) {
        this.next();
        break;
      }
      this.next();
      expressions.push(this.withIn(() => this.parseExpression()));
      if (!this.isPunct("}")) this.fail("S012", this.tok, "}");
      this.tok = this.lexer.rescanTemplate(this.tok);
    }
    return this.finish<AST.TemplateLiteral>(start, { type: "TemplateLiteral", quasis, expressions });
  }

  // --- Cover grammar: expression -> pattern -----------------------------------------

  /** Converts an expression parsed under the cover grammar into a pattern. */
  private toPattern(node: AST.Expression | AST.SpreadElement, binding: boolean): AST.Pattern {
    const fail = (code: ScriptDiagnosticCode = "S015"): never => this.failNode(code, node);
    switch (node.type) {
      case "Identifier":
        if (RESERVED.has(node.name)) fail("S013");
        return node;
      case "MemberExpression":
        if (binding || node.optional) fail("S014");
        return node;
      case "AssignmentPattern" as string: // a cover initializer, `{ a = 1 }`
        return node as unknown as AST.AssignmentPattern;
      case "AssignmentExpression":
        if (node.operator !== "=") fail("S015");
        return { type: "AssignmentPattern", left: this.toPattern(node.left as AST.Expression, binding), right: node.right, start: node.start, end: node.end };
      case "ObjectExpression": {
        if (this.parenthesized.has(node)) fail();
        const properties: (AST.PatternProperty | AST.RestElement)[] = node.properties.map((property, index) => {
          if (property.type === "SpreadElement") {
            if (index !== node.properties.length - 1) fail("S016");
            if (property.argument.type !== "Identifier" && !(property.argument.type === "MemberExpression" && !binding)) fail();
            return { type: "RestElement", argument: this.toPattern(property.argument, binding), start: property.start, end: property.end };
          }
          if (property.kind !== "init" || property.method) fail();
          return { ...property, value: this.toPattern(property.value, binding), method: false, kind: "init" } as AST.PatternProperty;
        });
        return { type: "ObjectPattern", properties, start: node.start, end: node.end };
      }
      case "ArrayExpression": {
        if (this.parenthesized.has(node)) fail();
        const elements = node.elements.map((element, index) => {
          if (element === null) return null;
          if (element.type === "SpreadElement") {
            if (index !== node.elements.length - 1) fail("S016");
            return { type: "RestElement", argument: this.toPattern(element.argument, binding), start: element.start, end: element.end } as AST.RestElement;
          }
          return this.toPattern(element, binding);
        });
        return { type: "ArrayPattern", elements, start: node.start, end: node.end };
      }
      case "SpreadElement":
        return { type: "RestElement", argument: this.toPattern(node.argument, binding), start: node.start, end: node.end };
      default:
        return fail(binding ? "S015" : "S014");
    }
  }
}
