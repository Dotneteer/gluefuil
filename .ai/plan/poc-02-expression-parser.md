# Step 2: Expression and statement parser (the JS subset)

**Status:** Done

Part of [poc-steps.md](poc-steps.md).

## Goal

Parse gfui's JavaScript subset into a syntax tree with exact source
positions. This covers binding expressions in attributes and text, event
handlers, `<script>` blocks and code-behind. Positions are **absolute
offsets in the `.gui` file**, so diagnostics and later source maps point
at the right place inside an attribute.

## Background (XMLUI)

Sources: `xmlui/src/parsers/scripting/` (`Lexer.ts`, `Parser.ts`,
`TokenType.ts`, `ParserError.ts`, `ScriptingNodeTypes.ts`);
`xmlui/src/components-core/script-runner/AttributeValueParser.ts`;
`xmlui/src/components-core/utils/statementUtils.ts`;
`.ai/xmlui/expression-eval.md`; `website/content/docs/pages/scripting.md`.

- **Three ways source code appears:**
  1. **Interpolated values:** ordinary attribute values and text content
     are split into literal text and `{expression}` segments
     (`AttributeValueParser.ts`).
     - `\{` is an escaped literal brace; any other `\x` is kept as is.
     - After `{`, the expression parser reads one expression, which must be
       followed by `}`. So `{{ a: 1 }}` is an object literal.
     - A value that is exactly one `{expr}` yields the raw value; anything
       else is string-concatenated.
  2. **Handlers:** `on*` attributes, `<event>` content and methods are
     parsed as **statements** (`parseHandlerCode`). Semicolons are optional.
     A lone arrow function is the handler, and a lone reference
     (`onClick="save"`) means "call it". Those are semantic rules, applied
     later.
  3. **Scripts:** `<script>` blocks and `.xs` code-behind, parsed as
     statements. Imports are named-only and must come first.
- **Supported:** all operators, including `**`, `??`, `?.`, the bitwise
  operators and every compound assignment (`&&=`, `||=`, `??=`, …). Also:
  - template literals and regex literals;
  - object and array destructuring, with defaults and rest;
  - spread;
  - getters and setters in object literals (`Parser.ts:3026`);
  - computed keys;
  - function declarations and expressions;
  - `for`, `for…in`, `for…of`, `while`, `do…while`, `switch`;
  - `try`/`catch` (with an optional binding)/`finally`;
  - `typeof`, `delete`, `in`, `instanceof`, `new`;
  - named `import { a, b as c } from "…"`.
- **Not supported:** `class`, generators and `yield`, `void`, `with`,
  `debugger`, labeled statements, `export`, default and namespace imports,
  dynamic `import()`, `for await`, private `#names`. `async`/`await` are
  parsed but rejected at runtime.
- **Semicolons:** XMLUI makes every semicolon optional and ignores line
  breaks entirely (`parseStatements` just skips an optional `;`).

## Design

**Scope:** the syntax layer. It produces the tree and syntax diagnostics.
Semantic rules belong to step 3's validation pass:

- reactive `var` only at the top level, and never `$`-prefixed;
- the `new` allowlist;
- imports at the top of a script;
- the handler shape (lone reference means "call it");
- name resolution and the sandbox.

**AST: an ESTree subset.** We use ESTree node types (`BinaryExpression`,
`MemberExpression`, `ArrowFunctionExpression`, `ChainExpression`, …) with
`start`/`end` offsets. ESTree is the de facto standard for JavaScript
syntax trees, well documented, and familiar to anyone who knows Babel,
acorn or ESLint. It also makes step 3's code generation and source maps
straightforward. XMLUI's own tree (`T_*` constants) is not reused.

**Entry points** (`@gluefuil/compiler`):

```ts
parseExpression(source, options?)   // one expression, then end of input
parseStatements(source, options?)   // handlers, <event>, <script>, code-behind → Program
parseInterpolation(text, options?)  // literal and {expression} segments
// options.offset: where `source` starts in the file (attribute value inner start)
// options.offsets: per-character file offsets, when the text was entity-decoded
```

For text content, `decodeEntitiesWithOffsets` (in `markup/entities.ts`)
decodes entities and records where each decoded character came from, so
expression positions still point into the raw markup.

**Lexer:**

- Hand-written, driven by the parser. A `/` is lexed as a regex only where
  an expression may start.
- Template literals are rescanned after each `${…}`.
- Every token records whether a line break came before it.

**Semicolons: JavaScript's automatic semicolon insertion (ASI) rules.** A
statement ends at `;`, `}`, the end of input, or a line break before a
token that can't continue it. Plus JavaScript's restricted productions:
`return`, `break`, `continue` and `throw` followed by a newline, and postfix
`++`/`--` on a new line.

- **Divergence from XMLUI:** XMLUI also accepts two statements on one line
  without a separator (`a = 1 b = 2`). We report that as a missing `;`. The
  corpus test checks whether any real code relies on it.

**Unsupported syntax** gets a clear "not supported in gfui script"
diagnostic (S030) instead of a generic syntax error. `async`/`await` are
reported at compile time, where XMLUI rejects them at runtime.

**Small extensions beyond XMLUI** (standard JS, cheap to support):

- object method shorthand (`{ f() {…} }`);
- numeric separators (`1_000`);
- octal literals (`0o17`);
- the BigInt suffix (`10n`).

**Error recovery:** a syntax error inside a statement is reported, then the
parser skips to the next statement boundary and continues.
`parseExpression` reports the first error. Never throws.

**Diagnostics** (prefix `S`):

| Code | Meaning |
|------|---------|
| S001 | Invalid character |
| S002 | Unterminated string literal |
| S003 | Unterminated template literal |
| S004 | Unterminated regular expression |
| S005 | Unterminated comment |
| S006 | Invalid number literal |
| S007 | Invalid regular expression |
| S008 | Invalid escape sequence |
| S010 | Expression expected |
| S011 | Unexpected token |
| S012 | 'x' expected |
| S013 | Identifier expected |
| S014 | Invalid assignment target |
| S015 | Invalid destructuring pattern |
| S016 | Rest element must be last |
| S017 | Missing initializer (`const`, destructuring) |
| S018 | Duplicate `default` clause |
| S019 | `catch` or `finally` expected |
| S020 | Line break not allowed after `throw` |
| S021 | Getter takes no parameters; setter takes exactly one |
| S030 | 'x' is not supported in gfui script |
| S040 | Unclosed `{` in an interpolated value |

## Steps

- [x] Tokens and lexer (including regex and template rescanning, line-break flags)
- [x] ESTree-subset AST types
- [x] Expression parser (precedence, arrows via cover grammar, patterns, chains)
- [x] Statement parser (ASI, all supported statements, imports)
- [x] Interpolation segments; entity-decoding offset map
- [x] Conformance tables: expressions, statements, ASI, positions, diagnostics, interpolation
- [x] Compatibility: all script in the XMLUI corpus parses (attribute values, handlers, `<script>`, `.xs` files)
- [x] Docs ([`../docs/script-parser.md`](../docs/script-parser.md))

## Findings

- **XMLUI decodes entities in attribute values** (`transform.ts`,
  `parseEscapeCharactersInAttrValues`). Step 1 had this wrong; corrected
  in the markup AST (`AttributeValue.value`/`raw`) and in its docs.
- **Line break before `=>`:** real XMLUI code puts `=>` on the next line
  (`howto/align-columns-across-loop-rows.md`). JavaScript forbids that;
  gfui now allows it.
- **`export function`** appears in XMLUI's `.xs` test fixtures. XMLUI has no
  `export` token, so it tolerates the keyword by accident (it parses as an
  identifier). gfui supports `export function` properly
  (`ExportNamedDeclaration`); other export forms are S030. Two unused
  `export const` fixtures are excluded from the corpus test; XMLUI rejects
  `const` in modules (W044).
- **`await`:** the newer Managed React docs use `await` in handlers, but
  XMLUI's runtime throws "does not support the await operator" in both
  evaluators. gfui reports S030 (see open question 2).
- **ASI strictness confirmed:** no XMLUI code or docs sample relies on two
  statements on one line without `;`.
- **`.ai/xmlui/expression-eval.md` is outdated** on getters and setters: it
  says they are unsupported, but XMLUI's parser supports them
  (`Parser.ts:3026`).
- **Function-valued props** (`validate="(data) => …"`,
  `transformResult="…"`) are code without braces. Whether an attribute is
  a handler, a callback or a value needs component metadata; the semantic
  stage decides, not the parser.

## Open questions

1. ~~ASI strictness~~: confirmed (see Findings).
2. ~~**Tolerate `await` in handlers?**~~ Decided in step 7: yes, in
   statement code (handlers); it behaves like the implicit await. See
   [poc-07-async-handlers.md](poc-07-async-handlers.md). Original question: Handlers are implicitly async, so
   `await` is redundant there. Accepting it as a no-op would be friendlier
   to JavaScript habits and to AI-generated code. It would remain an error
   in bindings, which are synchronous. Today: S030 everywhere, matching
   XMLUI's runtime.
