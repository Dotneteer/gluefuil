# Step 1: Markup parser

**Status:** Done; awaiting review

Part of [poc-steps.md](poc-steps.md).

## Goal

Turn `.pfui` markup text (XMLUI's markup syntax) into a syntax tree with exact source positions on every
node, with error recovery and located diagnostics. This is the first stage
of the compiler. It must accept everything XMLUI's markup parser accepts.

## Background (XMLUI)

Sources: `xmlui/src/parsers/xmlui-parser/scanner.ts`, `parser.ts`,
`transform.ts`, `diagnostics.ts`; `.ai/xmlui/parsers.md`.

- **Names:** start with an ASCII letter, `_` or `$`; continue with letters,
  digits, `_`, `$`, `-` and `.`. This allows `var.count`, `when-md` and
  `method.reset`. An optional `prefix:` namespace is allowed
  (`xmlns:Ext`, `<Ext:Gauge>`).
- **Attribute values:** quoted with `"`, `'` or `` ` `` and no escapes, so
  choosing the quote is how you embed the other two. Values may span lines.
  **Entities are not decoded in attribute values.** A valueless attribute
  (`<Component receivesContextVars>`) is allowed.
- **Text content:** ends at the next `<`, so `{a < b}` in text needs
  `&lt;`. Entities are decoded in text only (`&amp; &lt; &gt; &quot; &apos;
  &nbsp;`); unknown `&…;` sequences are kept literally without a diagnostic.
- **Raw sections:** `<!-- … -->` comments, `<![CDATA[ … ]]>`, and
  `<script> … </script>` (exactly `<script>`, without attributes), whose
  content is not parsed as markup.
- **Expressions** (`{…}`) are opaque at this stage; the scripting parser
  (step 2) handles them.
- Whitespace collapsing, helper-tag rules (`<property>`, `<event>`, …),
  `<Component>` rules, namespace resolution and the single-root rule all
  happen in XMLUI's *transform* stage, after parsing.

## Design

**Scope:** the syntax layer only, matching XMLUI's `parser.ts`. The
semantic checks listed in the last bullet above belong to a later
markup-to-component-tree stage. That is a change from poc-steps.md, which
had put helper-tag recognition here; the semantic stage is a better home
for it.

**API** (`@patchfuil/compiler`):

```ts
parseMarkup(text: string): { document: DocumentNode; diagnostics: Diagnostic[] }
new LineMap(text).positionAt(offset) / .offsetAt(position)   // 0-based line and column
formatDiagnostic(diagnostic, lineMap, fileName?)             // "file:line:col: error M010: …" (1-based)
```

**Tree:** `document`, `element`, `attribute`, `text`, `comment`, `cdata`,
`script`. Every node has `start`/`end` offsets. Elements also record name,
open-tag, close-tag and self-closing information. Attributes record name and
value spans, where the value span covers the content **inside** the quotes,
which is where expression positions for source maps start. Text nodes keep
both the decoded `value` and the `raw` source.

**Positions** are UTF-16 offsets (JavaScript string indices). `LineMap`
converts them to 0-based line and column, handling `\n`, `\r\n` and `\r`.

**Parsing strategy:** a hand-written, single-pass, iterative parser (an
explicit stack, so deep nesting can't overflow the call stack). There is no
separate token stream; the parser switches between content mode and tag
mode.

**Diagnostics** (our own codes, prefixed `M`; all errors):

| Code | Meaning | XMLUI equivalent |
|------|---------|------------------|
| M001 | Invalid character in a tag | W001 |
| M002 | Unterminated string | W002 |
| M003 | Unterminated comment | W007 |
| M004 | Unterminated CDATA section | W008 |
| M005 | Unterminated `<script>` | W009 |
| M006 | Tag name expected | U004 / U019 |
| M007 | Attribute name expected | U009 / U020 / U042 |
| M008 | Attribute value expected after `=` | U011 |
| M009 | `>` or `/>` expected | U006 / U008 |
| M010 | Closing tag doesn't match the open element | U007 |
| M011 | Element is not closed | (implicit) |
| M012 | Closing tag without an open element | U017 |
| M013 | Duplicate attribute | U012 |
| M014 | Name expected after `prefix:` | U014 / U016 |
| M015 | Attribute names must start with a lowercase letter | U013 |

**Recovery:**

- A closing tag that matches an ancestor closes the elements in between
  (M011 for each).
- A closing tag that matches nothing is reported (M012) and ignored.
- A broken start tag is closed where it stops.
- Every element still open at the end of the file gets M011.

## Steps

- [x] `LineMap` and diagnostics infrastructure
- [x] AST types, entity decoding
- [x] Parser with recovery
- [x] Conformance tests: tree shapes, positions, diagnostics, recovery
- [x] Compatibility test: every `.xmlui` file in the XMLUI repo parses
      without diagnostics
- [x] Benchmark
- [x] The smoke app runs the parser in a real browser (E2E)

## Verification

- Unit: `packages/compiler/tests/markup/*.test.ts`
- Compatibility: `tools/xmlui-corpus.test.ts` (skipped if the XMLUI repo
  isn't present)
- Benchmark: `npm run bench`
- E2E: `e2e/smoke.spec.ts`

## Findings

- **Comments inside start tags.** XMLUI's scanner treats comments as trivia
  in tag mode, so `<App <!-- note --> var.x="…">` is valid. The background
  research above missed this; a one-off check of the XMLUI docs' code
  samples found it. It is now supported, and such comments are kept on
  `ElementNode.tagComments`.
- **Docs code samples:** of 1,764 `xmlui` and `xmlui-pg` fence segments in
  the XMLUI website docs, 30 produce diagnostics, all of them deliberate
  fragments. Not made a permanent test, because fragments would need an
  allowlist that changes whenever the docs change.
- **Corpus:** all 105 `.xmlui` files in the XMLUI repo parse with zero
  diagnostics (`tools/xmlui-corpus.test.ts`).
- **Performance:** about 120 MB/s (1 MiB in about 8 ms), measured under
  Vitest's module runner, which adds roughly 15–20%.
- **Vitest 5** changed its benchmark API: benchmarks are tests that use the
  `bench` fixture.

## Open questions

1. **Brace-aware text.** Should `<` inside `{…}` in text content be allowed
   (`<Text>{a < b}</Text>`)? XMLUI ends text at `<`. Supporting it means
   tracking balanced braces and strings inside text: a compatible extension,
   but more scanner complexity. Not done in this step.
