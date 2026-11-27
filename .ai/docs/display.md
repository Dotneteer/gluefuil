# Display components, icons and Markdown

> Subsystem reference: the step 23 batch (text and display). Describes the
> code as it is. Design, XMLUI comparison and decisions:
> [`../plan/poc-23-display.md`](../plan/poc-23-display.md).
>
> **Last updated:** step 23.

## The components

| Component | File | Built on | Props | Events | API |
|-----------|------|----------|-------|--------|-----|
| `Icon` | `icons.tsx` | The icon registry (Lucide drawings) | `name`, `fallback`, `size` (`xs` 12px, `sm` 16, `md` 24, `lg` 32, or a CSS size / `$token`) | `click` | |
| `Image` | `display.tsx` | Mantine `Image` | `src` (none: nothing), `alt`, `fit` (`contain`, `cover`), `aspectRatio` (`1.5`, `16/9`), `lazyLoad`, `inline`, `grayscale` | `click` | |
| `Avatar` | `display.tsx` | Mantine `Avatar` | `name` (up to three initials, the label), `url`, `size` (`xs`…`xl` or a CSS size) | `click`, `contextMenu` | |
| `Badge` | `display.tsx` | Mantine `Badge` | `value` or children, `variant` (`badge`, `pill`), `colorMap` | `contextMenu` | |
| `ProgressBar` | `display.tsx` | Mantine `Progress` | `value` 0…1 (clamped) | | |
| `Spinner` | `display.tsx` | Mantine `Loader` | `delay` (400 ms), `fullScreen` | | |
| `ContentSeparator` | `display.tsx` | Mantine `Divider` | `orientation`, `thickness`, `length` | | |
| `Card` | `display.tsx` | Our `Stack` (a surface) | `title`, `subtitle`, `avatarUrl`, `showAvatar`, `avatarSize`, `linkTo`, `orientation`, alignments | `click`, `doubleClick`, `contextMenu` | `scrollToTop`, `scrollToBottom`, `scrollToStart`, `scrollToEnd` |
| `Text` | `text.tsx` | Our own (step 16) | + `overflowMode`, `breakMode`, `ellipses`, `preserveLinebreaks`, `inline` | `contextMenu` | `hasOverflow()` |
| `Heading`, `H1`–`H6` | `text.tsx` | Our own (step 16) | + the overflow props, `showAnchor` | | `hasOverflow()`, `scrollIntoView()` |
| `Link` | `routing.tsx` | Our own (step 19) | + `icon`, `target`, `enabled`, `active`, `noIndicator`, the overflow props; `to` optional; URLs | `click` | |
| `Markdown` | `markdown.tsx` (+ `markdown-render.tsx`, `markdown-html.ts`) | Our renderer, a lazy chunk | `content`, `data`, nested text, `removeIndents`, `allowHtml`, `interpolateBindings`, `openLinkInNewTab`, `showHeadingAnchors`, `grayscale`, `truncateLinks` | | |

- **Every handler gets no arguments** (the sandbox invariant). Clickable
  icons, images and avatars are also buttons for the keyboard (`role="button"`,
  a tab stop, Enter and Space).
- **Theme variables:** XMLUI's names and defaults, only the ones the
  components read (`metadata.ts`); the CSS is `DISPLAY` and `TEXT_OVERFLOW` in
  `styles.ts`. Mantine's own variables (`--avatar-size`, `--progress-size`,
  `--loader-color`, `--divider-color`, …) are set from ours by unlayered rules,
  as in step 16 ([mantine.md](mantine.md)).
- **Mantine's CSS** for `Avatar`, `Badge`, `Divider`, `Image`, `Loader` and
  `Progress` is part of `MANTINE_STYLESHEET`.

### Details

- **`Avatar`** keeps the URL that failed to load and passes `src={null}` for
  it. Mantine's own error state is reset by an effect after mount, so an
  image that fails before it (a cached 404, a bad `data:` URL) stayed broken.
  Found by the E2E test.
- **`Badge colorMap`:** a value's entry is a color (the background) or
  `{ label, background }`; `$tokens` work. It sets `--gfui-badge-bg` and
  `--gfui-badge-color` inline; the CSS falls back to the theme's. A pill
  reads `backgroundColor-Badge-pill` (and the like) before the badge's.
- **`Spinner`** renders nothing until its delay passes, also on the server.
- **`ContentSeparator`:** a horizontal line is `length-ContentSeparator`
  wide; a vertical one stretches to its row unless it has a `length`.
- **`Card`** renders `Stack` with three internal props (`$$className`,
  `$$element`, `$$before`): it is a stack with `data-surface`, so the ladder
  gives it padding and gaps ([layout.md](layout.md)). The title row
  (`$$before`) counts against the wrapper rule: with a title, a lone child is
  one level deeper. A horizontal card wraps, with the title row on a line of
  its own. The second click of a double click is not a `click` (XMLUI).
- **`Link`:**
  - a URL with a scheme (`https:`, `mailto:`) or `//` is external
    (`isExternalUrl`): the href as given, the browser follows it;
  - a `target` other than `_self` leaves the click to the browser, with
    `rel="noopener noreferrer"`;
  - `enabled="false"` renders no href and `aria-disabled`;
  - without `to`, a link with `click` is a button.
- **`Heading showAnchor`:** the id is the text lowercased, punctuation
  removed and spaces as dashes (`headingId`). Since step 32 every heading with
  text has this id (XMLUI gives every heading an anchor) and registers for the
  TableOfContents unless `omitFromToc`; `showAnchor` adds the `#` link. It is computed while rendering,
  so it is in the prerendered HTML too; XMLUI computes it after mount from
  the DOM, and keeps only ASCII word characters. The `#` link scrolls (a
  `#id` href would be a route under hash routing).

## Text overflow (`textOverflow`, text.tsx)

One helper for `Text`, `Heading` and `Link`, as XMLUI's `TextReact.tsx`
(429–540). It returns data attributes; the CSS is `TEXT_OVERFLOW` in
`styles.ts`.

| Props | Result |
|-------|--------|
| `maxLines="1"`, or `overflowMode="ellipsis"` | `data-overflow="truncate"`: one line, an ellipsis |
| `maxLines` > 1 (with or without `ellipsis`) | `data-overflow="clamp"` and `-webkit-line-clamp` |
| `ellipses="false"` with a truncation | `data-clip` (no ellipsis) |
| `overflowMode="none"`, `scroll`, `flow` | `data-overflow` of that name; `maxLines` is ignored |
| `inline="true"` | `data-inline` (`display: inline`); the overflow props are ignored |
| `breakMode` | `data-break` |
| `preserveLinebreaks="true"` | `data-preserve-linebreaks` (`white-space: pre-wrap`) |

## Icons (`icons.tsx`, `icon-names.ts`)

- **The registry** maps names to Lucide components: XMLUI's 132 names
  (`xmlui/src/components/icons-abstractions.ts`: `trash`, `email`,
  `chevronright`, `plus-circle`, …) and the 7 the App shell used before
  (`settings`, `chart`, `chevronRight`, …).
- **Only these icons are bundled** (static imports).
- **`registerIcon(name, component)`** adds one: a Lucide icon or any
  component that renders an `<svg>` from SVG props. `lookupIcon(name)` and
  `registeredIconNames()` read the registry.
- **`ICON_NAMES`** (`icon-names.ts`, React-free) is the same list for the
  compiler; a unit test keeps the two equal.
- **Contracts:** a literal `Icon name`/`fallback`, `Link icon`, `NavLink icon`
  or `NavGroup icon` outside `ICON_NAMES` is **E033, a warning** (an app may
  register the name), with "did you mean". The prop metadata says so with
  `knownValues`.
- **`Glyph`** is the components' own use (the shell's nav icons, `Link`'s
  icon): 20px, `aria-hidden`.

## Markdown

### Where the text comes from

`content` wins, then the nested text, then `data` (a URL, loaded once through
the data layer with `useDataUrlState`; a JSON string or a text response).
`removeIndents` (default true) removes the common indent and the blank lines
at both ends.

### The nested text is raw; `@{…}` is compiled

- **`rawText: true`** in Markdown's metadata makes the compiler keep the
  element's content as written: text (entities decoded) and CDATA joined, no
  `{…}` interpolation, no whitespace collapsing. An element inside is
  **E034**.
- **`@{expression}`** in that text is split out by
  `compiler/src/script/markdown-bindings.ts` (`parseMarkdownBindings`):
  - code fences (``` and ~~~, at most three spaces of indent; a longer
    marker of the same kind closes) and inline code spans keep it;
  - `\@{` is a literal `@{`;
  - an empty `@{}` is removed (XMLUI);
  - an unclosed one is S040.
- **The parts compile into one binding,** an array literal of the strings
  and the expressions (`compile-module.ts` `rawText`). It is sandboxed and
  resolved like any binding (C001, C002, …), and reactive. The component
  receives it as `$$parts` and joins it with `bindingText`: nullish is empty,
  a function `[function]`, an object JSON. Without an `@{…}`, the text is a
  plain string child.
- **`interpolateBindings="false"`** (literal only) keeps `@{…}` as written.
- **Runtime strings are never interpolated:** a bound `content` or loaded
  `data` renders `@{…}` as text. *Divergence:* XMLUI evaluates `@{…}` in
  every content source (`parse-binding-expr.ts`).

### The renderer (`markdown-render.tsx`, a lazy chunk)

- **`mdast-util-from-markdown`** with `micromark-extension-gfm` and
  `mdast-util-gfm`: tables, task lists, strikethrough, autolinks, footnotes.
- **The mdast becomes React elements:**
  - headings are `Heading` (with `showHeadingAnchors`, an id from the text);
  - inline code is `Text variant="code"`;
  - links are `Link`, so routes go through the router and
    `openLinkInNewTab` sets the target; `#id` links scroll;
  - code blocks are `<pre class="gfui-Markdown-code"><code data-language>`;
  - task items get a disabled checkbox;
  - tight lists have no paragraphs;
  - references resolve through the definitions;
  - footnotes render at the end.
- **Unsafe URLs** (`isSafeUrl`: only relative, `http(s)`, `mailto`, `tel`) make a
  link its text and an image its alt text.

### Raw HTML: the allowlist (`markdown-html.ts`)

- **`tokenizeHtml`** splits raw HTML into allowed tags and text:
  - a tag outside `ALLOWED_TAGS` (formatting, tables, lists, `details`, `img`,
    `a`, …; no `script`, `style`, `iframe`, `form`, `input`) stays in the
    text as written;
  - attributes are filtered per tag: the global `title`, `lang`, `dir`, plus
    `href`/`target` on `a`, `src`/`alt`/`width`/`height` on `img`,
    `colspan`/`rowspan`/`align` on cells, …;
  - URL attributes must be safe;
  - comments are dropped;
  - character references are decoded.
- **Inline HTML** comes as separate mdast nodes (`<b>`, text, `</b>`). The
  renderer keeps a stack of open tags that the following nodes render into. A
  closing tag closes the nearest open one of its name; a stray one is
  dropped; what is still open closes at the end of the parent.
- **`allowHtml="false"`** renders every raw HTML node as text.
- *Divergence:* XMLUI passes every known HTML and SVG tag through
  `rehype-raw`, `script` included (`MarkdownReact.tsx` `KNOWN_HTML_TAGS`).

### Lazy loading, prerendering and hydration

- **`markdown.tsx`** holds `lazyResource(() => import("./markdown-render"))`
  (`runtime/src/render/lazy.ts`).
- **`MarkdownBody` calls `use()` on its promise on every render** (React
  requires it), inside a `Suspense` boundary with an empty fallback. A loaded
  promise is marked fulfilled (React's thenable protocol), so `use()`
  returns at once.
- **In a browser,** the boundary is empty until the chunk arrives.
- **On the server** (`renderToString`), the body suspends: the load is
  recorded with `noteServerLoad`. The prerender
  (`vite-plugin/src/prerender.ts`) takes the loads with `takeServerLoads()`
  after each render. If there were any, it awaits them and renders the route
  again, up to 4 times.
- **Hydration** keeps the server HTML of a boundary that is still waiting for
  the chunk, and hydrates it when the chunk arrives: no DOM node changes.
  - **The boundary is memoized** (`MarkdownBoundary`, on the text and the
    flags). A still-dehydrated boundary that receives any update makes React
    drop the server HTML and render it again. The takeover's own re-render
    of the App did exactly that before the memo; the E2E takeover test found
    it.
  - **A prerendered page starts loading the chunk** when `markdown.tsx` is
    evaluated, if the document has prerendered Markdown.
- **`preloadMarkdown()`** starts the load (tests use it).
- **Standalone mode** inlines the chunk: `gfui.js` stays one file.

## Size

| Build | Before step 23 | After | Notes |
|-------|----------------|-------|-------|
| Hello app, entry chunk | 603 KB (173 KB gzipped) | 674 KB (193 KB gzipped) | Lucide's 139 icons are about 62 KB before minification; the rest is the new components and Mantine's parts |
| Hello app, Markdown chunk | — | 90 KB (26 KB gzipped) | Loaded only when a Markdown renders |
| Hello app, `index.html` (prerendered, CSS inlined) | 149 KB (20 KB gzipped) | 177 KB (24 KB gzipped) | Mantine's CSS of six more components, our CSS, the new demo section |
| `gfui.js` (standalone, one file) | 734 KB | 923 KB (270 KB gzipped) | Markdown inlined |

## Files

| File | Contents |
|------|----------|
| `components/src/display.tsx` | `Image`, `Avatar`, `Badge`, `ProgressBar`, `Spinner`, `ContentSeparator`, `Card`, `initials` |
| `components/src/icons.tsx` | The registry, `Icon`, `Glyph`, `registerIcon`, `lookupIcon`, `iconSize` |
| `components/src/icon-names.ts` | `ICON_NAMES` (React-free) |
| `components/src/text.tsx` | `Text`, `Heading`, `textOverflow`, `headingId`, `contextMenuHandler`, `mergeStyles` |
| `components/src/routing.tsx` | `Link`, `isExternalUrl` |
| `components/src/markdown.tsx` | `Markdown`, `removeIndents`, `bindingText`, `preloadMarkdown` |
| `components/src/markdown-render.tsx` | The lazy renderer: `renderMarkdown`, `parseMarkdown` |
| `components/src/markdown-html.ts` | `tokenizeHtml`, `isSafeUrl`, `decodeHtmlEntities`, `ALLOWED_TAGS` |
| `compiler/src/script/markdown-bindings.ts` | `parseMarkdownBindings` |
| `runtime/src/render/lazy.ts` | `lazyResource`, `noteServerLoad`, `takeServerLoads` (`@gluefuil/runtime/server`) |

## Tests

| File | Covers |
|------|--------|
| `components/tests/display.test.tsx` | The icon registry and the compiler's list; icons (fallback, sizes, click and keyboard, `registerIcon`, E033); Image; Avatar (initials, the error fallback, sizes); Badge `colorMap`; ProgressBar clamping; Spinner delay; ContentSeparator; Card (levels, the title row, `linkTo`, click versus double click, the scroll API); Link (external, target, enabled, click, icon); the text-overflow table; `hasOverflow`, `scrollIntoView`, anchors, `contextMenu` |
| `components/tests/markdown.test.tsx` | A Markdown → HTML conformance table (GFM); the HTML allowlist table; `isSafeUrl`; the tokenizer; content sources, `removeIndents`, reactive `@{…}`, anchors, the flags, router links, a `data` URL from a mock backend |
| `components/tests/markdown-lazy.test.tsx` | Without the chunk: a server render records the load and the next render has the content; one cached load; a client render after it |
| `compiler/tests/script/markdown-bindings.test.ts` | The `@{…}` splitting table (fences, code spans, escapes, empty ones); compiling a Markdown element (raw text, `$$parts`, CDATA, the sandbox, `interpolateBindings`, E034) |
| `runtime/tests/render/lazy.test.ts` | `lazyResource` (one load, the fulfilled marking), server loads |
| `tools/build-output.test.ts` | One entry chunk without the Markdown parser, plus the renderer's chunk |
| `e2e/ssg.spec.ts` (hello build) | Prerendered Markdown with JavaScript off; the takeover with the chunk held back changes no DOM node, and the Markdown is live afterwards |
| `e2e/playground-scenarios.spec.ts` (Icons, Images and avatars, Status indicators, Cards, Links and text, Markdown) | One test per step 23 scenario: the icon filter, sizes and selection; Image fit, aspect ratio, grayscale, inline, lazy; Avatar initials, a failed picture, sizes, clicks; badge colors of a `colorMap` (computed), a download, clamped bars, spinner delays (lower bounds only) and full screen, separator sizes; card selection by click and double click, a horizontal card's row, nesting levels and paddings, a themed card, a linked title; link kinds and `enabled`, overflow at 280 and 480 px, `hasOverflow()`, anchors and `scrollIntoView()`; Markdown samples, the allowlist and `allowHtml`, the flags, reactive `@{…}`, `interpolateBindings`, a `data` URL |
| `e2e/playground-scenarios.spec.ts` (Display) | Icons by mouse and keyboard; a failed picture's initials; Badge and ProgressBar colors from the theme (computed); the Spinner's delay; a clickable Card; link targets; truncation; Markdown (`@{…}`, code, the allowlist, a table, a `data` URL, a link that routes) |
