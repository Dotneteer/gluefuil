// Compiles pfui script syntax trees to JavaScript source, resolving every name
// at compile time (the compiler is the sandbox). One pass: resolution, sandbox
// checks, dependency collection and printing.
//
// Generated code refers only to locals declared in the source and to three
// reserved names: `$$s` (the scope object), `$$g` (sandbox globals) and `$$r`
// (runtime helpers). Design: .ai/plan/poc-03-codegen.md

import type * as A from "../script/ast";
import type { Diagnostic } from "../source/diagnostic";
import { CodegenDiagnostics, type CodegenDiagnosticCode } from "./diagnostics";
import {
  ALLOWED_GLOBALS,
  BANNED_GLOBALS,
  BANNED_MEMBERS,
  CONSTRUCTIBLE,
  LITERAL_GLOBALS,
  RESERVED_PREFIX,
  RESTRICTED_GLOBAL_MEMBERS,
} from "./names";

/** Names visible to a binding besides its locals and the allowed globals. */
export type ScopeNames = ReadonlySet<string> | ((name: string) => boolean);

// Operator precedence of the emitted JavaScript (higher binds tighter).
const P = {
  sequence: 1,
  assign: 2, // also arrow functions and spread operands
  conditional: 3,
  nullish: 4,
  or: 5,
  and: 6,
  bitOr: 7,
  bitXor: 8,
  bitAnd: 9,
  equality: 10,
  relational: 11,
  shift: 12,
  additive: 13,
  multiplicative: 14,
  exponent: 15,
  unary: 16,
  postfix: 17,
  call: 18, // member access, calls, new
  primary: 19,
} as const;

const BINARY_PRECEDENCE: Record<A.BinaryOperator, number> = {
  "==": P.equality,
  "!=": P.equality,
  "===": P.equality,
  "!==": P.equality,
  "<": P.relational,
  "<=": P.relational,
  ">": P.relational,
  ">=": P.relational,
  in: P.relational,
  instanceof: P.relational,
  "<<": P.shift,
  ">>": P.shift,
  ">>>": P.shift,
  "+": P.additive,
  "-": P.additive,
  "*": P.multiplicative,
  "/": P.multiplicative,
  "%": P.multiplicative,
  "**": P.exponent,
  "|": P.bitOr,
  "^": P.bitXor,
  "&": P.bitAnd,
};

const LOGICAL_PRECEDENCE: Record<A.LogicalOperator, number> = { "??": P.nullish, "||": P.or, "&&": P.and };

type Resolution = "local" | "scope" | "global" | "unresolved";

interface LexicalScope {
  names: Set<string>;
  parent: LexicalScope | undefined;
}

/** Emitted text with its precedence. */
interface Emitted {
  text: string;
  prec: number;
}

export class Emitter {
  readonly diagnostics: Diagnostic[] = [];
  readonly dependencies = new Set<string>();
  private lexical: LexicalScope | undefined;
  private readonly isScopeName: (name: string) => boolean;

  constructor(scope: ScopeNames) {
    this.isScopeName = typeof scope === "function" ? scope : (name) => scope.has(name);
  }

  // --- Diagnostics and resolution --------------------------------------------------

  private report<C extends CodegenDiagnosticCode>(
    node: { start: number; end: number },
    code: C,
    ...args: Parameters<(typeof CodegenDiagnostics)[C]>
  ): void {
    const message = (CodegenDiagnostics[code] as (...a: unknown[]) => string)(...args);
    this.diagnostics.push({ code, severity: "error", message, start: node.start, end: node.end });
  }

  private resolve(name: string): Resolution {
    for (let scope = this.lexical; scope; scope = scope.parent) {
      if (scope.names.has(name)) return "local";
    }
    if (name.startsWith(RESERVED_PREFIX)) return "unresolved";
    if (this.isScopeName(name)) return "scope";
    if (ALLOWED_GLOBALS.has(name)) return "global";
    return "unresolved";
  }

  /** Reports why a name could not be resolved. */
  private reportUnresolved(id: A.Identifier): void {
    if (id.name.startsWith(RESERVED_PREFIX)) this.report(id, "C005", id.name);
    else if (BANNED_GLOBALS.has(id.name)) this.report(id, "C002", id.name, BANNED_GLOBALS.get(id.name));
    else this.report(id, "C001", id.name);
  }

  private withScope<T>(names: Iterable<string>, body: () => T): T {
    this.lexical = { names: new Set(names), parent: this.lexical };
    try {
      return body();
    } finally {
      this.lexical = this.lexical.parent;
    }
  }

  /** Declares a name in the innermost lexical scope. */
  private declare(id: A.Identifier): void {
    if (id.name.startsWith(RESERVED_PREFIX)) this.report(id, "C005", id.name);
    this.lexical?.names.add(id.name);
  }

  // --- Expressions -------------------------------------------------------------------

  /** Emits an expression; parenthesized when it binds looser than `minPrec`. */
  expression(node: A.Expression, minPrec: number = P.sequence): string {
    const { text, prec } = this.emit(node);
    return prec < minPrec ? `(${text})` : text;
  }

  private emit(node: A.Expression): Emitted {
    switch (node.type) {
      case "Identifier":
        return { text: this.reference(node), prec: P.primary };
      case "Literal":
        return { text: this.literal(node), prec: P.primary };
      case "TemplateLiteral":
        return { text: this.template(node), prec: P.primary };
      case "ArrayExpression":
        return { text: this.array(node), prec: P.primary };
      case "ObjectExpression":
        return { text: this.object(node), prec: P.primary };
      case "FunctionExpression":
        return { text: this.functionExpression(node), prec: P.primary };
      case "ArrowFunctionExpression":
        return { text: this.arrow(node), prec: P.assign };
      case "UnaryExpression":
        return { text: this.unary(node), prec: P.unary };
      case "UpdateExpression": {
        const target = this.target(node.argument as A.Pattern | A.MemberExpression, node);
        return node.prefix
          ? { text: `${node.operator}${target}`, prec: P.unary }
          : { text: `${target}${node.operator}`, prec: P.postfix };
      }
      case "BinaryExpression":
        return this.binary(node);
      case "LogicalExpression":
        return this.logical(node);
      case "AssignmentExpression": {
        const left = this.target(node.left, node);
        return { text: `${left} ${node.operator} ${this.expression(node.right, P.assign)}`, prec: P.assign };
      }
      case "ConditionalExpression":
        return {
          text: `${this.expression(node.test, P.nullish)} ? ${this.expression(node.consequent, P.assign)} : ${this.expression(node.alternate, P.assign)}`,
          prec: P.conditional,
        };
      case "CallExpression":
        return { text: this.call(node), prec: P.call };
      case "NewExpression":
        return { text: this.newExpression(node), prec: P.call };
      case "MemberExpression":
        return { text: this.member(node, "read"), prec: P.call };
      case "ChainExpression":
        // Every link is optional anyway; the wrapper adds nothing.
        return this.emit(node.expression);
      case "SequenceExpression":
        return { text: node.expressions.map((e) => this.expression(e, P.assign)).join(", "), prec: P.sequence };
      case "AwaitExpression":
        this.report(node, "C009", "await");
        return { text: "undefined", prec: P.primary };
    }
  }

  /** A name read. */
  private reference(id: A.Identifier): string {
    switch (this.resolve(id.name)) {
      case "local":
        return id.name;
      case "scope":
        this.dependencies.add(id.name);
        return `$$s.${id.name}`;
      case "global":
        return LITERAL_GLOBALS.get(id.name) ?? `$$g.${id.name}`;
      case "unresolved":
        this.reportUnresolved(id);
        return "undefined";
    }
  }

  private literal(node: A.Literal): string {
    if (node.regex) return `/${node.regex.pattern}/${node.regex.flags}`;
    return node.raw;
  }

  private template(node: A.TemplateLiteral): string {
    let text = "`";
    node.quasis.forEach((quasi, i) => {
      text += quasi.value.raw;
      const expression = node.expressions[i];
      if (expression) text += "${" + this.expression(expression) + "}";
    });
    return text + "`";
  }

  private array(node: A.ArrayExpression): string {
    const items = node.elements.map((e) => (e === null ? "" : this.spreadable(e)));
    // A trailing hole needs an extra comma: [a, ,] has length 2.
    if (node.elements.length > 0 && node.elements[node.elements.length - 1] === null) items.push("");
    return `[${items.join(", ")}]`;
  }

  private spreadable(node: A.Expression | A.SpreadElement): string {
    return node.type === "SpreadElement" ? `...${this.expression(node.argument, P.assign)}` : this.expression(node, P.assign);
  }

  private object(node: A.ObjectExpression): string {
    if (node.properties.length === 0) return "{}";
    const parts = node.properties.map((p) => {
      if (p.type === "SpreadElement") return `...${this.expression(p.argument, P.assign)}`;
      const key = this.propertyKey(p, true);
      if (p.kind === "get" || p.kind === "set" || p.method) {
        const fn = p.value as A.FunctionExpression;
        if (fn.async) this.report(fn, "C009", "async");
        const prefix = p.kind === "init" ? "" : `${p.kind} `;
        return `${prefix}${key}${this.functionTail(fn.params, fn.body)}`;
      }
      return `${key}: ${this.expression(p.value, P.assign)}`;
    });
    return `{ ${parts.join(", ")} }`;
  }

  /**
   * Emits a property key. In object literals only `__proto__` is dangerous (it
   * sets the prototype); in patterns every banned member name is.
   */
  private propertyKey(p: { key: A.Expression; computed: boolean }, inLiteral: boolean): string {
    if (p.computed) {
      return inLiteral ? `[${this.expression(p.key, P.assign)}]` : `[${this.guardedKey(p.key)}]`;
    }
    const name = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : undefined;
    if (name !== undefined && (inLiteral ? name === "__proto__" : BANNED_MEMBERS.has(name))) {
      this.report(p.key, "C003", name);
    }
    return p.key.type === "Identifier" ? p.key.name : this.expression(p.key);
  }

  /**
   * A computed member key: string and number literals are checked now; any
   * other key goes through the runtime guard `$$r.key()`.
   */
  private guardedKey(key: A.Expression): string {
    if (key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) {
      if (typeof key.value === "string" && BANNED_MEMBERS.has(key.value)) this.report(key, "C003", key.value);
      return key.raw;
    }
    return `$$r.key(${this.expression(key)})`;
  }

  // --- Functions -------------------------------------------------------------------

  private functionExpression(node: A.FunctionExpression): string {
    if (node.async) this.report(node, "C009", "async");
    // A named function expression sees its own name.
    const names = node.id ? [node.id.name] : [];
    return this.withScope(names, () => {
      if (node.id) this.declare(node.id);
      return `function${node.id ? ` ${node.id.name}` : ""}${this.functionTail(node.params, node.body)}`;
    });
  }

  private arrow(node: A.ArrowFunctionExpression): string {
    if (node.async) this.report(node, "C009", "async");
    return this.withScope([], () => {
      const params = this.params(node.params);
      if (node.body.type === "BlockStatement") return `${params} => ${this.functionBody(node.body)}`;
      let body = this.expression(node.body, P.assign);
      if (body.startsWith("{")) body = `(${body})`;
      return `${params} => ${body}`;
    });
  }

  /** `(params) { body }`, in a new function scope. */
  private functionTail(params: A.Pattern[], body: A.BlockStatement): string {
    return this.withScope([], () => `${this.params(params)} ${this.functionBody(body)}`);
  }

  private params(params: A.Pattern[]): string {
    // Declare every parameter first: defaults may refer to earlier parameters.
    for (const p of params) for (const id of boundIdentifiers(p)) this.declare(id);
    return `(${params.map((p) => this.pattern(p, "declare")).join(", ")})`;
  }

  /** A function body shares the parameters' scope for hoisting purposes. */
  private functionBody(body: A.BlockStatement): string {
    this.hoist(body.body);
    return this.blockContents(body.body);
  }

  // --- Operators -------------------------------------------------------------------

  private unary(node: A.UnaryExpression): string {
    if (node.operator === "delete") {
      const argument = node.argument;
      if (argument.type === "Identifier") {
        this.report(argument, "C008", "delete of a variable");
        return "delete undefined";
      }
      const member = argument.type === "ChainExpression" ? argument.expression : argument;
      if (member.type === "MemberExpression") {
        this.checkWritable(member, node);
        return `delete ${this.member(member, "delete")}`;
      }
      return `delete ${this.expression(argument, P.unary)}`;
    }
    const argument = this.expression(node.argument, P.unary);
    if (node.operator === "typeof") return `typeof ${argument}`;
    // Keep `- -a` and `+ +a` (and `- --a`) apart.
    const space = (node.operator === "-" || node.operator === "+") && /^[-+]/.test(argument) ? " " : "";
    return `${node.operator}${space}${argument}`;
  }

  private binary(node: A.BinaryExpression): Emitted {
    const prec = BINARY_PRECEDENCE[node.operator];
    if (node.operator === "**") {
      // Right-associative; a unary operand on the left must be parenthesized.
      return {
        text: `${this.expression(node.left, P.postfix)} ** ${this.expression(node.right, prec)}`,
        prec,
      };
    }
    return { text: `${this.expression(node.left, prec)} ${node.operator} ${this.expression(node.right, prec + 1)}`, prec };
  }

  private logical(node: A.LogicalExpression): Emitted {
    const prec = LOGICAL_PRECEDENCE[node.operator];
    // JavaScript forbids mixing `??` with `||`/`&&` without parentheses.
    const operand = (child: A.Expression, minPrec: number) => {
      const { text, prec } = this.emit(child);
      const mixes = child.type === "LogicalExpression" && (child.operator === "??") !== (node.operator === "??");
      return mixes || prec < minPrec ? `(${text})` : text;
    };
    return { text: `${operand(node.left, prec)} ${node.operator} ${operand(node.right, prec + 1)}`, prec };
  }

  // --- Member access and calls ---------------------------------------------------------

  /**
   * Member access:
   *   - `read`:   `a?.b` (optional chaining by default);
   *   - `write`:  `$$r.obj(a).b`, an assignment target: plain last link, and
   *               the object must not be a function (see below);
   *   - `delete`: `$$r.obj(a)?.b`.
   * Writing to function objects is refused at runtime: script can reach shared
   * built-in functions (`({}).hasOwnProperty`), and setting `.call` on one
   * would hijack host code that calls it with raw platform objects.
   */
  private member(node: A.MemberExpression, mode: "read" | "write" | "delete"): string {
    this.checkRestrictedGlobalMember(node);
    const object =
      mode === "read" ? this.expression(node.object, P.call) : `$$r.obj(${this.expression(node.object, P.assign)})`;
    const link = mode !== "write" ? "?." : node.computed ? "" : ".";
    if (node.computed) return `${object}${link}[${this.guardedKey(node.property)}]`;
    const name = (node.property as A.Identifier).name;
    if (BANNED_MEMBERS.has(name)) this.report(node.property, "C003", name);
    return `${object}${link}${name}`;
  }

  /** `Object.getPrototypeOf` and similar members left out of a curated global. */
  private checkRestrictedGlobalMember(node: A.MemberExpression): void {
    if (node.object.type !== "Identifier" || node.computed) return;
    const restricted = RESTRICTED_GLOBAL_MEMBERS.get(node.object.name);
    const name = (node.property as A.Identifier).name;
    if (restricted?.has(name) && this.resolve(node.object.name) === "global") {
      this.report(node, "C011", `${node.object.name}.${name}`);
    }
  }

  private call(node: A.CallExpression): string {
    const args = `(${node.arguments.map((a) => this.spreadable(a)).join(", ")})`;
    const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
    if (callee.type === "Identifier") {
      const text = this.reference(callee);
      // Through the scope or the globals object, `this` would be that object.
      return this.resolve(callee.name) === "local" || text === "undefined" ? `${text}?.${args}` : `(0, ${text})?.${args}`;
    }
    // A member callee keeps its object as `this`.
    return `${this.expression(callee, P.call)}?.${args}`;
  }

  private newExpression(node: A.NewExpression): string {
    const path = this.staticGlobalPath(node.callee);
    const unresolved = node.callee.type === "Identifier" && this.resolve(node.callee.name) === "unresolved";
    if (!unresolved && (path === undefined || !CONSTRUCTIBLE.has(path))) {
      this.report(node.callee, "C004", dottedPath(node.callee) ?? "this expression");
    }
    const args = node.arguments.map((a) => this.spreadable(a)).join(", ");
    return `new (${this.expression(node.callee)})(${args})`;
  }

  /** `Date` or `Intl.NumberFormat` when the callee is a global's static path. */
  private staticGlobalPath(node: A.Expression): string | undefined {
    if (node.type === "Identifier") return this.resolve(node.name) === "global" ? node.name : undefined;
    if (node.type === "MemberExpression" && !node.computed) {
      const object = this.staticGlobalPath(node.object);
      return object === undefined ? undefined : `${object}.${(node.property as A.Identifier).name}`;
    }
    return undefined;
  }

  // --- Assignment targets and patterns ------------------------------------------------

  /** An assignment, update or for-in/of target. */
  private target(node: A.Pattern | A.MemberExpression, operation: A.Node): string {
    if (node.type === "MemberExpression") {
      this.checkWritable(node, operation);
      return this.member(node, "write");
    }
    return this.pattern(node, "assign");
  }

  /** Identifiers bound or assigned by a pattern. */
  private pattern(node: A.Pattern, mode: "declare" | "assign"): string {
    switch (node.type) {
      case "Identifier":
        if (mode === "declare") return node.name;
        this.checkWritableName(node);
        return this.reference(node);
      case "MemberExpression":
        this.checkWritable(node, node);
        return this.member(node, "write");
      case "AssignmentPattern":
        return `${this.pattern(node.left, mode)} = ${this.expression(node.right, P.assign)}`;
      case "RestElement":
        return `...${this.pattern(node.argument, mode)}`;
      case "ArrayPattern": {
        const items = node.elements.map((e) => (e === null ? "" : this.pattern(e, mode)));
        if (node.elements.length > 0 && node.elements[node.elements.length - 1] === null) items.push("");
        return `[${items.join(", ")}]`;
      }
      case "ObjectPattern": {
        const parts = node.properties.map((p) =>
          p.type === "RestElement" ? `...${this.pattern(p.argument, mode)}` : `${this.propertyKey(p, false)}: ${this.pattern(p.value, mode)}`,
        );
        return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
      }
    }
  }

  /** A binding must not write to its scope or to a built-in. */
  private checkWritableName(id: A.Identifier): void {
    const resolution = this.resolve(id.name);
    if (resolution === "scope") this.report(id, "C006", id.name);
    else if (resolution === "global") this.report(id, "C010", id.name);
  }

  /** Member writes: rejected when the chain's root is a scope name or a global. */
  private checkWritable(node: A.MemberExpression, operation: { start: number; end: number }): void {
    let root: A.Expression = node;
    while (root.type === "MemberExpression" || root.type === "ChainExpression") {
      root = root.type === "ChainExpression" ? root.expression : root.object;
    }
    if (root.type !== "Identifier") return;
    const resolution = this.resolve(root.name);
    if (resolution === "scope") this.report(operation, "C006", root.name);
    else if (resolution === "global") this.report(operation, "C010", root.name);
  }

  // --- Statements (bodies of functions inside expressions) ----------------------------

  /** Declares the block's `let`/`const`/function names before emitting it. */
  private hoist(statements: A.Statement[]): void {
    for (const s of statements) {
      const declaration = s.type === "ExportNamedDeclaration" ? s.declaration : s;
      if (declaration.type === "VariableDeclaration") {
        for (const d of declaration.declarations) for (const id of boundIdentifiers(d.id)) this.declare(id);
      } else if (declaration.type === "FunctionDeclaration") {
        this.declare(declaration.id);
      }
    }
  }

  private blockContents(statements: A.Statement[]): string {
    return statements.length === 0 ? "{}" : `{ ${statements.map((s) => this.statement(s)).join(" ")} }`;
  }

  private block(statements: A.Statement[]): string {
    return this.withScope([], () => {
      this.hoist(statements);
      return this.blockContents(statements);
    });
  }

  /** A nested statement (body of if/loop): always braced, which also avoids dangling `else`. */
  private body(node: A.Statement): string {
    return node.type === "BlockStatement" ? this.block(node.body) : this.block([node]);
  }

  statement(node: A.Statement): string {
    switch (node.type) {
      case "ExpressionStatement": {
        const text = this.expression(node.expression);
        // `{`, `function` and `let [` cannot start an expression statement.
        return /^(\{|function\b|let\s*\[)/.test(text) ? `(${text});` : `${text};`;
      }
      case "BlockStatement":
        return this.block(node.body);
      case "EmptyStatement":
        return ";";
      case "VariableDeclaration":
        return `${this.declaration(node, false)};`;
      case "FunctionDeclaration":
        if (node.async) this.report(node, "C009", "async");
        return `function ${node.id.name}${this.functionTail(node.params, node.body)}`;
      case "IfStatement":
        return `if (${this.expression(node.test)}) ${this.body(node.consequent)}${node.alternate ? ` else ${this.body(node.alternate)}` : ""}`;
      case "WhileStatement":
        return `while (${this.expression(node.test)}) ${this.body(node.body)}`;
      case "DoWhileStatement":
        return `do ${this.body(node.body)} while (${this.expression(node.test)});`;
      case "ForStatement":
        return this.forStatement(node);
      case "ForInStatement":
      case "ForOfStatement":
        return this.forInOf(node);
      case "BreakStatement":
        return "break;";
      case "ContinueStatement":
        return "continue;";
      case "ReturnStatement":
        return node.argument ? `return ${this.expression(node.argument)};` : "return;";
      case "ThrowStatement":
        return `throw ${this.expression(node.argument)};`;
      case "TryStatement":
        return this.tryStatement(node);
      case "SwitchStatement":
        return this.switchStatement(node);
      case "ImportDeclaration":
        this.report(node, "C008", "import");
        return "";
      case "ExportNamedDeclaration":
        this.report(node, "C008", "export");
        return "";
    }
  }

  /**
   * `let a = 1, b`. Inside a `for (…;` head, an initializer containing `in`
   * is parenthesized so it isn't read as for-in.
   */
  private declaration(node: A.VariableDeclaration, forHead: boolean): string {
    if (node.kind === "var") this.report(node, "C007");
    const kind = node.kind === "var" ? "let" : node.kind;
    const declarators = node.declarations.map((d) => {
      const id = this.pattern(d.id, "declare");
      if (!d.init) return id;
      return `${id} = ${forHead ? this.forHeadExpression(d.init, P.assign) : this.expression(d.init, P.assign)}`;
    });
    return `${kind} ${declarators.join(", ")}`;
  }

  private forHeadExpression(node: A.Expression, minPrec: number): string {
    const text = this.expression(node, minPrec);
    // Conservative: a needless pair of parentheses is harmless.
    return /\bin\b/.test(text) ? `(${text})` : text;
  }

  private forStatement(node: A.ForStatement): string {
    const names = node.init?.type === "VariableDeclaration" ? node.init.declarations.flatMap((d) => boundIdentifiers(d.id)) : [];
    return this.withScope([], () => {
      for (const id of names) this.declare(id);
      const init =
        node.init === null
          ? ""
          : node.init.type === "VariableDeclaration"
            ? this.declaration(node.init, true)
            : this.forHeadExpression(node.init, P.sequence);
      const test = node.test ? this.expression(node.test) : "";
      const update = node.update ? this.expression(node.update) : "";
      return `for (${init}; ${test}; ${update}) ${this.body(node.body)}`;
    });
  }

  private forInOf(node: A.ForInStatement | A.ForOfStatement): string {
    const keyword = node.type === "ForInStatement" ? "in" : "of";
    // The right side is evaluated outside the loop variable's scope.
    const right = this.expression(node.right, node.type === "ForOfStatement" ? P.assign : P.sequence);
    return this.withScope([], () => {
      let left: string;
      if (node.left.type === "VariableDeclaration") {
        const declaration = node.left;
        for (const d of declaration.declarations) for (const id of boundIdentifiers(d.id)) this.declare(id);
        left = this.declaration(declaration, false);
      } else {
        left = this.target(node.left, node);
      }
      return `for (${left} ${keyword} ${right}) ${this.body(node.body)}`;
    });
  }

  private tryStatement(node: A.TryStatement): string {
    let text = `try ${this.block(node.block.body)}`;
    if (node.handler) {
      const handler = node.handler;
      const param = handler.param;
      text += this.withScope([], () => {
        if (!param) return ` catch ${this.block(handler.body.body)}`;
        for (const id of boundIdentifiers(param)) this.declare(id);
        return ` catch (${this.pattern(param, "declare")}) ${this.block(handler.body.body)}`;
      });
    }
    if (node.finalizer) text += ` finally ${this.block(node.finalizer.body)}`;
    return text;
  }

  private switchStatement(node: A.SwitchStatement): string {
    const discriminant = this.expression(node.discriminant);
    // All cases share one block scope.
    return this.withScope([], () => {
      this.hoist(node.cases.flatMap((c) => c.consequent));
      const cases = node.cases.map((c) => {
        const head = c.test ? `case ${this.expression(c.test)}:` : "default:";
        const body = c.consequent.map((s) => this.statement(s)).join(" ");
        return body ? `${head} ${body}` : head;
      });
      return `switch (${discriminant}) { ${cases.join(" ")} }`;
    });
  }
}

/** `a.b.c` for a chain of identifiers and static members. */
function dottedPath(node: A.Expression): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) {
    const object = dottedPath(node.object);
    return object === undefined ? undefined : `${object}.${(node.property as A.Identifier).name}`;
  }
  return undefined;
}

/** The identifiers a declaration pattern binds. */
export function boundIdentifiers(node: A.Pattern): A.Identifier[] {
  switch (node.type) {
    case "Identifier":
      return [node];
    case "AssignmentPattern":
      return boundIdentifiers(node.left);
    case "RestElement":
      return boundIdentifiers(node.argument);
    case "ArrayPattern":
      return node.elements.flatMap((e) => (e ? boundIdentifiers(e) : []));
    case "ObjectPattern":
      return node.properties.flatMap((p) => boundIdentifiers(p.type === "RestElement" ? p.argument : p.value));
    case "MemberExpression":
      return [];
  }
}
