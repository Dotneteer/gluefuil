# Step 23: Text and display components

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the first batch of Phase F: `Text`,
`Heading`, `Link`, `Icon`, `Image`, `Avatar`, `Badge`, `ProgressBar`,
`Spinner`, `ContentSeparator`, `Card`, `Markdown`.

## Goal

```xml
<Card title="Ada Lovelace" subtitle="Analyst" avatarUrl="/ada.png" linkTo="/people/1">
  <HStack>
    <Icon name="email"/>
    <Link to="mailto:ada@example.com" icon="email" target="_blank">Write</Link>
    <Badge value="{person.status}" colorMap="{{ active: '$color-success-500', away: '$color-warn-500' }}"/>
  </HStack>
  <ProgressBar value="{person.progress}"/>
  <ContentSeparator/>
  <Markdown>
    ## Notes
    Last seen **@{person.lastSeen}**. See [the docs](/docs).
  </Markdown>
  <Spinner when="{people.inProgress}"/>
</Card>
```

- Twelve components exist with XMLUI's markup and their commonly used props.
- They take their look from theme variables only, as the step 16 built-ins do.
- `Card` is a surface of the spacing ladder (step 19E), so its padding and
  gaps are automatic.
- `Icon` has a real icon set (Lucide); `NavLink` and `NavGroup` use it too.
- `Markdown` renders GFM, routes its links through our router, and compiles
  `@{…}` in markup at build time (no evaluation of runtime strings).

## Background

### XMLUI (`website/content/docs/reference/components/*.md`, `xmlui/src/components/`)

- **Icon** (`Icon.md`): `name`, `fallback`, `size` (`xs`, `sm`, `md`, `lg`
  or a CSS size), `click`; theme var `size-Icon` (1.2em).
  - The registry (`components/IconProvider.tsx`, `icons-abstractions.ts`) has
    132 names of XMLUI's own drawings: `trash`, `email`, `home`, `chevronright`
    … all lowercase, a few with dashes (`plus-circle`, `eye-off`).
  - `component:name` looks up a component-specific icon
    (`IconReact.tsx` 190–225). Custom SVGs come from `resources`.
- **Image** (`Image.md`): `src`, `alt`, `fit` (`contain` default, `cover`),
  `aspectRatio`, `lazyLoad`, `inline`, `grayscale`, `data` (binary), `click`;
  `borderRadius-Image`, `borderColor-Image`.
- **Avatar** (`Avatar.md`): `name` (initials), `url`, `size` (`xs`…`xl`, `sm`
  default, or a CSS size), `click`; initials when the image fails to load.
  Theme vars: `backgroundColor-`, `textColor-`, `borderRadius-` (4px),
  `boxShadow-`, `fontWeight-Avatar`.
- **Badge** (`Badge.md`): `value` (or children), `variant` (`badge`, `pill`),
  `colorMap` (value → a color, or `{ label, background }`). Theme vars:
  `backgroundColor-`, `textColor-`, `borderRadius-`, `padding-`, `fontSize-`
  (0.8em), `textTransform-Badge` (uppercase), each also with `-pill`.
- **ProgressBar** (`ProgressBar.md`): `value` 0…1 (clamped). Theme vars:
  `backgroundColor-`, `color-indicator-`, `color-indicator-ProgressBar--complete`,
  `thickness-`, `borderRadius-ProgressBar`.
- **Spinner** (`Spinner.md`): `delay` (400 ms before it shows), `fullScreen`.
  Theme vars: `size-`, `thickness-`, `borderColor-Spinner`. It ignores the
  width and height props.
- **ContentSeparator** (`ContentSeparator.md`): `orientation`, `thickness`,
  `length`. Theme vars: `backgroundColor-`, `thickness-` (1px), `length-`
  (100%), margins.
- **Card** (`Card.md`): children laid out like a stack, plus prestyled
  `title`, `subtitle`, `avatarUrl`, `showAvatar` (initials of the title),
  `avatarSize`, `linkTo` (makes the title a link), `orientation`,
  `horizontalAlignment`, `verticalAlignment`; events `click`, `doubleClick`
  (a double click suppresses the second `click`); methods `scrollToTop`…
  Theme vars include `gap-Card`, `gap-title-Card`, `gap-avatar-Card`,
  `backgroundColor-Card--hover`.
- **Link** (`Link.md`), beyond what we have: `icon`, `target`, `enabled`,
  `active`, `noIndicator`, `maxLines`, `overflowMode`, `breakMode`,
  `preserveLinebreaks`, `click`.
- **Text** (`Text.md`), beyond what we have: `overflowMode` (`none`,
  `ellipsis`, `scroll`, `flow`), `breakMode`, `ellipses`, `preserveLinebreaks`,
  `inline`, `highlightText`/`highlightActiveIndex`/`segments` (search
  highlighting), `hasOverflow()`, `contextMenu`.
- **Heading** (`Heading.md`), beyond what we have: `showAnchor` (with
  `anchorTemplate`), `omitFromToc`, `ellipses`, `preserveLinebreaks`,
  `scrollIntoView()`, `hasOverflow()`.
- **Markdown** (`Markdown.md`; `components/Markdown/MarkdownReact.tsx`):
  - built on `react-markdown` 9, `remark-gfm` and `rehype-raw`;
  - content from `content`, `data` (a URL) or nested text (CDATA, or a code
    fence); `removeIndents` (default true) strips the common indent;
  - **raw HTML is on by default** (`allowHtml`): every known HTML and SVG tag,
    `script` and `style` included, passes through `rehype-raw`; unknown tags
    become `span` (`KNOWN_HTML_TAGS`, lines 57–90). There is no sanitizer;
  - **`@{expr}` is evaluated at runtime** in every content source, the
    `content` prop's runtime strings included (`parse-binding-expr.ts`);
    `interpolateBindings="false"` turns it off for data;
  - also `openLinkInNewTab`, `showHeadingAnchors`, `grayscale`, `truncateLinks`,
    `highlightText`, playground fences (`xmlui-pg`), code highlighting.

### Here

- `Text`, `Heading`/`H1`–`H6` and `Link` are our own (`components/src/text.tsx`,
  `routing.tsx`), with the props listed in [../docs/mantine.md](../docs/mantine.md).
- `components/src/icons.tsx` is a stopgap: 14 hand-drawn names for the shell
  (`poc-19a-app-shell.md`, *Open for later steps*: "an icon library").
- Layout props and the spacing ladder come from `useLayout`
  ([../docs/layout.md](../docs/layout.md)); the ladder plan reserved
  `layout: { surface: true }` for `Card` (`poc-19d-layout.md`, line 429).
- **Every built-in ships in every app:** a build of `test-apps/smoke`, which
  uses no `Select`, still contains it (measured for this plan). Whatever this
  step adds, every app pays for, unless it is split into a lazy chunk.

## Options considered

### The icon set

| Option | For | Against |
|--------|-----|---------|
| A. Tabler (`@tabler/icons-react`), behind our registry: XMLUI's 132 names mapped to Tabler icons, plus `registerIcon` for an app's own | Mantine's customary set; consistent, 5,000+ drawings; each icon is a small React component | Only the mapped icons ship (a name lookup can't reach the rest); a new dependency |
| B. Our own drawings, extended to XMLUI's names | No dependency | 130 hand-drawn icons of uneven quality |
| **C. Lucide** (`lucide-react`), behind the same registry | Popular, consistent, 1,500+ drawings | Not Mantine's set; same trade-offs as A |

**Chosen by the user: C.** Only the registry's icons are bundled (static
imports). An app adds its own icons with `registerIcon`.

### Markdown

| Option | For | Against |
|--------|-----|---------|
| A. XMLUI's stack (`react-markdown`, `remark-gfm`, `rehype-raw`), in the main bundle | Same parser and output as XMLUI | About 150 KB more for every app, used or not; `rehype-raw` brings `parse5` |
| **B. The same parser (micromark/mdast with GFM) and our own small mdast → React renderer, in a lazy chunk** | Apps without Markdown pay nothing; our `Heading`, `Link`, `Text code` render the elements; no `react-markdown` | The chunk must load before a prerendered page hydrates (see Design) |
| C. B, plus literal Markdown parsed at compile time into a tree | No parser at all when every Markdown is literal | The compiler gets a Markdown dependency; standalone mode carries it anyway; more work |

**Chosen by the user: B.** C stays an option if the measurements ask for it.

### Raw HTML inside Markdown

| Option | For | Against |
|--------|-----|---------|
| A. XMLUI's: every known tag passes | Compatible | `<script>`, `<iframe>`, `on*` attributes from data: the sandbox's purpose undone |
| **B. An allowlist: formatting, table, list, `details`, `img`, `a` tags; no `on*` or `style`; URLs only `http(s)`, `mailto`, relative** | Safe for data content; no `parse5` (a small tag tokenizer suffices for an allowlist) | Some XMLUI content renders as text |
| C. No raw HTML | Simplest | Loses tables with `colspan`, `details` |

**Chosen by the user: B.**

## Design

### Components

| Component | Built on | Props now | Deferred |
|-----------|----------|-----------|----------|
| `Icon` | Our registry, Lucide drawings | `name`, `fallback`, `size`; `click` | `component:name` lookups, `resources` SVGs |
| `Image` | Own `<img>` | `src`, `alt`, `fit`, `aspectRatio`, `lazyLoad`, `inline`, `grayscale`; `click` | `data` (binary) |
| `Avatar` | Mantine `Avatar` | `name` (initials), `url`, `size`; `click`; initials on a load error | `contextMenu` |
| `Badge` | Mantine `Badge` | `value`/children, `variant` (`badge`, `pill`), `colorMap` | `contextMenu` |
| `ProgressBar` | Mantine `Progress` | `value` (clamped 0…1), `--complete` color | |
| `Spinner` | Mantine `Loader` | `delay`, `fullScreen` | |
| `ContentSeparator` | Mantine `Divider` | `orientation`, `thickness`, `length` | |
| `Card` | Own, on `Stack` (a surface) | `title`, `subtitle`, `avatarUrl`, `showAvatar`, `avatarSize`, `linkTo`, `orientation`, alignments; `click`, `doubleClick`; `scrollToTop`/`Bottom`/`Start`/`End` | `contextMenu` |
| `Text` | Own (step 16) | + `overflowMode`, `breakMode`, `ellipses`, `preserveLinebreaks`, `inline`; `hasOverflow()` | search highlighting (`highlightText`, `segments`), `contextMenu` |
| `Heading` | Own (step 16) | + `showAnchor`, `ellipses`, `preserveLinebreaks`; `scrollIntoView()`, `hasOverflow()` | `anchorTemplate`, `omitFromToc` (step 32, `TableOfContents`) |
| `Link` | Own (step 19) | + `icon`, `target`, `enabled`, `active`, `noIndicator`, `maxLines`, `overflowMode`, `breakMode`; `click`; external URLs | |
| `Markdown` | Own renderer, lazy chunk | `content`, `data` (URL), nested text, `removeIndents`, `allowHtml`, `openLinkInNewTab`, `showHeadingAnchors`, `grayscale`, `truncateLinks`; `@{…}` in markup | `highlightText`, playground fences, code highlighting, `anchorTemplate` |

- **Shared text handling** (`overflowMode`, `breakMode`, `ellipses`,
  `maxLines`, `preserveLinebreaks`) moves into one helper used by `Text`,
  `Heading` and `Link`.
- **Theme variables** are XMLUI's names and defaults, limited to the ones the
  components read (no generated `borderLeftStyle-Badge-pill` lists).
- **Mantine's CSS** for `Avatar`, `Badge`, `Progress`, `Loader` and `Divider`
  joins `MANTINE_STYLESHEET`; their variables are redirected to ours, as in
  step 16.
- **`NavLink`/`NavGroup` icons** switch to the registry; the 14 stopgap names
  stay valid (they map to Lucide icons).
- **`Card` as a surface:** metadata `layout: { surface: true }`; `Card` renders
  a vertical (or horizontal) stack with `data-surface`, so the ladder gives
  it padding and gaps. The title row (avatar, title, subtitle) comes first.

### Markdown

- **Content:** `content` wins, then nested text, then `data` (a URL, loaded
  through the step 20 data layer, as `Items data` is). `removeIndents` as in
  XMLUI.
- **`@{expr}` is compiled, not evaluated.** In nested text and a literal
  `content`, the compiler turns each `@{…}` into a binding, so the sandbox
  checks it like any other expression; the component receives the text with
  the values inserted (objects as JSON, functions as a placeholder, as
  XMLUI). Runtime strings (a bound `content`, `data`) are never interpolated.
  - **Divergence:** XMLUI evaluates `@{…}` in runtime strings too, unless
    `interpolateBindings="false"`. We have no evaluator at runtime in a
    build, and evaluating data is what that prop exists to prevent. We accept
    `interpolateBindings` (false keeps `@{…}` literally in markup too).
  - `\@{` escapes; code fences and inline code keep `@{…}` as written.
- **Rendering:** `mdast-util-from-markdown` with the GFM extensions
  (tables, strikethrough, task lists, autolinks) → our renderer:
  `Heading` (with anchors), `Text` variants for `code`, `strong`, `em`,
  `del`; `Link` for internal links (router), `<a target=_blank rel=noopener>`
  for external ones; `Image` for images; plain elements for lists, tables,
  blockquotes, `hr`, `pre`.
- **Raw HTML:** the allowlist of Options B; anything else becomes text.
- **The lazy chunk and prerendering:** the renderer is a dynamic import.
  - The client starts loading it when a `Markdown` renders and shows nothing
    until it arrives.
  - **Prerendering:** the server path (`runtime/src/server.ts`) awaits the
    registered preloads before `renderToString`, so the static HTML has the
    rendered Markdown.
  - **Hydration:** `mountApp` awaits the same preloads before
    `hydrateRoot` when the prerendered HTML marks that it used them
    (a `data-gfui-preload` list on the root), so the first client render
    matches.

### Contracts

All new props in `metadata.ts` with types and enums. `Icon name` literals are
checked against the registry (a warning, so an app's `registerIcon` names
work).

## Steps

- [x] Plan accepted; dependencies chosen.
- [x] Icon registry with Lucide; `Icon`; `NavLink`/`NavGroup` on it.
- [x] Shared text overflow helper; `Text`, `Heading`, `Link` additions.
- [x] `Image`, `Avatar`, `Badge`, `ProgressBar`, `Spinner`, `ContentSeparator`.
- [x] `Card` as a surface.
- [x] Markdown: compile-time `@{…}`; renderer; HTML allowlist; lazy chunk,
      the prerender's second render, hydration that keeps the server HTML.
- [x] Playground: a Display scenario (and Markdown in it), with its E2E test.
- [x] Docs: `code-structure.md`, a new `.ai/docs/display.md`, `mantine.md`,
      `app-shell.md` (icons), `layout.md` (Card), `contracts.md`, `ssg.md`.
- [x] `npm run check`; bundle sizes measured.

## Verification

- **Unit (jsdom):** each component through compiled markup: props, defaults,
  events, the API; theme variable redirection; the contract errors. Markdown:
  a conformance table (markdown → HTML), `@{…}` compile cases (escape, fences,
  sandbox rejection), the HTML allowlist (each rejected tag and attribute).
- **E2E:** `Link` navigation (internal, external, `target`, disabled);
  Markdown rendering, its internal link navigating, prerendered Markdown with
  JavaScript off and a clean hydration; `Spinner` delay; `Avatar` falling back
  to initials on a broken image; computed colors of `Badge` `colorMap` and
  `ProgressBar` complete.
- **Bundle:** the main chunk's size before and after; the Markdown chunk's
  size; that an app without Markdown doesn't load it.

## Decisions (the user's)

1. **Icons:** Lucide (`lucide-react`) behind our registry.
2. **Markdown:** micromark/mdast with GFM and our own renderer, in a lazy chunk.
3. **Raw HTML in Markdown:** an allowlist.

## Outcome

Reference: [../docs/display.md](../docs/display.md).

- **The twelve components work** with XMLUI's markup.
  - `Icon` draws XMLUI's 132 names (plus the shell's 7) with Lucide;
    `registerIcon` adds more.
  - `Image`, `Avatar`, `Badge`, `ProgressBar`, `Spinner` and
    `ContentSeparator` are on Mantine.
  - `Card` is a Stack and a surface of the spacing ladder.
  - `Text`, `Heading` and `Link` gained the overflow props, anchors,
    external URLs, `target`, `enabled`, `icon` and their APIs.
- **`Markdown`:**
  - our renderer, on `mdast-util-from-markdown` with GFM, in a lazy chunk;
  - raw HTML through an allowlist;
  - `@{…}` compiled from the nested text as sandboxed, reactive bindings;
  - `content`, nested text or a `data` URL.
- **A prerendered page has its Markdown in the HTML,** and the takeover keeps
  it untouched while the chunk loads.
- **New diagnostics:** E033 (a warning: an unknown literal icon name) and
  E034 (an element inside Markdown).
- **Evidence:**
  - `npm run check` passes and prints no warnings: 2,697 unit tests in 95
    files, 188 E2E tests.
  - New tests: `display.test.tsx` (62), `markdown.test.tsx` (58),
    `markdown-lazy.test.tsx` (3), `markdown-bindings.test.ts` (20),
    `lazy.test.ts` (3); E2E: the Display scenario, the prerendered Markdown
    (JavaScript off, a takeover with the chunk held back), the chunk loaded
    only when needed.
- **The playground** has a Display overview and six focused scenarios
  (Icons, Images and avatars, Status indicators, Cards, Links and text,
  Markdown), each with an E2E test (added after the first review request).
- **Sizes (hello app):**
  - the entry chunk went from 603 KB (173 KB gzipped) to 674 KB (193 KB);
  - the Markdown chunk is 90 KB (26 KB gzipped);
  - `gfui.js` went from 734 KB to 923 KB (270 KB gzipped), with Markdown
    inlined.

### Findings

- **Every built-in ships in every app.** A build without `Select` contains
  it, so anything this step adds costs every app unless it is split. Lucide's
  139 registered icons are the largest part of the entry chunk's growth
  (about 62 KB before minification).
- **A dehydrated Suspense boundary must not be updated.** The first version
  lost the prerendered Markdown at takeover: the App's own re-render handed
  the still-waiting boundary a new element, and React dropped the server HTML
  and rendered it again. A memo on the boundary's inputs fixed it. The
  existing "takeover changes nothing" E2E test found it.
- **`use()` must be called on every render** of a component that suspended
  once; React reports a conditional `use()`. The cached promise is marked
  fulfilled (React's thenable protocol), so a loaded chunk doesn't suspend.
- **Mantine's Avatar loses a fast image error:** its effect resets the error
  state after mount, so a picture that fails before it (a `data:` URL, a
  cached 404) stays broken. Our Avatar remembers the failed URL. XMLUI's docs
  promise the initials fallback, but its source has none (`AvatarReact.tsx`
  renders the `<img>` whatever happens).
- **XMLUI's docs and source disagree on Avatar sizes:** the docs list `xl`;
  the source handles only `xs`–`lg` and treats `xl` as a custom CSS size. We
  have `xl` (16em).
- **The dev server must pre-bundle the lazy chunk's dependencies** up front
  (`optimizeDeps.include`). Otherwise it finds them on the dynamic import and
  reloads the page: the first E2E run failed two unrelated scenarios that
  way.
- **Inline raw HTML in Markdown comes as separate nodes** (`<b>`, text,
  `</b>`), so the renderer keeps a stack of open tags across siblings. An HTML
  block runs to the next blank line (CommonMark), which swallows a following
  Markdown line, as in XMLUI.

### Divergences from XMLUI

| XMLUI | gfui | Why |
|-------|------|-----|
| `@{…}` evaluated at runtime in every content source; `interpolateBindings="false"` for data | Compiled from the nested text only; runtime strings never evaluated; `interpolateBindings="false"` keeps markup's `@{…}` literal | No evaluator in a built app; the sandbox; data stays data |
| Nested Markdown text has its whitespace collapsed unless in CDATA, and `{…}` interpolated | The nested text is kept as written: whitespace, no `{…}` | Markdown's whitespace is meaning; `{` is common in Markdown |
| Raw HTML: every known HTML and SVG tag passes (`rehype-raw`), scripts included | An allowlist of tags and attributes, safe URLs only | The user's decision (safety for data content) |
| `react-markdown` + `rehype-raw` | Our renderer on mdast, a lazy chunk | The user's decision (bundle size) |
| 132 icons of XMLUI's own drawings | The same names, Lucide drawings | The user's decision |
| `Link to` | Optional (also in XMLUI's docs) | It was required in gfui before; a link with only `click` is a button |
| Heading anchor ids: computed after mount from the DOM, ASCII word characters | Computed while rendering, Unicode letters kept | In the prerendered HTML too |
| Avatar: no fallback when the picture fails (despite the docs) | The initials | The docs' promise |
| `ContentSeparator` vertical: `length-ContentSeparator` (100%) height, invisible without a parent height | Stretches to its row unless `length` is set | Works in an `HStack` without a height |
| Badge's 90 `border*`/`font*`/… theme variables | The ones it reads (8, and their `-pill` forms by name) | Generated lists add nothing |

### Open for later steps

- **Size:**
  - an icon referenced only by literal names could be imported at compile
    time instead of shipping the whole registry;
  - per-app tree-shaking of the built-ins in general (Findings).
- **Markdown:**
  - code highlighting;
  - `highlightText`;
  - XMLUI's playground fences (`xmlui-pg`);
  - `anchorTemplate`;
  - `removeBr`, `breakMode`, `overflowMode`;
  - literal Markdown parsed at compile time (option C).
- **Text:** search highlighting (`highlightText`, `highlightActiveIndex`,
  `segments`).
- **Heading:** `omitFromToc` and `anchorTemplate` (with `TableOfContents`,
  step 32).
- **Icons:** `component:name` lookups; SVG icons from `resources`.
- **`Image data`** (binary); `contextMenu` on Card and Badge exists, on
  Image and Icon it does not yet.
