# Markup parser

> Subsystem reference for `packages/compiler/src/markup/`. Describes the
> code as it is. Design rationale and XMLUI comparison:
> [`../plan/poc-01-markup-parser.md`](../plan/poc-01-markup-parser.md).
>
> **Last updated:** step 2 (attribute values are now entity-decoded).

## Role

The first compiler stage: `.pfui` markup text becomes a **syntax tree** with
source positions on every node, plus a list of **diagnostics**. It is purely
syntactic. It does **not**:

- parse `{expressions}`: attribute values and text stay as raw strings
  (step 2 adds the expression parser);
- collapse whitespace, interpret helper tags (`<property>`, `<event>`,
  `<variable>`, `<method>`), validate `<Component>` definitions, resolve
  namespaces, or enforce the single-root rule. Those belong to the later
  semantic stage.

## API

Exported from `@patchfuil/compiler`:

| Export | Kind | Purpose |
|--------|------|---------|
| `parseMarkup(text)` | function | Returns `{ document, diagnostics }`. Never throws. |
| `DocumentNode`, `ElementNode`, `AttributeNode`, `AttributeValue`, `TextNode`, `CommentNode`, `CDataNode`, `ScriptNode`, `ContentNode`, `MarkupNode`, `Name`, `Span` | types | The syntax tree |
| `MarkupDiagnostics`, `MarkupDiagnosticCode` | const, type | Diagnostic codes and their message builders |
| `decodeEntities(raw)` | function | The entity decoder (text content and attribute values) |
| `decodeEntitiesWithOffsets(raw, start)` | function | Decodes and records the file offset of each decoded character, for mapping script positions back into the raw markup |
| `LineMap`, `Position` | class, type | Offset ↔ 0-based line/column (`src/source/line-map.ts`) |
| `Diagnostic`, `Severity`, `formatDiagnostic` | types, function | Shared diagnostic shape and 1-based `file:line:col` formatting (`src/source/diagnostic.ts`) |

## Files

| File | Contents |
|------|----------|
| `src/markup/ast.ts` | Syntax tree types |
| `src/markup/parser.ts` | `parseMarkup` and the `MarkupParser` class |
| `src/markup/diagnostics.ts` | `MarkupDiagnostics`: code → message builder |
| `src/markup/entities.ts` | `decodeEntities` |
| `src/source/line-map.ts` | `LineMap` (shared by all compiler stages) |
| `src/source/diagnostic.ts` | `Diagnostic`, `formatDiagnostic` (shared by all compiler stages) |

## Syntax tree

All positions are **UTF-16 offsets** (JavaScript string indices) into the
source; `end` is exclusive. `LineMap` converts them to 0-based line and
column; `formatDiagnostic` prints them 1-based.

| Node | Key fields |
|------|------------|
| `DocumentNode` | `children: ContentNode[]` (top level may hold several elements and text) |
| `ElementNode` | `name: Name`, `attributes`, `children`, `selfClosing`, `openTag: Span`, `closeTag?: Span` (absent when self-closing or never closed), `tagComments?: CommentNode[]` (comments inside the start tag) |
| `AttributeNode` | `name: Name`, `value?: AttributeValue` (absent for a valueless attribute) |
| `AttributeValue` | `value` (entities decoded), `raw` (as written), `quote` (`"`, `'` or `` ` ``), `inner: Span` (inside the quotes; expression positions start here) |
| `TextNode` | `value` (entities decoded), `raw` (as written). Whitespace-only text between elements is kept. |
| `CommentNode` | `value` (between `<!--` and `-->`) |
| `CDataNode` | `value` (between `<![CDATA[` and `]]>`) |
| `ScriptNode` | `content`, `contentSpan` (between `<script>` and `</script>`) |
| `Name` | `prefix?`, `local`, `full` (`prefix:local`), span |

## Lexical rules (XMLUI-compatible)

| Construct | Rule |
|-----------|------|
| Names | Start: ASCII letter, `_`, `$`. Continue: also digits, `-`, `.`. Optional `prefix:` |
| Attribute values | Quoted with `"`, `'` or `` ` ``; no escape sequences; may span lines. Entities are decoded, as in XMLUI's `transform.ts` (`parseEscapeCharactersInAttrValues`), so `when="{a &amp;&amp; b}"` works. |
| Valueless attributes | Allowed: `<Component receivesContextVars>` |
| Text content | Runs up to the next `<`. |
| Entities (text and attribute values) | Decoded: `&amp; &lt; &gt; &quot; &apos; &nbsp;`. Unknown `&…;` is kept literally, with no diagnostic. No numeric references. |
| Comments | `<!-- … -->` as content, and also **inside a start tag** between attributes |
| CDATA | `<![CDATA[ … ]]>` |
| Script | Exactly `<script>` … `</script>`; the content is raw |
| Whitespace in tags | The XMLUI set: ASCII whitespace plus the Unicode spaces and BOM |

## Diagnostics

All are errors. Each points at the offending source (a zero-width span
where something is missing).

| Code | Message (pattern) | Points at |
|------|-------------------|-----------|
| M001 | Invalid character '…' in a tag | The character |
| M002 | Unterminated string | The opening quote |
| M003 | Unterminated comment | `<!--` |
| M004 | Unterminated CDATA section | `<![CDATA[` |
| M005 | Unterminated `<script>` section | `<script>` |
| M006 | Tag name expected | `<` or `</` |
| M007 | Attribute name expected | The stray string or `=` |
| M008 | Attribute value expected after '=' | `=` |
| M009 | '>' or '/>' expected | Zero-width, where it was expected |
| M010 | Closing tag `</X>` does not match the open element `<Y>` | The closing tag |
| M011 | Element `<X>` is not closed | The element's name |
| M012 | Closing tag `</X>` has no matching open element | The closing tag |
| M013 | Duplicate attribute '…' | The second name |
| M014 | Name expected after 'prefix:' | `prefix:` |
| M015 | Attribute name '…' must start with a lowercase letter (not checked for prefixed names) | The name |

## Implementation

- `MarkupParser` is a single-pass, **iterative** parser with no separate
  tokenizer. Content mode reads text up to the next `<`; at `<` it
  dispatches to comment, CDATA, script, closing tag or opening tag.
- Open elements live on an explicit stack (`openElements`), so nesting depth
  is not limited by the call stack (tested at 20,000 levels).
- **Recovery:**
  - `<` not followed by a name becomes a text node `"<"` (M006).
  - A start tag broken by `<` or the end of the input is closed where it
    stops and gets no children (M009).
  - Unexpected characters inside a tag are skipped (M001).
  - A closing tag matching an ancestor closes the elements in between
    (M011 for each; they end where the closing tag starts).
  - A non-matching closing tag is reported and ignored (M010 or M012).
  - Elements still open at the end extend to the end of the input (M011).
- Diagnostics are created with `report(code, span, ...messageArgs)`, typed
  against `MarkupDiagnostics`.

## Tests

| File | Covers |
|------|--------|
| `tests/markup/parser.test.ts` | Conformance table of valid markup (tree shapes via `summarize`), node details, empty input, 20,000-level nesting |
| `tests/markup/positions.test.ts` | Spans of elements, tags, names, attributes, value inner spans, raw sections; UTF-16 offsets after astral characters |
| `tests/markup/diagnostics.test.ts` | Conformance table: each code, with the source text it points at; zero-width offsets; valid look-alikes; messages |
| `tests/markup/recovery.test.ts` | Tree shape after each kind of error; implicit-close spans; the parser never throws |
| `tests/markup/entities.test.ts` | Entity decoding table |
| `tests/source/line-map.test.ts` | `\n`, `\r\n` and `\r`; round trip `offsetAt(positionAt(o)) === o`; clamping; `formatDiagnostic` |
| `tests/markup/helpers.ts` | `summarize(document)` (compact tree form for tables), `sliceOf` |
| `tools/xmlui-corpus.test.ts` | Every `.xmlui` file in the XMLUI repo (105 files) parses with zero diagnostics |
| `bench/markup.bench.ts` | Throughput on generated realistic markup: 10 KiB, 100 KiB, 1 MiB |

## Measured

- **Performance** (`npm run bench`, Apple Silicon, under Vitest's module
  runner, which adds roughly 15–20%): 10 KiB ≈ 0.04 ms, 100 KiB ≈ 0.45 ms,
  1 MiB ≈ 8 ms (about 120 MB/s).
- **XMLUI docs samples** (one-off check, not a permanent test): of 1,764
  `xmlui` and `xmlui-pg` code-fence segments in the XMLUI website docs, 30
  produce diagnostics. All of them are deliberate fragments (unclosed
  snippets, `...` placeholders, directory trees). This check is what
  revealed comments inside start tags, which are now supported.
