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

export interface EmitterOptions {
  /**
   * "binding" (default): no state writes (C006). "handler": variables can be
   * written; a write through a path rooted at a variable compiles to the
   * runtime's path helpers (structural copy).
   */
  mode?: "binding" | "handler";
  /** The scope names that are variables (writable in handler mode). */
  variables?: ReadonlySet<string>;
}

/** Array methods compiled to `$$r.mutate` when called on a variable path (runtime ARRAY_MUTATORS). */
const ARRAY_MUTATORS: ReadonlySet<string> = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

const LOGICAL_ASSIGNMENT = new Set(["&&=", "||=", "??="]);

/** Array methods compiled to `$$r.arr` in handler code: async-aware (runtime ASYNC_ARRAY_METHODS). */
const ASYNC_ARRAY_METHODS: ReadonlySet<string> = new Set(["map", "forEach", "filter", "every", "some", "find", "findIndex", "flatMap"]);

const FUNCTION_TYPES = new Set(["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"]);

/** Whether `node` contains an `await`, not counting nested functions. */
function containsAwait(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(containsAwait);
  const record = node as { type?: unknown };
  if (record.type === "AwaitExpression") return true;
  for (const [key, value] of Object.entries(node)) {
    if (key === "start" || key === "end" || value === null || typeof value !== "object") continue;
    if (!Array.isArray(value) && FUNCTION_TYPES.has((value as { type?: string }).type ?? "")) continue;
    if (Array.isArray(value)) {
      if (value.some((v) => v && typeof v === "object" && !FUNCTION_TYPES.has((v as { type?: string }).type ?? "") && containsAwait(v))) return true;
    } else if (containsAwait(value)) return true;
  }
  return false;
}

/** A member chain rooted at a variable: `settings.items[i].done`. */
interface VariablePath {
  root: A.Identifier;
  keys: { node: A.Expression; computed: boolean }[];
}

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
  private readonly handlerMode: boolean;
  private readonly variables: ReadonlySet<string>;
  private tempCount = 0;
  /**
   * Handler mode: the function being emitted is async, so calls are awaited
   * implicitly when they return a thenable (the handler body, a lone handler
   * function, and nested functions that contain `await`).
   */
  private asyncFunction = false;

  constructor(scope: ScopeNames, options: EmitterOptions = {}) {
    this.isScopeName = typeof scope === "function" ? scope : (name) => scope.has(name);
    this.handlerMode = options.mode === "handler";
    this.variables = options.variables ?? new Set();
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
        const path = this.variablePathOf(node.argument);
        if (path) {
          const delta = node.operator === "++" ? 1 : -1;
          return { text: this.withPath(path, (args) => `$$r.updateIn(${args}, ${delta}, ${node.prefix})`), prec: P.call };
        }
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
        const path = this.variablePathOf(node.left);
        if (path) return this.assignPath(node, path);
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
      case "AwaitExpression": {
        if (!this.handlerMode || !this.asyncFunction) {
          this.report(node, "C009", "await");
          return { text: "undefined", prec: P.primary };
        }
        // Same as an implicit await: suspends only for a thenable.
        const argument = node.argument.type === "ChainExpression" ? node.argument.expression : node.argument;
        if (argument.type === "CallExpression") return { text: this.expression(argument), prec: P.primary };
        return { text: this.awaitText(this.expression(node.argument, P.assign)), prec: P.primary };
      }
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
        // Getters and setters cannot be async; an `await` in one is C009.
        const isAsync = p.kind === "init" && this.isAsync(fn.body);
        const prefix = p.kind === "init" ? (isAsync ? "async " : "") : `${p.kind} `;
        return `${prefix}${key}${this.functionTail(fn.params, fn.body, isAsync)}`;
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

  /** Handler mode: a nested function is async when it contains an explicit `await`. */
  private isAsync(body: A.Node): boolean {
    return this.handlerMode && containsAwait(body);
  }

  private functionExpression(node: A.FunctionExpression): string {
    if (node.async) this.report(node, "C009", "async");
    const isAsync = this.isAsync(node.body);
    // A named function expression sees its own name.
    const names = node.id ? [node.id.name] : [];
    return this.withScope(names, () => {
      if (node.id) this.declare(node.id);
      return `${isAsync ? "async " : ""}function${node.id ? ` ${node.id.name}` : ""}${this.functionTail(node.params, node.body, isAsync)}`;
    });
  }

  private arrow(node: A.ArrowFunctionExpression, forceAsync = false, prologue = "", locals: string[] = []): string {
    if (node.async) this.report(node, "C009", "async");
    const isAsync = forceAsync || this.isAsync(node.body);
    return this.withScope(locals, () => {
      const params = this.withFunction(false, () => this.params(node.params));
      const prefix = isAsync ? "async " : "";
      if (node.body.type === "BlockStatement") {
        return `${prefix}${params} => ${this.withFunction(isAsync, () => this.functionBody(node.body as A.BlockStatement, isAsync, prologue))}`;
      }
      const expressionBody = node.body;
      if (isAsync) {
        // An async arrow with an expression body becomes `{ return …; }` inside the segment brackets.
        return `${prefix}${params} => ${this.withFunction(true, () => this.asyncBody(`return ${this.expression(expressionBody)};`, prologue))}`;
      }
      let body = this.withFunction(false, () => this.expression(expressionBody, P.assign));
      if (body.startsWith("{")) body = `(${body})`;
      return `${params} => ${body}`;
    });
  }

  /** `(params) { body }`, in a new function scope. */
  private functionTail(params: A.Pattern[], body: A.BlockStatement, isAsync = false, prologue = ""): string {
    return this.withScope([], () => {
      const list = this.withFunction(false, () => this.params(params));
      return `${list} ${this.withFunction(isAsync, () => this.functionBody(body, isAsync, prologue))}`;
    });
  }

  private withFunction<T>(isAsync: boolean, body: () => T): T {
    const outer = this.asyncFunction;
    this.asyncFunction = isAsync;
    try {
      return body();
    } finally {
      this.asyncFunction = outer;
    }
  }

  private params(params: A.Pattern[]): string {
    // Declare every parameter first: defaults may refer to earlier parameters.
    for (const p of params) for (const id of boundIdentifiers(p)) this.declare(id);
    return `(${params.map((p) => this.pattern(p, "declare")).join(", ")})`;
  }

  /** A function body shares the parameters' scope for hoisting purposes. */
  private functionBody(body: A.BlockStatement, isAsync = false, prologue = ""): string {
    this.hoist(body.body);
    if (!isAsync) return prologue ? `{ ${prologue}${body.body.map((s) => this.statement(s)).join(" ")} }` : this.blockContents(body.body);
    return this.asyncBody(body.body.map((s) => this.statement(s)).join(" "), prologue);
  }

  /**
   * The body of an async function: segment brackets (see runtime render/handlers.ts).
   * `$$t` holds a call's result; `$$o` records whether this activation opened
   * the current segment (it resumed after an `await`), so it closes only what
   * it opened: before its next suspension, or when it finishes.
   */
  private asyncBody(inner: string, prologue = ""): string {
    return `{ ${prologue}let $$t, $$o = false; try {${inner ? ` ${inner}` : ""} } finally { $$o && $$x.close(); } }`;
  }

  /**
   * Implicit await of a call result (or an explicit `await`): suspends only
   * for a thenable. Before suspending, the segment this activation opened is
   * closed; after resuming, `$$x.open()` stops a cancelled handler, then opens
   * the next segment.
   */
  private awaitText(inner: string): string {
    return `($$r.th($$t = ${inner}) ? ($$o && ($$o = false, $$x.close()), $$t = await $$t, $$x.open(), $$o = true, $$t) : $$t)`;
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
      const path = this.variablePathOf(member);
      if (path) return this.withPath(path, (args) => `$$r.deleteIn(${args})`);
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
    const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
    // `items.push(x)` on a variable: copy the array, mutate the copy, assign.
    if (callee.type === "MemberExpression" && !callee.computed && ARRAY_MUTATORS.has((callee.property as A.Identifier).name)) {
      const path = this.variablePathOf(callee.object, true);
      if (path) {
        const method = JSON.stringify((callee.property as A.Identifier).name);
        const list = `[${node.arguments.map((a) => this.spreadable(a)).join(", ")}]`;
        return this.withPath(path, (args) => `$$r.mutate(${args}, ${method}, ${list})`);
      }
    }
    const text = this.plainCall(node, callee);
    return this.handlerMode && this.asyncFunction ? this.awaitText(text) : text;
  }

  private plainCall(node: A.CallExpression, callee: A.Expression): string {
    // Handler code: `items.map(cb)` and friends await promise-returning callbacks.
    if (this.handlerMode && callee.type === "MemberExpression" && !callee.computed && ASYNC_ARRAY_METHODS.has((callee.property as A.Identifier).name)) {
      const list = `[${node.arguments.map((a) => this.spreadable(a)).join(", ")}]`;
      return `$$r.arr(${this.expression(callee.object, P.assign)}, ${JSON.stringify((callee.property as A.Identifier).name)}, ${list})`;
    }
    const args = `(${node.arguments.map((a) => this.spreadable(a)).join(", ")})`;
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

  /**
   * Writing a name: a binding cannot write its scope (C006); a handler can
   * write variables only (C012); nobody writes a built-in (C010).
   */
  private checkWritableName(id: A.Identifier): void {
    const resolution = this.resolve(id.name);
    if (resolution === "scope") {
      if (!this.handlerMode) this.report(id, "C006", id.name);
      else if (!this.variables.has(id.name)) this.report(id, "C012", id.name);
    } else if (resolution === "global") this.report(id, "C010", id.name);
  }

  /**
   * Member writes not compiled to a path helper: rejected when the chain's
   * root is a scope name or a global. In a handler, a variable root reaches
   * here only from a destructuring or for-in/of target (C013).
   */
  private checkWritable(node: A.MemberExpression, operation: { start: number; end: number }): void {
    let root: A.Expression = node;
    while (root.type === "MemberExpression" || root.type === "ChainExpression") {
      root = root.type === "ChainExpression" ? root.expression : root.object;
    }
    if (root.type !== "Identifier") return;
    const resolution = this.resolve(root.name);
    if (resolution === "scope") {
      if (!this.handlerMode) this.report(operation, "C006", root.name);
      else if (this.variables.has(root.name)) this.report(operation, "C013", root.name);
      else this.report(operation, "C012", root.name);
    } else if (resolution === "global") this.report(operation, "C010", root.name);
  }

  // --- Writes through variable paths (handler mode) -------------------------------------

  /**
   * In handler mode, a member chain (or, with `allowRoot`, the bare name) rooted
   * at a variable. Patterns and other targets return undefined.
   */
  private variablePathOf(node: A.Node, allowRoot = false): VariablePath | undefined {
    if (!this.handlerMode) return undefined;
    const keys: VariablePath["keys"] = [];
    let current: A.Node = node;
    while (current.type === "MemberExpression" || current.type === "ChainExpression") {
      if (current.type === "ChainExpression") {
        current = current.expression;
        continue;
      }
      keys.unshift({ node: current.property, computed: current.computed });
      current = current.object;
    }
    if (current.type !== "Identifier" || (keys.length === 0 && !allowRoot)) return undefined;
    if (this.resolve(current.name) !== "scope" || !this.variables.has(current.name)) return undefined;
    return { root: current, keys };
  }

  /**
   * Emits a path helper call. `build` receives `$$s, "name", [keys]`. Computed
   * keys are evaluated once (bound to temporaries), and checked by $$r.key().
   */
  private withPath(path: VariablePath, build: (args: string, read: string) => string): string {
    const temps: [name: string, init: string][] = [];
    const keys = path.keys.map(({ node, computed }) => {
      if (!computed) {
        const name = (node as A.Identifier).name;
        if (BANNED_MEMBERS.has(name)) this.report(node, "C003", name);
        return JSON.stringify(name);
      }
      if (node.type === "Literal" && (typeof node.value === "string" || typeof node.value === "number")) {
        return this.guardedKey(node);
      }
      const temp = `$$k${this.tempCount++}`;
      temps.push([temp, this.guardedKey(node)]);
      return temp;
    });
    const scopeRead = this.reference(path.root);
    const read = scopeRead + keys.map((k) => `?.[${k}]`).join("");
    const text = build(`$$s, ${JSON.stringify(path.root.name)}, [${keys.join(", ")}]`, read);
    if (temps.length === 0) return text;
    return `((${temps.map(([t]) => t).join(", ")}) => ${text})(${temps.map(([, init]) => init).join(", ")})`;
  }

  /** `v.a.b = x`, `v.a op= x`, `v.a ??= x` on a variable path. */
  private assignPath(node: A.AssignmentExpression, path: VariablePath): Emitted {
    const right = (prec: number) => this.expression(node.right, prec);
    if (node.operator === "=") {
      return { text: this.withPath(path, (args) => `$$r.setIn(${args}, ${right(P.assign)})`), prec: P.call };
    }
    if (LOGICAL_ASSIGNMENT.has(node.operator)) {
      // Short-circuits as in JavaScript: no write when the current value decides.
      const op = node.operator.slice(0, 2);
      return { text: this.withPath(path, (args, read) => `(${read} ${op} $$r.setIn(${args}, ${right(P.assign)}))`), prec: P.primary };
    }
    const op = node.operator.slice(0, -1) as A.BinaryOperator;
    const prec = BINARY_PRECEDENCE[op];
    return {
      text: this.withPath(path, (args, read) => `$$r.setIn(${args}, ${read} ${op} ${right(prec + 1)})`),
      prec: P.call,
    };
  }

  // --- Handlers --------------------------------------------------------------------------

  /**
   * The function a handler compiles to (handler mode), as `($$x) => async …`
   * where `$$x` is the runtime's invocation context:
   *   - a lone arrow or function expression: that function, made async;
   *   - a lone reference (`save`, `api.save`): calls it with the event arguments;
   *   - statements: `async (...$params) => { const $param = $params[0]; … }`.
   * `$cancel` is a local in all of them. Calls are awaited implicitly.
   */
  handlerFunction(program: A.Program): string {
    const body = program.body;
    const only = body.length === 1 && body[0]!.type === "ExpressionStatement" ? body[0].expression : undefined;
    const lone = only?.type === "ChainExpression" ? only.expression : only;
    const cancel = "const $cancel = $$x.cancel; ";
    if (lone?.type === "ArrowFunctionExpression") {
      return `($$x) => ${this.arrow(lone, true, cancel, ["$cancel"])}`;
    }
    if (lone?.type === "FunctionExpression") {
      return `($$x) => ${this.withScope(["$cancel"], () => this.functionExpressionWithPrologue(lone, cancel))}`;
    }
    let statements = body;
    if (lone?.type === "Identifier" || lone?.type === "MemberExpression") {
      const at = { start: lone.start, end: lone.end };
      const call: A.CallExpression = {
        type: "CallExpression",
        callee: lone,
        arguments: [{ type: "SpreadElement", argument: { type: "Identifier", name: "$params", ...at }, ...at }],
        optional: false,
        ...at,
      };
      statements = [{ type: "ExpressionStatement", expression: call, ...at }];
    }
    return this.withScope(["$param", "$params", "$cancel"], () =>
      this.withFunction(true, () => {
        this.hoist(statements);
        const inner = statements.map((s) => this.statement(s)).join(" ");
        return `($$x) => async (...$params) => ${this.asyncBody(inner, `const $param = $params[0]; ${cancel}`)}`;
      }),
    );
  }

  private functionExpressionWithPrologue(node: A.FunctionExpression, prologue: string): string {
    if (node.async) this.report(node, "C009", "async");
    const names = node.id ? [node.id.name] : [];
    return this.withScope(names, () => {
      if (node.id) this.declare(node.id);
      return `async function${node.id ? ` ${node.id.name}` : ""}${this.functionTail(node.params, node.body, true, prologue)}`;
    });
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
      case "FunctionDeclaration": {
        if (node.async) this.report(node, "C009", "async");
        const isAsync = this.isAsync(node.body);
        return `${isAsync ? "async " : ""}function ${node.id.name}${this.functionTail(node.params, node.body, isAsync)}`;
      }
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
