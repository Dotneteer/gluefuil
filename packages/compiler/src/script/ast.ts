// pfui script syntax tree: a subset of ESTree (https://github.com/estree/estree).
// Every node carries `start`/`end` UTF-16 offsets into the .pfui file (end exclusive).

export interface BaseNode {
  type: string;
  start: number;
  end: number;
}

// --- Expressions -------------------------------------------------------------

export type Expression =
  | Identifier
  | Literal
  | TemplateLiteral
  | ArrayExpression
  | ObjectExpression
  | FunctionExpression
  | ArrowFunctionExpression
  | UnaryExpression
  | UpdateExpression
  | BinaryExpression
  | LogicalExpression
  | AssignmentExpression
  | ConditionalExpression
  | CallExpression
  | NewExpression
  | MemberExpression
  | ChainExpression
  | SequenceExpression
  | AwaitExpression;

export interface Identifier extends BaseNode {
  type: "Identifier";
  name: string;
}

export interface Literal extends BaseNode {
  type: "Literal";
  value: string | number | boolean | null | bigint | RegExpValue;
  /** Source text of the literal. */
  raw: string;
  /** Present for regular expression literals. */
  regex?: { pattern: string; flags: string };
  /** Present for BigInt literals (`10n`): the digits without the suffix. */
  bigint?: string;
}

/** Placeholder value type for regex literals; the pattern lives in `regex`. */
export type RegExpValue = { regex: true };

export interface TemplateLiteral extends BaseNode {
  type: "TemplateLiteral";
  quasis: TemplateElement[];
  expressions: Expression[];
}

export interface TemplateElement extends BaseNode {
  type: "TemplateElement";
  /** `cooked` is null when the text contains an invalid escape. */
  value: { raw: string; cooked: string | null };
  tail: boolean;
}

export interface ArrayExpression extends BaseNode {
  type: "ArrayExpression";
  /** `null` marks a hole: `[a, , b]`. */
  elements: (Expression | SpreadElement | null)[];
}

export interface ObjectExpression extends BaseNode {
  type: "ObjectExpression";
  properties: (Property | SpreadElement)[];
}

export interface Property extends BaseNode {
  type: "Property";
  key: Expression;
  value: Expression;
  kind: "init" | "get" | "set";
  computed: boolean;
  shorthand: boolean;
  method: boolean;
}

export interface SpreadElement extends BaseNode {
  type: "SpreadElement";
  argument: Expression;
}

export interface FunctionExpression extends BaseNode {
  type: "FunctionExpression";
  id: Identifier | null;
  params: Pattern[];
  body: BlockStatement;
  async: boolean;
}

export interface ArrowFunctionExpression extends BaseNode {
  type: "ArrowFunctionExpression";
  params: Pattern[];
  body: Expression | BlockStatement;
  /** True when the body is an expression (`x => x + 1`). */
  expression: boolean;
  async: boolean;
}

export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "delete";

export interface UnaryExpression extends BaseNode {
  type: "UnaryExpression";
  operator: UnaryOperator;
  prefix: true;
  argument: Expression;
}

export interface UpdateExpression extends BaseNode {
  type: "UpdateExpression";
  operator: "++" | "--";
  prefix: boolean;
  argument: Expression;
}

export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof";

export interface BinaryExpression extends BaseNode {
  type: "BinaryExpression";
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

export type LogicalOperator = "&&" | "||" | "??";

export interface LogicalExpression extends BaseNode {
  type: "LogicalExpression";
  operator: LogicalOperator;
  left: Expression;
  right: Expression;
}

export type AssignmentOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "**="
  | "<<="
  | ">>="
  | ">>>="
  | "|="
  | "^="
  | "&="
  | "&&="
  | "||="
  | "??=";

export interface AssignmentExpression extends BaseNode {
  type: "AssignmentExpression";
  operator: AssignmentOperator;
  /** A pattern only for plain `=` destructuring assignment. */
  left: Pattern | MemberExpression;
  right: Expression;
}

export interface ConditionalExpression extends BaseNode {
  type: "ConditionalExpression";
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface CallExpression extends BaseNode {
  type: "CallExpression";
  callee: Expression;
  arguments: (Expression | SpreadElement)[];
  /** `f?.()` */
  optional: boolean;
}

export interface NewExpression extends BaseNode {
  type: "NewExpression";
  callee: Expression;
  arguments: (Expression | SpreadElement)[];
}

export interface MemberExpression extends BaseNode {
  type: "MemberExpression";
  object: Expression;
  property: Expression;
  /** `a[b]` */
  computed: boolean;
  /** `a?.b` */
  optional: boolean;
}

/** Wraps a member/call chain that contains `?.` (ESTree), delimiting its short-circuit. */
export interface ChainExpression extends BaseNode {
  type: "ChainExpression";
  expression: CallExpression | MemberExpression;
}

export interface SequenceExpression extends BaseNode {
  type: "SequenceExpression";
  expressions: Expression[];
}

/** Parsed for recovery only: `await` is reported as unsupported (S030). */
export interface AwaitExpression extends BaseNode {
  type: "AwaitExpression";
  argument: Expression;
}

// --- Patterns (binding and assignment targets) --------------------------------

export type Pattern = Identifier | ObjectPattern | ArrayPattern | AssignmentPattern | RestElement | MemberExpression;

export interface ObjectPattern extends BaseNode {
  type: "ObjectPattern";
  properties: (PatternProperty | RestElement)[];
}

export interface PatternProperty extends BaseNode {
  type: "Property";
  key: Expression;
  value: Pattern;
  kind: "init";
  computed: boolean;
  shorthand: boolean;
  method: false;
}

export interface ArrayPattern extends BaseNode {
  type: "ArrayPattern";
  elements: (Pattern | null)[];
}

/** `x = default` inside a pattern or parameter list. */
export interface AssignmentPattern extends BaseNode {
  type: "AssignmentPattern";
  left: Pattern;
  right: Expression;
}

export interface RestElement extends BaseNode {
  type: "RestElement";
  argument: Pattern;
}

// --- Statements ------------------------------------------------------------------

export type Statement =
  | ExpressionStatement
  | BlockStatement
  | EmptyStatement
  | VariableDeclaration
  | FunctionDeclaration
  | IfStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | ForInStatement
  | ForOfStatement
  | BreakStatement
  | ContinueStatement
  | ReturnStatement
  | ThrowStatement
  | TryStatement
  | SwitchStatement
  | ImportDeclaration
  | ExportNamedDeclaration;

/** The result of parseStatements(). */
export interface Program extends BaseNode {
  type: "Program";
  body: Statement[];
}

export interface ExpressionStatement extends BaseNode {
  type: "ExpressionStatement";
  expression: Expression;
}

export interface BlockStatement extends BaseNode {
  type: "BlockStatement";
  body: Statement[];
}

export interface EmptyStatement extends BaseNode {
  type: "EmptyStatement";
}

export interface VariableDeclaration extends BaseNode {
  type: "VariableDeclaration";
  kind: "var" | "let" | "const";
  declarations: VariableDeclarator[];
}

export interface VariableDeclarator extends BaseNode {
  type: "VariableDeclarator";
  id: Pattern;
  init: Expression | null;
}

export interface FunctionDeclaration extends BaseNode {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Pattern[];
  body: BlockStatement;
  async: boolean;
}

export interface IfStatement extends BaseNode {
  type: "IfStatement";
  test: Expression;
  consequent: Statement;
  alternate: Statement | null;
}

export interface WhileStatement extends BaseNode {
  type: "WhileStatement";
  test: Expression;
  body: Statement;
}

export interface DoWhileStatement extends BaseNode {
  type: "DoWhileStatement";
  body: Statement;
  test: Expression;
}

export interface ForStatement extends BaseNode {
  type: "ForStatement";
  init: VariableDeclaration | Expression | null;
  test: Expression | null;
  update: Expression | null;
  body: Statement;
}

export interface ForInStatement extends BaseNode {
  type: "ForInStatement";
  left: VariableDeclaration | Pattern;
  right: Expression;
  body: Statement;
}

export interface ForOfStatement extends BaseNode {
  type: "ForOfStatement";
  left: VariableDeclaration | Pattern;
  right: Expression;
  body: Statement;
}

export interface BreakStatement extends BaseNode {
  type: "BreakStatement";
}

export interface ContinueStatement extends BaseNode {
  type: "ContinueStatement";
}

export interface ReturnStatement extends BaseNode {
  type: "ReturnStatement";
  argument: Expression | null;
}

export interface ThrowStatement extends BaseNode {
  type: "ThrowStatement";
  argument: Expression;
}

export interface TryStatement extends BaseNode {
  type: "TryStatement";
  block: BlockStatement;
  handler: CatchClause | null;
  finalizer: BlockStatement | null;
}

export interface CatchClause extends BaseNode {
  type: "CatchClause";
  /** `null` for an optional catch binding: `catch { … }`. */
  param: Pattern | null;
  body: BlockStatement;
}

export interface SwitchStatement extends BaseNode {
  type: "SwitchStatement";
  discriminant: Expression;
  cases: SwitchCase[];
}

export interface SwitchCase extends BaseNode {
  type: "SwitchCase";
  /** `null` for `default:`. */
  test: Expression | null;
  consequent: Statement[];
}

/** `import { a, b as c } from "path"` (named imports only). */
export interface ImportDeclaration extends BaseNode {
  type: "ImportDeclaration";
  specifiers: ImportSpecifier[];
  source: Literal;
}

/**
 * `export function f() {}` in a code-behind module. Only function
 * declarations can be exported (other export forms are reported as S030).
 */
export interface ExportNamedDeclaration extends BaseNode {
  type: "ExportNamedDeclaration";
  declaration: FunctionDeclaration;
}

export interface ImportSpecifier extends BaseNode {
  type: "ImportSpecifier";
  imported: Identifier;
  local: Identifier;
}

export type Node =
  | Expression
  | Pattern
  | Statement
  | Program
  | Property
  | PatternProperty
  | SpreadElement
  | TemplateElement
  | VariableDeclarator
  | CatchClause
  | SwitchCase
  | ImportSpecifier;
