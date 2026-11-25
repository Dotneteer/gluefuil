# Script parser

> Subsystem reference for `packages/compiler/src/script/`. Describes the
> code as it is. Design rationale and XMLUI comparison:
> [`../plan/poc-02-expression-parser.md`](../plan/poc-02-expression-parser.md).
>
> **Last updated:** step 7 (`await` in statement code).

## Role

Parses gfui script, a JavaScript subset, into an **ESTree-subset** syntax
tree with **file offsets** on every node. Three entry points match the three
ways script appears in markup:

| Where the code appears | Entry point | Result |
|------------------------|-------------|--------|
| Ordinary attribute values and text content: `"Hi {name}!"` | `parseInterpolation(text, options)` | Literal and `{expression}` segments |
| Handlers: `on*` and `method.*` attributes, `<event>`/`<method>` content, `<script>` blocks, `.xs` code-behind | `parseStatements(source, options)` | `Program` |
| One standalone expression | `parseExpression(source, options)` | `Expression` or `null` |

The parser is purely syntactic. Deciding which attribute is a handler and
which is a value, and every semantic rule (reactive `var` placement, `$`
names, the `new` allowlist, import placement, handler shapes such as "a lone
reference means call it", name resolution, the sandbox) belongs to later
stages.

## Positions

`options` places the parsed text in the `.gui` file:

- `offset`: the file offset of the text's first character, for example
  `attribute.value.inner.start`;
- `offsets`: per-character file offsets (length `text.length + 1`), for
  entity-decoded text. Produce them with `decodeEntitiesWithOffsets(raw, start)`
  from `markup/entities.ts`.

Both attribute values and text content are entity-decoded, as XMLUI does,
so the usual call is:

```ts
const decoded = decodeEntitiesWithOffsets(attribute.value.raw, attribute.value.inner.start);
parseInterpolation(decoded.value, { offsets: decoded.offsets });
```

Every node and diagnostic then holds offsets into the original file, which
is what diagnostics and source maps need.

## Files

| File | Contents |
|------|----------|
| `src/script/ast.ts` | ESTree-subset node types (expressions, patterns, statements, `Program`) |
| `src/script/lexer.ts` | `Lexer`: tokens with a `newlineBefore` flag; `rescanRegex`, `rescanTemplate`; `peek()` (silent lookahead) |
| `src/script/parser.ts` | `ScriptParser`: expressions, cover grammar, statements, ASI, recovery |
| `src/script/parse.ts` | `parseExpression`, `parseStatements` |
| `src/script/interpolation.ts` | `parseInterpolation` and the segment types |
| `src/script/diagnostics.ts` | `ScriptDiagnostics`: code → message builder |

## The language (syntax)

**Supported:**

| Area | Constructs |
|------|------------|
| Literals | Numbers (decimal, `.5`, exponent, `0x`, `0b`, `0o`, `_` separators, BigInt `10n`), strings with all escapes, template literals (nesting allowed), regex literals (validated with `new RegExp`), `true`/`false`/`null` |
| Operators | All arithmetic, comparison, equality, bitwise and logical operators, plus `??`, `**` (right-associative), `in`, `instanceof`, `typeof`, `delete`, `++`/`--`, `?:`, the comma operator, and all 16 assignment operators |
| Member access and calls | `.`, `[]`, `?.` / `?.[]` / `?.()` (wrapped in `ChainExpression`), calls with spread, `new X(…)` / `new X` |
| Literals of structure | Arrays (with holes and spread); objects (shorthand, computed keys, spread, getters and setters, method shorthand) |
| Functions | `function` declarations and expressions; arrows with expression or block bodies; default, rest and destructured parameters |
| Patterns | Object and array destructuring with defaults and rest, in declarations, parameters, `for…of`/`for…in` heads and assignments |
| Statements | Blocks, `var`/`let`/`const`, `if`/`else`, `while`, `do…while`, `for`, `for…of`, `for…in`, `break`/`continue` (no labels), `return`, `throw`, `try`/`catch` (with an optional binding)/`finally`, `switch` |
| Modules | `import { a, b as c } from "…"`; `export function f() {}` |

**Reported as unsupported (S030):** `class`, `this`, `super`, `void`,
`with`, `debugger`, `yield` and generators, labels, `export` other than
function declarations, default, namespace and side-effect imports,
dynamic `import()`, `new.target`, `for await`, tagged templates, private
`#names`.

`async` is also reported (S030), but still parsed into the tree
(`async: true`) so tooling keeps working.

`await` is accepted in statement code (`parseStatements`, which sets
`allowAwait: true`: handlers are async, step 7), and reported as S030 in
`parseExpression`/`parseInterpolation` (bindings are synchronous). The
option `ScriptSourceOptions.allowAwait` controls it.

**Divergences from JavaScript:**

- A line break before `=>` is allowed, for XMLUI compatibility (real XMLUI
  code uses it).
- `a ?? b || c` is accepted without parentheses.

**Semicolons:** JavaScript's automatic semicolon insertion.

- A statement ends at `;`, `}`, the end of input, or a line break before a
  token that cannot continue it.
- Restricted productions: `return`/`break`/`continue` followed by a line
  break end the statement; a line break after `throw` is an error (S020);
  postfix `++`/`--` must be on the same line.
- **Divergence from XMLUI:** XMLUI also accepts two statements on one line
  without `;` (`a = 1 b = 2`); gfui reports S012.

## Implementation

- **Lexer.**
  - The parser drives it. A `/` at the start of an expression is rescanned
    as a regex (`rescanRegex`).
  - After the `}` that ends a `${…}`, the template is rescanned
    (`rescanTemplate`).
  - `peek()` scans one token ahead with diagnostics silenced.
- **Expressions:** precedence climbing (`BINARY_PRECEDENCE`).
- **Arrows and destructuring assignment** use a **cover grammar**: they are
  parsed as an expression, then `toPattern()` converts them when `=>` or
  `=` follows.
  - The shorthand initializer `{ a = 1 }` is valid only inside a pattern.
    `pendingCover` tracks it until the enclosing literal either becomes a
    pattern or turns out to be an expression (S011).
  - `parenthesized` records `(…)` expressions: `(a) = 1` is valid,
    `({a}) = 1` is not.
- **`noIn`** disables the `in` operator inside a `for` init clause;
  `withIn()` re-enables it inside brackets, parentheses and bodies.
- **Errors:** `fail()` reports and throws an internal `ParseError`.
  - Statement lists catch it and `synchronize()`: skip to a `;` or line
    break at depth 0, or to the `}` closing the block. Bracketed regions
    are skipped whole, and template substitutions are rescanned while
    skipping.
  - `parseExpression` returns `null` after the first error.
  - The parser never throws to callers.
- **Positions:** tokens hold raw indices; `finish(start, fields)` maps them
  with `at()` (`offset` or `offsets`). Statement spans include their `;`.

## Interpolation (XMLUI's `AttributeValueParser` rules)

- `\{` is a literal `{` (one backslash dropped); any other `\x` is kept.
- `{` starts one expression, which must be followed by `}`. So `{{ a: 1 }}`
  is an object literal, and braces inside strings or templates are fine.
- A `{` at the very end is literal; a lone `}` is literal.
- Segments: `{ kind: "literal", value }` or `{ kind: "expression",
  expression }`. Spans include the braces; `expression` is `null` after an
  error. After a broken expression, parsing resumes after the next `}`.

## Diagnostics

All are errors.

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
| S017 | Missing initializer |
| S018 | Duplicate `default` clause |
| S019 | `catch` or `finally` expected |
| S020 | Line break after `throw` |
| S021 | Getter/setter parameter count |
| S030 | Not supported in gfui script |
| S040 | Unclosed `{` in an interpolated value |

## Tests

| File | Covers |
|------|--------|
| `tests/script/expressions.test.ts` | Conformance table: literals and their values, templates, precedence and associativity, unary and update, assignment and destructuring, member, call, `new` and optional chains, array and object literals, functions and arrows, real XMLUI expressions, comments, regex vs division |
| `tests/script/statements.test.ts` | Conformance table: every statement, imports and exports, ASI and restricted productions, real handler and code-behind snippets |
| `tests/script/diagnostics.test.ts` | Each diagnostic code with the source it points at; recovery (blocks, templates, unsupported constructs); the parser never throws |
| `tests/script/positions.test.ts` | Node spans; `offset` and `offsets` mapping |
| `tests/script/interpolation.test.ts` | Segments, XMLUI escape rules, positions (including entity-decoded text mapped back into the markup), errors and resumption |
| `tests/script/print.ts` | `print(node)`: S-expression form used by the tables (`a + b * c` → `(+ a (* b c))`) |
| `tools/xmlui-corpus.test.ts` | All script inside every `.xmlui` file of the XMLUI repo, and its `.xs` files, parses with zero diagnostics |
| `bench/script.bench.ts` | Throughput: typical bindings and a 15-line handler |

## Measured

- **Corpus** (permanent test):
  - inside 105 `.xmlui` files: 33 handler attributes, about 3,300
    attribute values (376 containing `{`), 212 text nodes and 8 `<script>`
    blocks;
  - 10 `.xs` files;
  - all parse cleanly. Two unused `export const` fixtures are explicitly
    excluded; XMLUI itself rejects `const` in modules.
- **Docs samples** (one-off check): 5,728 script snippets inside the 1,735
  docs code samples whose markup parses. 89 samples report errors. Nearly
  all are deliberate placeholders (`data='{[...]}'`) or attributes the
  check classified wrongly (function-valued props such as `validate="(d) => …"`
  need component metadata to classify). Two real findings:
  - a line break before `=>`, now allowed;
  - `await` in handlers. The newer Managed React docs use it, but XMLUI's
    runtime rejects it, so gfui reports S030 (an open question in the step
    plan).
- **Performance** (`npm run bench`): a typical binding parses in about
  2 µs; a 15-line handler in about 15 µs.
