# Steps 19A–19C: The App shell, redesigned

**Status:** Done

Part of [poc-steps.md](poc-steps.md). These steps are inserted between
step 19 (routing) and step 20 (data binding), at the user's request. They
replace the "App shell" half of the original step 19. The other half, the
layout primitives (`Stack` sizing, star sizing), is not part of this plan.

This plan refines [architecture.md](architecture.md) § "Area 6 (part): the
App shell", and answers its open questions with a recommendation each. The
user's answers are under *Decisions*; what changed while building it is under
*Outcome* and *Findings*.

## Goal

Keep XMLUI's App markup: `App`, `AppHeader`, `NavPanel`, `NavLink`,
`Pages`, `Footer`. Replace XMLUI's `layout` property and its
implementation with a small, predictable structure modelled on Mantine's
`AppShell`:

- the regions are fixed, and a region exists because it is in the markup;
- each region has a few independent settings;
- CSS places the regions; the structure of the DOM never changes.

```xml
<App>
  <AppHeader title="Acme"/>
  <NavPanel placement="side">
    <NavLink label="Home" to="/" icon="home"/>
    <NavLink label="Orders" to="/orders"/>
  </NavPanel>
  <Pages fallbackPath="/">
    <Page url="/"><H1>Home</H1></Page>
    <Page url="/orders"><H1>Orders</H1></Page>
  </Pages>
  <Footer>© Acme</Footer>
</App>
```

## Background

### XMLUI: the markup (keep)

Sources: `website/content/docs/reference/components/App.md`,
`AppHeader.md`, `NavPanel.md`, `Footer.md`.

- `App` is the root and the hub. Its children `AppHeader`, `NavPanel` and
  `Footer` are the regions, and the rest (usually `Pages`) is the content.
- `AppHeader` has `title`, `logoTemplate`, `titleTemplate`,
  `profileMenuTemplate` and `showLogo`.
- `NavPanel` holds `NavLink`/`NavGroup` items, and has `logoTemplate` and
  `footerTemplate`.
- `Footer` has `sticky`.
- `App` has `logo`, `logo-dark`, `logo-light`, `logoTemplate` and `name`.

### XMLUI: the layout (replace)

`App layout` takes 8 names. Each name bundles several independent
decisions: nav placement, whether the header spans the nav, what sticks,
what scrolls, and where the logo goes. The analysis is in
[architecture.md](architecture.md) § "Why XMLUI's `layout` is confusing".
The implementation shows where the complexity comes from:

| Where | What | Cost |
|-------|------|------|
| `xmlui/src/components/App/AppReact.tsx` L894–948 | `layoutConfigs`: 8 entries of 9 flags (`containerScrollRef`, `navPanelInHeader`, `showCondensedHeader`, `useVerticalFullHeaderStructure`, …) | Flags interact; not every combination is meaningful |
| `AppReact.tsx` L605–662 | **Three different render trees**, chosen by those flags | The DOM changes shape with the layout name |
| `AppReact.tsx` L326–333 | Nav visibility is computed in JavaScript from a media query, with a special rule for condensed layouts and for "no header" | The server can't know the width, so a prerender is right only at one width |
| `AppReact.tsx` L344–372 | Header and footer heights are **measured** (`ResizeObserver`) into `--header-height`/`--footer-height`, except for three named layouts; the scrollbar width is measured too | Layout depends on a render after measuring |
| `AppReact.tsx` L336–341, L603 | Two scroll containers (`pageScrollRef`, `contentScrollRef`), picked by `scrollWholePage` and the layout | Plus `fitContent`, which overrides `scrollWholePage` |
| `AppReact.tsx` L560–566 | `condensed` **generates** an `AppHeader` when there is none | A hidden component |
| `AppHeader/AppHeaderReact.tsx` L172–194 | `AppHeader` branches on its parent's layout name (hides the logo in `vertical*`, renders the nav inside itself in `condensed*`) | The regions are coupled to the layout names |
| `App/AppLayoutContext.ts` | A 20-field context through which regions register and read the layout | Runtime registration of what the markup already says |
| `App/App.module.scss` (515 lines), `App-layout.spec.ts` (2,442), `App-layout-mobile.spec.ts` (1,741) | | The size of the combination surface |

Two inconsistencies, too:

- The default layout: the reference docs say `condensed`, but
  `AppReact.tsx` L187 falls back to `condensed-sticky`.
- `App.md` says "7 predefined layouts", but there are 8.

The default can also come from a theme variable (`layout-App`,
`AppReact.tsx` L187).

### Mantine `AppShell` (the inspiration)

Source: `node_modules/@mantine/core/lib/components/AppShell/AppShell.d.ts`,
`AppShell.types.d.ts`, `styles/AppShell.css` (Mantine 9.8.2).

- **Regions are compound children:** `Header`, `Navbar`, `Main`, `Aside`,
  `Footer`. A region exists when it is configured and rendered.
- **Settings are few and independent:**
  - `navbar: { width, breakpoint, collapsed: { mobile, desktop } }`;
  - `header: { height, collapsed, offset }`, and the same for `footer`;
  - `layout: 'default' | 'alt'` (`alt`: the navbar runs the full height,
    beside the header and footer).
- **Sizes are declared, not measured.** The header height is part of the
  configuration.
- **Below `navbar.breakpoint`, CSS hides the navbar.** Opening it on a
  phone is the app's own state (`collapsed.mobile`), toggled by a `Burger`.
- **`mode="static"` is a 3×3 CSS grid:** rows header / main / footer,
  columns navbar / main / aside. `alt` makes the side columns span all
  rows. `mode="fixed"` (the default) uses fixed positioning and offsets
  `Main` by padding instead.

## Options considered

**A. Wrap Mantine's `AppShell`.** It is the fewest lines.

- Against: its sizes are props (numbers), not our theme variables. Our
  decision is that Mantine is styled only through pfui theme variables
  (AGENTS.md, *Decisions*).
- Against: it has no "nav inside the header" (XMLUI's `condensed`, the
  default).
- Against: its default `fixed` mode keeps the header always visible, so a
  header that scrolls away with the page needs `static` mode. There, the
  regions are no longer sticky.

**B. Our own shell, with the same regions as Mantine's `AppShell`, and
Mantine's `Burger` for the drawer toggle.** (Chosen.)

- About the size of option A's wrapper, without its constraints.
- *Changed while building it:* not a 3×3 grid but four slots for the nav
  (see *The DOM and the CSS*), and not Mantine's `Drawer` (the nav itself
  becomes the drawer, in CSS).
- `position: sticky` gives per-region stickiness, so the page can scroll.
- Styled by theme variables, like every other built-in.

**C. Port XMLUI's implementation.** Rejected: that is the complexity we're
removing.

## Design

### Principles

1. **One structure.** Every app renders the same elements. Only the nav
   moves, into one of four slots named by its `placement`. Everything else
   is `data-*` attributes and CSS.
2. **A region exists if it is in the markup.** No `NavPanel` means no nav
   column, and no `Footer` means no footer row. Nothing is generated except
   one documented case (the drawer toggle, below).
3. **A setting lives on the region it affects.** `App` keeps only `scroll`,
   which is global by nature.
4. **CSS does the layout.** JavaScript holds two booleans (drawer open, nav
   collapsed), and measures nothing.
5. **Sizes are declared:** `height-AppHeader`, `height-Footer`,
   `width-navPanel-App` and `width-navPanel-collapsed-App` (XMLUI's names)
   are theme variables.
6. **The compiler knows the shell.** The regions are recognized at compile
   time, so invalid combinations are compile errors, not runtime fallbacks.
7. **The defaults reproduce XMLUI's actual default** (`condensed-sticky`,
   `AppReact.tsx` L187), so an XMLUI app without `layout` looks the same.

### The settings

| Element | Property | Values | Default | Replaces |
|---------|----------|--------|---------|----------|
| `App` | `scroll` | `page` (the window scrolls) · `content` (only the content area scrolls; header, nav and footer always visible) · `none` (the app is as tall as its content, for embedding) | `page` | `scrollWholePage`, `fitContent`, `desktop` |
| `AppHeader` | `sticky` | boolean | `true` | the `-sticky` suffix |
| `NavPanel` | `placement` | `header` (inside the header bar) · `below-header` (its own bar under the header) · `side` (a column) | `header` | the nav part of the layout names |
| `NavPanel` | `fullHeight` | boolean; only with `placement="side"`. The column runs beside the header and footer (Mantine `layout="alt"`) | `false` | `vertical` vs `vertical-full-header` |
| `NavPanel` | `sticky` | boolean; for `side` and `below-header` | `true` | the `-sticky` suffix |
| `NavPanel` | `drawerBelow` | `sm` · `md` · `lg` · `xl` · `xxl` · `never`. Below this breakpoint the nav moves into a drawer | `lg` (992px, XMLUI's `maxWidth-tablet`, `components-core/theming/themes/root.ts` L185) | the implicit small-screen rule |
| `NavPanel` | `collapsible` | boolean; only with `placement="side"`. Allows collapsing to icons | `false` | works only in `vertical-full-header` today |
| `Footer` | `sticky` | boolean | `true` | `Footer sticky` (unchanged) |

`sticky` matters only with `scroll="page"`. With `content`, the regions
are always visible; with `none`, nothing sticks.

Content width and padding stay theme variables (`maxWidth-content-App`,
`paddingHorizontal-content-App`, …), with no layout overriding them.

These properties take **literal values only** (a compile error otherwise,
like `Page url`). The shell's shape is then known at compile time and in a
prerender.

### Markup examples

**The default (XMLUI `condensed-sticky`):** the nav sits in the header bar,
and the header and footer stick.

```xml
<App>
  <AppHeader title="Acme"/>
  <NavPanel>
    <NavLink label="Home" to="/"/>
    <NavLink label="Orders" to="/orders"/>
  </NavPanel>
  <Pages> … </Pages>
  <Footer>© Acme</Footer>
</App>
```

**A side nav under a full-width header (XMLUI `vertical-full-header`):**

```xml
<App>
  <AppHeader title="Acme"/>
  <NavPanel placement="side" collapsible="true">
    <NavLink label="Home" to="/" icon="home"/>
    <NavLink label="Orders" to="/orders" icon="list"/>
  </NavPanel>
  <Pages> … </Pages>
  <Footer>© Acme</Footer>
</App>
```

**A full-height side nav, nothing sticky (XMLUI `vertical`):**

```xml
<App>
  <AppHeader sticky="false"/>
  <NavPanel placement="side" fullHeight="true" sticky="false">
    <property name="logoTemplate"><H3>Acme</H3></property>
    <NavLink label="Home" to="/"/>
  </NavPanel>
  <Pages> … </Pages>
  <Footer sticky="false">© Acme</Footer>
</App>
```

**A desktop-style app (XMLUI `desktop`):** only the content area scrolls.

```xml
<App scroll="content">
  <AppHeader title="Editor"/>
  <HSplitter height="*"> … </HSplitter>
  <Footer>Ready</Footer>
</App>
```

**An embedded app (XMLUI `fitContent`):**

```xml
<App scroll="none">
  <Pages> … </Pages>
</App>
```

**A new combination XMLUI can't express:** a condensed header with a
scrolling content area.

```xml
<App scroll="content">
  <AppHeader title="Acme"/>
  <NavPanel placement="header">…</NavPanel>
  <Pages> … </Pages>
</App>
```

### Every XMLUI layout, expressed

| XMLUI `layout` | New markup (only what differs from the defaults) |
|----------------|--------------------------------------------------|
| `condensed-sticky` | nothing |
| `condensed` | `AppHeader sticky="false"`, `Footer sticky="false"` |
| `horizontal-sticky` | `NavPanel placement="below-header"` |
| `horizontal` | `NavPanel placement="below-header" sticky="false"`, `AppHeader sticky="false"`, `Footer sticky="false"` |
| `vertical-full-header` | `NavPanel placement="side"` |
| `vertical-sticky` | `NavPanel placement="side" fullHeight="true"` |
| `vertical` | the same, plus `sticky="false"` on all three regions |
| `desktop` | `App scroll="content"`, no `NavPanel`, content width `none` and padding `0` (theme variables) |

### The DOM and the CSS

One tree for every app. The landmarks are semantic elements. Only the nav
moves, into one of four slots:

```
div.pfui-App                    data-scroll, data-nav, data-nav-full-height,
                                data-drawer-below, data-header-sticky,
                                data-footer-sticky, data-nav-collapsed,
                                data-drawer-open
  [nav: side + fullHeight]
  div.pfui-AppColumn
    header.pfui-AppHeader       burger, logo, title, [nav: header], content, profile menu
    [nav: below-header]
    div.pfui-AppBody
      [nav: side]
      main.pfui-AppMain > div.pfui-AppContent    (the content)
    footer.pfui-Footer
  div.pfui-App-overlay          (while the drawer is open)
```

The regions are flex items, not grid cells. A nav in the header has to be
inside the header element, which grid areas can't express, so the nav moves
between slots anyway; with that, a grid adds nothing.

The rest is CSS (`components/src/styles.ts`):

- **Scrolling:**
  - `scroll="page"`: the root has `min-height: 100dvh`, and the window
    scrolls.
  - `scroll="content"`: the root has `height: 100dvh`, and `main` has
    `overflow: auto`. Star sizing (`height="*"`) in the content then has a
    definite height to share, as with XMLUI's `scrollWholePage="false"`.
  - `scroll="none"`: no viewport height at all.
- **Sticking** (only with `scroll="page"`): `[data-sticky]` → `position:
  sticky`.
  - The header: `top: 0`. The footer: `bottom: 0`.
  - A nav below the header: `top` is the header's declared height when the
    header sticks.
  - A side nav: the same `top`, and its height is the viewport minus the
    sticky header and footer, with its own scroll. A full-height side nav
    sticks at `top: 0` with the viewport's height.
- **Small screens:** a media query per breakpoint, for `data-drawer-below`:
  - the nav, wherever its slot is, becomes `position: fixed` on the left,
    slid out (`translateX(-100%)`, `visibility: hidden`); `data-drawer-open`
    slides it in;
  - the burger shows; an overlay closes the drawer.

  The nav is the drawer: one instance, so nothing in it mounts twice. It
  needs no JavaScript to choose, so a prerender is right at every width.
- **Collapsed side nav:** `data-nav-collapsed` switches the column to
  `width-navPanel-collapsed-App`. Items show their icon (or their label's
  initial) and hide their label.
- **Specificity:** rules for wide screens wrap their ancestor conditions in
  `:where()`, so the drawer rules win without tricks.

**The one generated piece:** a nav in the header, or one that can move into
a drawer, needs a header. Without an `AppHeader`, App renders one with only
the burger and the logo. It shows on wide screens only when the nav lives in
it. XMLUI's rule (keep the nav inline when there is no header, except in
condensed layouts; `AppReact.tsx` L326–333) is replaced by this single rule.

### The logo

`App logo` / `logo-dark` / `logo-light` / `logoTemplate` and `AppHeader
title` stay. **The logo renders in the top-left cell:**

- in the `NavPanel`, when it is `side` with `fullHeight`;
- in the header otherwise.

This rule follows from where the regions are, not from a layout name. Below
the drawer breakpoint the header shows the logo too (the nav is then a
drawer).
`NavPanel logoTemplate` and `AppHeader logoTemplate` override the logo in
their own region; `AppHeader showLogo="false"` hides it there.

### State and API

- **A small shell store** (signals, `runtime/src/render/shell-state.ts`):
  whether the side nav is collapsed and whether the drawer is open.
- **The script API (app globals):** `navPanelCollapsed` and
  `setNavPanelCollapsed(value)`, `navDrawerOpen` and `setNavDrawerOpen(value)`.
  Flat names, like `activeThemeTone`/`setThemeTone`: pfui has no `App.*`
  namespace. A toggle is `setNavPanelCollapsed(!navPanelCollapsed)`.
- **The drawer closes** on navigation, on Escape (the focus returns to the
  burger), on the overlay, and when the window grows past `drawerBelow`. A
  `matchMedia` listener, attached only while the drawer is open, does the
  last part. Opening it moves the focus to its first item.
- **`NavPanelCollapseButton`** (XMLUI's name) toggles the collapsed state.
  It's allowed only with a `collapsible` side nav (E028).

### What the compiler does

- **Passes the regions as props.** The direct `AppHeader`, `NavPanel` and
  `Footer` children of `App` become props (`$$header`, `$$nav`, `$$footer`,
  named by `regions` in App's metadata), and the remaining children are the
  content. Their literal settings, with the defaults applied, become one
  hoisted constant, `$$shell`. This replaces XMLUI's runtime registration
  (`AppLayoutContext`). An App without regions gets no `$$shell`.
- **Checks** (E028, and E023/E026 from the metadata):
  - at most one of each region;
  - a region only as a direct child of `App`;
  - `fullHeight` or `collapsible` without `placement="side"`;
  - `NavPanelCollapseButton` without a `collapsible` side nav;
  - a non-literal shell property.
- **Warns** (E029) about `sticky` set explicitly when `scroll` is not
  `page`, where it has no effect.
- **Migration help (E030):** `App layout`, `scrollWholePage` and
  `fitContent` are `removedProps` in App's metadata. Each is an error that
  names the equivalent markup, per layout name: *"'App' has no 'layout' any
  more: remove 'layout'; use <NavPanel placement="side"
  fullHeight="true">"*.

### Divergences from XMLUI

- `layout`, `scrollWholePage`, `fitContent` and the `layout-App` theme
  variable are removed; `scroll` and the region settings replace them.
- Header and footer heights are declared (theme variables), not measured.
  A taller header than declared overflows instead of pushing the content
  down. Mantine works the same way.
- Shell properties are literals.
- The regions must be direct children of `App`. A region may still use
  `when`; the shell keeps its settings.
- The nav's small-screen behavior is one rule (`drawerBelow`), and no
  longer depends on whether a header exists.
- Collapsing to icons works for every side nav, not only
  `vertical-full-header`.
- **Not in these steps:**
  - `NavPanel scrollStyle`, `showScrollerFade` and `syncWithContent`/
    `syncScroll*`;
  - `noScrollbarGutters`;
  - an `Aside` region;
  - `NavLink` `enabled`, `target`, `displayActive`, `noIndicator`,
    `iconAlignment`, `level`, `vertical` and its `click` event;
    `NavGroup` `to`, `enabled`, the icon alignment and expand-icon props.
- `NavLink icon` uses a small built-in set (`components/src/icons.tsx`)
  until an icon library is chosen. A collapsed nav shows the label's
  initial for an item without an icon.

## Steps

### Step 19A: The shell structure

- [x] `App` renders the shell. `AppHeader`, `NavPanel` (a plain container
      for now) and `Footer` are built-ins with metadata.
- [x] Compiler: region slots, the contract checks and the migration
      errors, in a conformance table.
- [x] `scroll`, `sticky`, `placement`, `fullHeight`; the theme variables
      for sizes.
- [x] E2E at desktop width, one fixture per XMLUI layout (the table
      above). After scrolling, measure the bounding boxes: what moved, what
      stuck, what scrolls.

### Step 19B: Navigation and small screens

- [x] `NavLink` (label, `to`, `icon`, active state) and `NavGroup`. This
      also completes "active links" from step 21.
- [x] `drawerBelow`: the burger, the nav as a CSS drawer, closing on
      navigation and on widening.
- [x] `collapsible` and `NavPanelCollapseButton`.
- [x] The logo rule, `AppHeader title`, `logoTemplate`,
      `profileMenuTemplate`.
- [x] E2E at phone width: the nav is hidden, the burger opens the drawer,
      and a `NavLink` click navigates and closes it. Prerender at phone and
      desktop widths, then hydrate without mismatches.

### Step 19C: Playground and docs

- [x] The playground uses the new shell: the scenario list becomes the
      `NavPanel`.
- [x] An "App shell" scenario switches between the eight equivalents (and
      a new combination), at desktop and phone width, with its E2E test.
- [x] `docs/app-shell.md`, `code-structure.md`.
- [x] Record the decision in `AGENTS.md`.

## Verification

- **Unit:**
  - the conformance table of shell markup → slots and data attributes, or
    a diagnostic;
  - the migration messages;
  - the shell store (drawer open/close rules).
- **E2E:**
  - the eight XMLUI layouts, at 1280px and 390px wide, with geometry
    assertions before and after scrolling;
  - the drawer interaction;
  - prerender plus takeover at both widths, with no hydration warnings.
- **Size, as a sanity check, not a target:** report the line counts of the
  shell (TSX and CSS) next to XMLUI's (`AppReact.tsx` 1,044, `App.tsx` 448,
  `App.module.scss` 515).

## Decisions (the user's answers)

1. **Defaults:** XMLUI's actual default (nav in the header, header and footer
   sticky).
2. **`placement`:** keep `header` and `below-header`.
3. **Non-sticky layouts:** `sticky="false"` on each region is accepted; no
   `App sticky`, no presets.
4. **Header height:** declared, not measured.
5. **Script API:** exposed now (see *State and API*).
6. **Numbering:** steps 19A–19C; 20 and later unchanged.

## Outcome

Steps 19A–19C were built together, on one branch (`poc/19a-app-shell`).

- **What works:** the shell exactly as designed above, every XMLUI layout
  and new combinations, the drawer at phone width, collapsing, `NavLink`
  with the active route, `NavGroup` (expands in a side nav or a drawer,
  drops down in a bar), the logo rule, the script API, the migration errors.
- **The playground** uses it: a header (title, collapse button, tone toggle),
  a collapsible side nav built from the scenario list with `Items`, a footer.
  Its "App shell" scenario frames each layout demo (`playground/layouts.html
  ?layout=…`, one App per page) at desktop or phone width.
- **Evidence:**
  - unit: `compiler/tests/module/shell.test.ts` (settings, diagnostics,
    migration messages; 33 tests), `components/tests/shell.test.tsx` (the
    four slots, the root's attributes, the header, the drawer, collapsing,
    NavLink and NavGroup; 36 tests);
  - E2E: `e2e/app-shell.spec.ts` (each of the nine demos at 1280px:
    placement measured, then scrolled; and at 390px: the drawer, focus,
    Escape, navigation, the overlay; collapsing; the dropdown group; the
    active link) and `e2e/app-shell-prerender.spec.ts` (the playground's
    production build: the prerendered shell without JavaScript at both
    widths, a takeover that replaces no node, a live shell afterwards).
- **Size:** `shell.tsx` (all six shell components and the structure) is 348
  lines, the shell CSS about 200, the compiler part about 130. XMLUI's App
  alone is `AppReact.tsx` 1,044 + `App.tsx` 448 + `App.module.scss` 515 +
  `AppLayoutContext.ts` 89 lines, without AppHeader and NavPanel.

## Findings

- **Slots instead of the 3×3 grid.** A nav in the header bar has to be
  inside the header element, which grid areas can't express, so the nav
  moves between four slots; the rest is plain flex. (I first believed a
  sticky header couldn't stick in a grid row of its own height, and dropped
  the grid for that reason. A check in Chromium proved that wrong: it
  sticks. The slot design stays, for the reason above.)
- **The nav as its own drawer** (CSS, `position: fixed` below the
  breakpoint) is simpler than Mantine's `Drawer`: one instance (no
  duplicated ids or state), the same element in every placement, and no
  JavaScript to decide what shows at which width.
- **`visibility` in a transition** is `hidden` at the transition's first
  frame, so `focus()` right after opening failed. The E2E test found it.
  Opening switches `visibility` at once; closing hides after the slide.
- **Mantine's `Burger` needs `Burger.layer.css`,** which our hand-picked
  Mantine stylesheet didn't include (a 0×0 button). Its line color comes
  from `--mantine-color-black`, which pfui doesn't define; the shell sets
  `--burger-color` from `textColor-AppHeader`.
- **The prerender hook ran for every HTML page** of a multi-page build. It
  now prerenders only `index.html` (the playground has two pages).
- **jsdom can't test the drawer's look:** no media query matches, so the
  burger is `display: none` there (and has no accessible name). The unit
  tests check behavior; the browser checks the rest.

## Open for later steps

- **App-level theme variable overrides.** XMLUI's `desktop` also sets the
  content padding to 0. pfui can't override a theme variable for the whole
  App from markup yet (`<Theme>` scopes only its children), so the
  `desktop` demo keeps the default padding.
- **RTL:** the drawer slides in from the left in every direction.
- **Scroll lock** while the drawer is open; a focus trap inside it.
- **The NavLink and NavGroup props not built** (see *Divergences*), and
  `NavPanel scrollStyle`/`syncWithContent`.
- **An `Aside` region** (Mantine has one).
- **An icon library** instead of the built-in set.
