# Steps 19D–19F: The layout system, with automatic spacing

**Status:** Done

## Goal

Build the layout half of step 19 that is still missing: `Stack` and its
variants, sizing (percentages and star sizing), alignment, and wrapping. The
App shell half was done as 19A–19C.

The new feature is **automatic spacing**:

- Layout containers get their gaps and paddings without `gap` or `padding`
  props.
- The defaults are not one fixed value. They follow common website spacing
  rules:
  - space shrinks with nesting depth;
  - a row of controls is tighter than a column of sections;
  - a box with a visible edge gets inner padding, and an invisible one doesn't;
  - phones are tighter than desktops.

An author writes structure, and the spacing follows from it:

```xml
<!-- Today (playground/src/components/CounterScenario.gui) -->
<Stack gap="16px">
  <ScenarioHeader title="Counter" description="…"/>
  <Stack gap="8px" var.count="{0}">
    <Stack orientation="horizontal" gap="8px">
      <Button label="Increment" onClick="count++"/>
      <Button label="Reset" onClick="count = 0"/>
    </Stack>
    <Text>Count: {count}</Text>
  </Stack>
</Stack>

<!-- With this plan -->
<VStack>
  <ScenarioHeader title="Counter" description="…"/>
  <VStack var.count="{0}">
    <HStack>
      <Button label="Increment" onClick="count++"/>
      <Button label="Reset" onClick="count = 0"/>
    </HStack>
    <Text>Count: {count}</Text>
  </VStack>
</VStack>
```

The second version gets 24px, 12px and 8px on a desktop, and less on a phone.
The values come from four theme variables.

**Why now:** every later component batch (Card, Form, Tabs, List) lays its
content out with these containers. Their spacing rules should exist before
those components do.

## Background

### Here

- `Stack` (`packages/components/src/basic.tsx`) has only `orientation` and
  `gap`. With no `gap` it has no gap at all.
- There are **no layout props** at all: no `width`, `height`, `padding`,
  `backgroundColor` or alignment on any component.
- The playground shows the cost:
  - 86 of its ~90 `Stack`s set `gap` by hand: 39× `8px`, 20× `16px`,
    19× `24px`, 6× `12px`, 2× `4px` (`grep` over `playground/src`).
  - The pattern is consistent. Outer stacks get 16–24px, inner ones 8px, and
    rows of buttons 8px. Authors already space by depth; the framework
    doesn't.
- The App content (`.gfui-AppContent`, `styles.ts`) has padding
  (`paddingHorizontal/Vertical-content-App`, `$space-4`) but no gap.
- `Page` and `Pages` render fragments, so a page's root children are direct
  DOM children of `.gfui-AppContent`.
- The theme engine derives `space-0` … `space-*` from `space-base`, 4px here
  (`components/src/theming/themes.ts`, `engine.ts`).
- Breakpoints are xs 0, sm 576, md 768, lg 992, xl 1200 and xxl 1400
  (`BREAKPOINTS`, runtime).

### XMLUI

- **Concepts:** `website/content/docs/pages/layout.md`.
  - The layout containers are `Stack` (with `HStack`, `VStack`, `CHStack`,
    `CVStack`) and `FlowLayout`. Every other container is built from these
    two.
  - It uses no margins, only paddings and gaps ("use them as a last resort").
  - Sizes are: no value; a fixed size; a percentage; a star size (`*`, `2*`),
    which is a share of the remaining space.
  - `SpaceFiller` pushes the following children to the end of a stack. In a
    `FlowLayout` it is a line break.
- **The default gap is flat.**
  - Every `Stack` gets `--stack-gap-default`, which is `$space-4` (16px), set
    once in `xmlui/src/components/Theme/Theme.module.scss` L6.
  - It is used through `var(--xmlui-gap-Stack, var(--stack-gap-default))` in
    `xmlui/src/components/Stack/Stack.module.scss` L20.
  - `FlowLayout`'s `columnGap` and `rowGap` default to `$gap-normal`
    (`FlowLayout/FlowLayout.defaults.ts`).
  - `Card` uses the same variable (`Card/Card.tsx` L130).
- **XMLUI already varies it once, by context.**
  `AppHeader/AppHeader.module.scss` L57 and L108 redefine
  `--stack-gap-default` as `$space-2` inside the header. Stacks in a header
  are therefore tighter. That is the seed of this plan's idea, applied in one
  place only.
- **Named sizes:** `xmlui/src/components-core/theming/themes/root.ts`
  L254–266 defines:
  - `gap-none`, `gap-tight` (`$space-2`), `gap-normal` (`$space-4`),
    `gap-loose` (`$space-8`);
  - the matching `padding-*` names;
  - `padding-layout` and `gap-layout`.
- **Paddings:** a plain `Stack` has none. The App content has
  `paddingHorizontal/Vertical-content-App` and `gap-content-App`
  (`App/App.module.scss` L24–26).
- **Star sizing:** `components-core/theming/layout-resolver.ts` L108–130.
  `width="2*"` in a horizontal stack becomes `flex: 2` with `flexShrink: 1`,
  and the `width` is dropped. The same applies to `height` in a vertical
  stack.
- **Percentages overflow in a Stack.** `layout.md` § HStack shows two 50%
  children plus a gap overflowing. `FlowLayout` corrects for the gap
  (§ FlowLayout).
- **FlowLayout on small screens:** `FlowLayout/FlowLayoutReact.tsx` L61–79
  uses a tiered rule.
  - On xs and sm, percentages are multiplied by 4, and anything over 50%
    becomes 100%.
  - On md they are multiplied by 3, and 50–75% snaps to 50%.
  - On lg and above they are kept as given.
  - Clever, but nobody can predict it without reading the code.
- **`wrapContent`** on `Stack` contradicts itself in the docs.
  `website/content/docs/reference/components/Stack.md` L189 says "Works only
  with horizontal orientations", and L191 says "Works in all orientations".
- **Not taken over in this plan:** `dock` (Stack.md § Dock Layout),
  `scrollStyle`, `hoverContainer`, `desktopOnly`.

## Design

### 1. The containers

| Component | Is | Notes |
|-----------|----|-------|
| `Stack` | the container; `orientation="vertical"` (default) or `"horizontal"` | Use it when the orientation is an expression |
| `VStack` | `Stack orientation="vertical"` | |
| `HStack` | `Stack orientation="horizontal"` | |
| `CVStack`, `CHStack` | the same, centered on both axes | |
| `SpaceFiller` | takes the free space; in a wrapping stack, a line break | XMLUI's semantics |

- The variants are compile-time aliases. The compiler rewrites `HStack` to
  `Stack` with `orientation="horizontal"`, so there is one component at
  runtime.
- A literal `orientation` on a variant is E026-style (a conflict).

**Props of every Stack:**

| Prop | Values | Default |
|------|--------|---------|
| `orientation` | `vertical` · `horizontal` | `vertical` |
| `gap` | a length, a number (px), or a `$token` | **automatic** (§ 3) |
| `padding`, `paddingHorizontal`, `paddingVertical`, `paddingTop`/`Right`/`Bottom`/`Left` | the same | **automatic** (§ 3) |
| `horizontalAlignment` | `start` · `center` · `end` · `stretch` | `start`. In a vertical stack the children stretch, as in XMLUI. |
| `verticalAlignment` | `start` · `center` · `end` · `stretch` | `start`. In a horizontal stack the children stretch. |
| `wrapContent` | `false` · `true`: the children wrap into new rows (a flow) | `false` |
| `itemWidth` | the default width of the children in a wrapping stack | none |
| `reverse` | `false` · `true` | `false` |
| `density` | `compact` · `normal` · `comfortable` (§ 3) | inherited |

**Wrapping replaces `FlowLayout`:**

```xml
<!-- Tags that flow onto as many rows as needed -->
<HStack wrapContent="true">
  <Items data="{tags}">
    <Badge value="{$item}"/>
  </Items>
</HStack>

<!-- A tile grid: four per row on a desktop, one per row on a phone (§ 2) -->
<HStack wrapContent="true" itemWidth="25%">
  <Items data="{products}">
    <ProductTile product="{$item}"/>
  </Items>
</HStack>

<!-- SpaceFiller in a wrapping stack is a line break -->
<HStack wrapContent="true">
  <TextBox label="First name" width="50%"/>
  <TextBox label="Last name" width="50%"/>
  <SpaceFiller/>
  <TextBox label="Email" width="100%"/>
</HStack>
```

- **`FlowLayout` is removed,** with a migration error (decision 1). A new
  metadata field, `removed`, gives the replacement; the code is E032 (E030's
  message is about props):

  ```
  E032 'FlowLayout' is not a component any more: use <HStack wrapContent="true">;
       the gaps are automatic (or use gap), and itemWidth sets the children's width
  ```

- **`wrapContent` works in both orientations.** A wrapping vertical stack
  needs a height, and its columns then flow to the right (`flex-wrap` on a
  column). This settles XMLUI's contradictory docs.

### 2. Layout props on every visual component

These props are accepted by every visual component, not only by containers:

```xml
<Text width="50%">…</Text>
<Button label="Save" width="*"/>
<Stack height="200px" backgroundColor="$color-surface-100" border="1px solid $color-surface-300">…</Stack>
<Image src="/a.png" maxWidth="320px"/>
```

- **The set:**
  - `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`;
  - the padding family (§ 1);
  - `backgroundColor`, `border`, `borderRadius`.
- **Not here:** margins (XMLUI's "last resort"), responsive variants
  (`width-md`) and the rest of XMLUI's long list (open for later).
- **Values:**
  - a CSS length;
  - a number, meaning px;
  - a percentage;
  - a star size (`*`, `2*`, in `width`/`height` only);
  - `$name`, which is a theme variable and becomes `var(--gfui-name)`. It can
    be embedded: `"1px solid $color-surface-300"`.
- **Checked at compile time:** a literal that is malformed, or a `$name` that
  is not a known theme variable, is **E031**. An expression's value is
  checked at runtime in development, like other bound values.

**Sizing inside a stack:**

```xml
<HStack height="64px">
  <Stack width="*"   backgroundColor="cyan"/>       <!-- 1 share of what is left -->
  <H3>Title</H3>                                    <!-- its natural width -->
  <Stack width="2*"  backgroundColor="orangered"/>  <!-- 2 shares -->
</HStack>

<HStack>
  <Stack width="25%"/> <Stack width="50%"/> <Stack width="25%"/>
  <!-- fits exactly: the gaps are taken into account (XMLUI's HStack overflows here) -->
</HStack>

<VStack height="100%">
  <PageHeader/>
  <List height="*"/>     <!-- the list takes the rest of the height and scrolls -->
</VStack>
```

- **A star size on the main axis** is `flex: N 1 0` with `min-width: 0` (or
  `min-height: 0`). On the other axis it means "stretch".
- **A percentage on the main axis** fits with the gaps. Children whose
  percentages add up to 100% fill the row exactly, gaps included. This is a
  **divergence**: XMLUI's `Stack` overflows.
  - *As built:* in a plain stack, a percentage child may shrink (a fixed
    size doesn't), so flexbox takes the gaps from the percentages in
    proportion. No CSS variable has to cross from the parent: a child stack
    would see its own gap, not its parent's.
  - In a flow, rows must not shrink, so the width is
    `calc(P% - gap × (1 − P/100))` (`flowWidth`). It is inline, because
    Mantine puts a component's `style` on its root and other attributes on
    the `<input>`.
- **On small screens,** a wrapping stack's percentage-width children are 100%
  below `md` (decision 2). This one rule replaces XMLUI's ×4/×3 tiers.
- **How the props reach a component** (*as built*, simpler than first
  planned):
  - The layout props are ordinary props, as in XMLUI: constants or bindings
    by name, through `Bound`. There is no `$$layout` object.
  - Components apply them with `useLayout(props)`, which returns `style` and
    `data-surface`. The context gives the parent's orientation for star
    sizes.
  - The Mantine components go through `withLayout` (`mantine.tsx`), which
    passes only the `style`; `wrapComponent` stays unchanged.
  - On a user component's tag, the layout props go to its root element:
    the root gets the binding `$$layoutFrom` (`{ width: $props.width, … }`),
    and its values win over the root's own.
- **Metadata:** a shared `LAYOUT_PROPS` table, which non-visual components
  opt out of. This is the contract the compiler checks against.

### 3. Automatic spacing

#### The rules, in plain words

These are common website spacing rules (proximity: related things sit closer
than unrelated ones), turned into defaults:

1. **Deeper is tighter.** A page's sections are far apart, and a group's items
   are close together. Each level of nesting steps the spacing down.
2. **A row of controls is tighter than a column of blocks.** Buttons side by
   side are related more closely than stacked sections, so a horizontal stack
   of items uses the next tighter step.
3. **Columns are blocks.** A horizontal stack whose children are themselves
   containers (columns) uses the same step as a vertical stack at that level.
4. **A wrapper doesn't add a level.** A container that is the only child of
   its parent container groups nothing, so it takes its parent's level. This
   covers a page's root `VStack` and a user component's root `Stack`.
5. **Padding only where there is an edge.** A container without a visible
   boundary has no padding, so its content lines up with its neighbors.
   A container with a `backgroundColor` or a `border` (a *surface*) gets
   inner padding equal to its own gap. Inner padding should never be smaller
   than the space between the box's children.
6. **The page has a gutter.** The App content's padding equals the page-level
   gap.
7. **Phones are tighter.** Below `md`, the page level steps down: the gutter
   and the gap between sections.
8. **Bars are compact.** Content inside `AppHeader`, `Footer` and the
   NavPanel's templates starts at the deepest level. XMLUI does the same in
   the header (`$space-2`).

#### One unit: `space-base`

**Every gap and padding the framework produces is a multiple of
`space-base`.** Changing that one theme variable rescales the spacing of the
whole app: the ladder, the gutter, surfaces, bars, the shell's paddings, the
headings' extra space and the named sizes.

```xml
<Theme space-base="3px">   <!-- a denser app: 18/12/9/6 instead of 24/16/12/8 -->
  …
</Theme>
<Theme space-base="5px">   <!-- a roomier one: 30/20/15/10 -->
  …
</Theme>
```

- **It already exists here.** Step 17's theme engine derives
  `space-0` … `space-12` as `calc(var(--gfui-space-base) * N)`
  (`components/src/theming/engine.ts`, `derivedTokens`), and `space-base` is
  4px (`themes.ts`). XMLUI has the same variable, `"space-base": "0.25em"`
  (`xmlui/src/components-core/theming/themes/root.ts` L47).
- **The ladder is written in steps, not lengths.** `space-level1` is
  `$space-4`, not `16px`, so it follows `space-base`. A theme can still remap
  a level to another step (`space-level1="$space-5"`). It stays relative.
- **The rule is enforced by a test** (`components/tests/spacing-unit.test.ts`).
  - It fails on a fixed length in any `gap`, `padding*` or `margin*`
    declaration in `styles.ts`, and in any spacing theme variable default in
    metadata (`gap-*`, `padding*-*`, `space-*` except `space-base`).
  - Allowed: `0`, `auto`, `var(...)`, `calc()` over theme variables, and
    `em` values tied to the font, such as inline code's padding.
- **What the test would catch today** (fixed in 19E):
  - `gap: 2px` in `.gfui-NavPanel-items` and `.gfui-NavGroup-items`
    (`styles.ts` L79 and L151). These become `$space-0_5`.
  - Inline code's `padding: 0 0.25em` (L258) is allowed, because it is tied
    to the font.
- **The shell's heights follow it; its widths don't** (decision 8).
  - `height-AppHeader` becomes `$space-14` (56px at 4px) and
    `height-Footer` becomes `$space-12` (48px), because they are padding
    around one line. `14` is added to `SPACE_STEPS`.
  - `width-navPanel-App` (256px) and `width-navPanel-collapsed-App` (48px)
    stay fixed, because the text they hold sets them.

#### The ladder

There are four levels. They are four theme variables, built on `space-base`
(4px):

| Theme variable | Default | Used for |
|----------------|---------|----------|
| `space-level0` | `$space-6` (24px); **`$space-4` (16px) below md** | the page: gutter, gap between sections |
| `space-level1` | `$space-4` (16px) | the first level of groups |
| `space-level2` | `$space-3` (12px) | the second level |
| `space-level3` | `$space-2` (8px) | everything deeper, and bars |

What a container at level *L* gets (levels past 3 count as 3):

| Container | `gap` | `padding` |
|-----------|-------|-----------|
| Vertical stack | `space-levelL` | 0, or `space-levelL` if it is a surface |
| Horizontal stack of items | `space-level(L+1)` | the same rule |
| Horizontal stack of columns (has a container child) | `space-levelL` | the same rule |
| Wrapping stack | as horizontal; row gap = column gap | the same rule |
| App content (level 0) | `space-level0` | `space-level0` on all sides |

#### How levels are counted

- The App content is level 0.
- Every container is one level deeper than its parent container, except a
  wrapper (rule 4).
- Components that are not containers, such as `Text`, `Pages`, `Page`, a
  user component's tag, `Items` and `When`, are transparent. They don't count.

```xml
<App>                                     <!-- content: level 0, gutter 24, gap 24 -->
  <Pages>
    <Page url="/">
      <VStack>                            <!-- the page's only root: wrapper, level 0, gap 24 -->
        <H1>Dashboard</H1>
        <HStack>                          <!-- level 1, items: gap = level2 = 12 -->
          <Button label="New"/>
          <Button label="Import"/>
        </HStack>
        <HStack>                          <!-- level 1, columns: gap = level1 = 16 -->
          <VStack width="*">              <!-- level 2: gap 12 -->
            <H2>Sales</H2>
            <Text>…</Text>
          </VStack>
          <VStack width="*">              <!-- level 2: gap 12 -->
            <H2>Visitors</H2>
            <Text>…</Text>
          </VStack>
        </HStack>
      </VStack>
    </Page>
  </Pages>
</App>
```

On a phone, the same markup gets a 16px gutter and 16px between the page's
sections. Levels 1 to 3 stay as they are.

#### Surfaces

```xml
<VStack>                                        <!-- level 0 -->
  <VStack backgroundColor="$color-surface-50"   <!-- level 1 surface: padding 16, gap 16 -->
          border="1px solid $color-surface-200"
          borderRadius="$borderRadius">
    <H3>Account</H3>
    <HStack>                                    <!-- level 2 items: gap 8 -->
      <Text>Plan: Pro</Text>
      <SpaceFiller/>
      <Button label="Change"/>
    </HStack>
  </VStack>
</VStack>
```

`Card`, `ModalDialog`'s body and the like (later batches) declare themselves
surfaces in metadata (`layout: { surface: true }`). They then follow the same
rule without code of their own.

#### Forms

```xml
<VStack>                                <!-- level 1 in a page: gap 16 between fields -->
  <TextBox label="Name"/>
  <TextBox label="Email"/>
  <HStack>                              <!-- level 2 items: gap 8 -->
    <SpaceFiller/>
    <Button label="Cancel"/>
    <Button label="Save"/>
  </HStack>
</VStack>
```

#### Bars

```xml
<AppHeader title="Acme">
  <HStack>                              <!-- in a bar: level 3, gap 8 -->
    <Button label="Docs"/>
    <Button label="Blog"/>
  </HStack>
</AppHeader>
```

#### Overriding

Overrides are rare, but always possible:

```xml
<HStack gap="0">…</HStack>                       <!-- explicit: wins, as today -->
<VStack gap="$gap-loose">…</VStack>              <!-- XMLUI's named sizes are kept -->
<VStack padding="$space-8">…</VStack>            <!-- any theme variable -->

<VStack density="compact">                       <!-- a whole region one step tighter -->
  <Text>Dense settings list</Text>
  <HStack>…</HStack>
</VStack>

<VStack density="comfortable">…</VStack>         <!-- one step looser -->
```

- `density` shifts the level of the container and of everything inside it:
  `compact` is +1, `comfortable` is −1, and levels are clamped to 0–3.
- It passes through user components and templates.

#### Theming the ladder

```xml
<Theme space-level0="$space-8" space-level1="$space-6">   <!-- a roomier site -->
  …
</Theme>

<Theme gap-Stack="$space-4">                               <!-- XMLUI's flat behavior: every stack 16px -->
  …
</Theme>
```

- `gap-Stack` is XMLUI's variable. When it is set, it replaces the automatic
  gap of every stack, which is the compatibility switch.
- XMLUI's `gap-tight`/`normal`/`loose`/`none` and the matching `padding-*`
  names are kept.
- `paddingHorizontal-content-App` and `paddingVertical-content-App` now
  default to `$space-level0`.

#### How it is built

- **A React context, `LayoutContext`** (runtime), holds `{ level, single,
  density, orientation }`. Each container:
  1. reads the context;
  2. computes its level (`single` means it is a wrapper and keeps the
     parent's level);
  3. renders `data-orientation`, `data-level` (0–3) and `data-surface`;
  4. provides `{ level, single: <it has exactly one child> }` to its
     children.
- **Repeaters and pages** (`Items`, `Page`) recompute `single` from their own
  children, because they can render several roots from one element. `Items`
  always sets `single: false`.
- **CSS does the rest.** Rules map the attributes to the theme variables:

  ```css
  .gfui-Stack { gap: var(--gfui-gap-Stack, var(--_gap)); }
  .gfui-Stack[data-orientation="vertical"][data-level="1"] { --_gap: var(--gfui-space-level1); }
  .gfui-Stack[data-orientation="horizontal"][data-level="1"] { --_gap: var(--gfui-space-level2); }
  .gfui-Stack[data-orientation="horizontal"][data-level="1"]:has(> .gfui-Stack) { --_gap: var(--gfui-space-level1); }
  @media (max-width: 767.98px) { .gfui-App { --gfui-space-level0: var(--gfui-space-level0-phone); } }
  ```

- **Columns** are detected in CSS with `:has(> .gfui-Stack)`, not in
  JavaScript. It sees through user components, because their root is a
  `.gfui-Stack` in the DOM. No JavaScript has to inspect the children.
- **Explicit props** are inline styles, so they always win.
- **Why a context and not pure CSS:**
  - Descendant selectors (`:where(.S .S .S)`) can count depth without
    JavaScript. However, they can't see through portals (dialogs, the
    drawer, popovers), can't reset (bars, `density`), and can't apply the
    wrapper rule.
  - The context crosses portals, renders on the server (prerendered HTML has
    the same attributes, so the takeover changes nothing), and shows up as
    `data-level` in DevTools.
- **Why not at compile time:** the compiler sees one file. Levels run through
  user components, templates and `Items`.
- **Cost:** one `useContext` and one provider per container. The benchmark
  (`npm run bench`) gets a case of 1,000 nested stacks, measured before and
  after.

#### Headings in a vertical stack (decision 3)

A heading belongs to what follows it, so it should sit closer to that content
than to what comes before.

- A heading that is not the first child of a vertical stack
  gets extra space before it, `margin-block-start: <the stack's gap>`. Its
  space above is then double the space below.
- This is the only margin the framework adds itself.

```xml
<VStack>                     <!-- level 1: gap 16 -->
  <H2>Billing</H2>           <!-- first: no extra space -->
  <Text>…</Text>
  <H2>Invoices</H2>          <!-- 16 + 16 above it, 16 below it -->
  <Text>…</Text>
</VStack>
```

### Divergences from XMLUI (summary)

| XMLUI | Here | Why |
|-------|------|-----|
| One flat default gap (16px), varied only in the header | A ladder by level, orientation, columns, surface and screen size | The user's request; the playground's hand-written gaps already follow it |
| A plain `Stack` and a `Card` with the same flat gap | A surface gets padding = its gap; a plain stack gets none | Alignment of edges |
| Percentages overflow in `Stack` | Gap-aware percentages in every stack | Fewer surprises |
| `FlowLayout` with tiered ×4/×3 resizing on small screens | `wrapContent` on a stack; percentages are 100% below md | One component, one rule |
| `wrapContent` docs contradict each other | Works in both orientations | Settles it |
| `dock`, `scrollStyle`, `hoverContainer`, `desktopOnly`, margins, responsive layout props | Not in these steps | Scope |

## Steps

Built on one branch, `poc/19d-layout`, like 19A–19C.

### 19D: Containers and layout props

- [x] `Stack` with every prop of § 1, plus the aliases `VStack`, `HStack`,
      `CVStack` and `CHStack` (rewritten by the compiler), and `SpaceFiller`.
- [x] `LAYOUT_PROPS` in metadata. They are ordinary props (no `$$layout`);
      `$token` values become `var()` at runtime.
- [x] E031 (a malformed literal layout value, an unknown `$token`); E032 for
      `FlowLayout`.
- [x] `layoutStyle()`: star sizes, percentages, the surface attribute.
      Applied by `Stack`, `SpaceFiller`, `Text`, `Heading`, `Link`, and the
      Mantine components (`withLayout`).
- [x] Wrapping: `wrapContent`, `itemWidth`, `SpaceFiller` as a line break,
      100% below md.
- [x] ~~For now, the gap defaults to a flat `$space-4`~~: 19D and 19E were
      built together, so the flat stage was skipped.

### 19E: Automatic spacing

- [x] `LayoutContext` with the level, wrapper, density and bar rules; `Items`
      and `Page` recompute `single`.
- [x] The ladder's theme variables, the CSS rules (with `:has()` for
      columns), the phone step and the App content's gutter.
- [x] `gap-Stack` as the flat override; `density`.
- [x] The `space-base` rule: the test that forbids fixed spacing lengths,
      and the two `gap: 2px` fixed.
- [x] The header and footer heights on `space-base` (`$space-14`,
      `$space-12`; `14` added to `SPACE_STEPS`).
- [x] Headings' extra space.
- [x] A benchmark case with 1,000 nested stacks.

### 19F: Playground and docs

- [x] Remove every hand-written `gap` in the playground (86) unless it is
      deliberate, and use `VStack`/`HStack`.
- [x] A "Layout" scenario:
  - the examples of this plan;
  - a **spacing inspector** toggle (playground-only CSS) that outlines
    containers and labels each with its level and gap;
  - phone and desktop frames side by side (like the App shell scenario).
- [x] A new `.ai/docs/layout.md`; update `code-structure.md`, `contracts.md`
      (E031, E032, `LAYOUT_PROPS`, the new metadata fields) and
      `poc-steps.md`.

## Verification

- **Unit tests (compiler):**
  - aliases;
  - `$$layout` for literals and expressions;
  - `$token` resolution;
  - E031 and E032 at their spans (a conformance table).
- **Unit tests (components, jsdom):**
  - `data-level` for each case of § 3: nesting, wrapper, `Items`, `Page`,
    bars, `density`, a portal;
  - `layoutStyle()` as a table: star, percentage, fixed, cross axis;
  - surfaces;
  - explicit props win.
- **E2E (real Chromium, measured with `getBoundingClientRect`):**
  - the dashboard example at 1280px and at 390px: the gutter, each gap, the
    column gap and the surface padding, against the ladder's values;
  - percentages that add up to 100% fill a row exactly;
  - star sizes split the free space 1:2;
  - a wrapping stack wraps, a `SpaceFiller` breaks the line, and children
    are 100% below md;
  - a theme that changes `space-level1` moves only the level-1 gaps;
  - `gap-Stack` makes every gap flat;
  - `space-base` at 3px, 4px and 5px: every measured gap, padding and the
    gutter scale in proportion (×0.75, ×1, ×1.25), with no exceptions;
  - prerendered HTML has the same `data-level`s, and the takeover replaces
    no node.
- **Benchmark:** 1,000 nested stacks, with and without the context; a
  difference over 10% is reported.
- **The playground** with no hand-written gaps looks like it does today, or
  better. Reviewed by the user.

## Decisions (the user's answers to the open questions)

1. **`FlowLayout` is removed,** with a migration error (E032, as built) pointing to
   `<HStack wrapContent="true">`.
2. **Wrapping on phones:** percentage widths in a wrapping stack become 100%
   below `md`.
3. **Headings** get extra space before them (§ 3, *Headings*).
4. **The wrapper rule:** a container that is the only child of its parent
   container keeps the parent's level.
5. **The ladder:** 24/16/12/8 (`$space-6`/`4`/`3`/`2`), and 16 (`$space-4`)
   for the page level below md.
6. **`density`** is part of 19E.
7. **Numbering:** 19D–19F, after 19A–19C and before step 20.
8. **Shell sizes:**
   - The header and footer heights follow `space-base`:
     `height-AppHeader` is `$space-14` and `height-Footer` is `$space-12`.
     `14` is added to `SPACE_STEPS`.
   - The nav widths stay fixed lengths.
9. **`space-base` stays `4px`.**

## Outcome

All three steps are built on `poc/19d-layout`. `npm run check` passes
without warnings: 2,121 unit tests in 71 files and 129 E2E tests.

- **The playground has no hand-written `gap` left.** The 86 were removed by
  a script that turned `Stack` into `VStack`/`HStack` and matched the
  closing tags.
  - One structural change: the dashboard's rows were direct children of the
    page, so they got the page gap (24px). They are now grouped in a
    `VStack`, and get 16px.
  - The rows got `verticalAlignment="center"`.
- **The new "Layout and spacing" scenario** frames `layouts.html?layout=spacing`:
  - a whole App with no gap or padding;
  - buttons for `space-base` 3/4/5px;
  - the `SpacingInspector`.
- **Measured** (`e2e/layout.spec.ts`): every gap of the demo (more than 80
  pairs of children) and every surface's padding match the ladder, at 1280
  and 390px, with `space-base` at 3, 4 and 5px. The prerendered playground
  has the same levels and gaps without JavaScript.
- **Cost** (`components/bench/layout.bench.tsx`, jsdom): 1,000 stacks
  compared with step 5's plain div stack.
  - Mount: 27.2ms vs 21.7ms (+25%).
  - A re-render of the whole tree: 11.9ms vs 7.0ms (+70%).
  - That is about 5µs per stack, mostly the context provider every
    container needs.
  - This exceeds the plan's 10% threshold, so it is reported here.
    `Children.toArray` (which copies every element) was replaced by a count
    that stops at 2, and elements without layout props return a shared
    result. Those two changes brought it down from +37% and +98%.

## Findings

- **XMLUI already varies the default gap once:** inside its header
  (`AppHeader.module.scss` L57). This plan generalizes that.
- **Mantine passes attributes to the `<input>`, not the root.** A
  `TextInput`'s `data-*` attributes go to the input, and its `style` to the
  root. Layout must travel as `style` only (`withLayout`).
- **Mantine's inputs were 26px wider than their wrapper** before this step
  (already on `master`). Mantine expects its `baseline.css`
  (`* { box-sizing: border-box }`), which gfui doesn't load because it also
  styles `<body>`. gfui now sets `border-box` on Mantine's input parts only.
- **A Mantine `Button` can shrink to nothing in a row,** because its root
  clips its label. Buttons in stacks now keep their width: not stretched in
  a column (XMLUI: `layout.md` § VStack), not squeezed in a row.
- **A line break in a flow adds one row gap.** XMLUI's FlowLayout `.break`
  does the same (`FlowLayout.module.scss` L60–64), and flexbox can't absorb
  it, because a line's height can't be negative.
- **Star sizes share the space left after paddings,** as flexbox works (and
  XMLUI's `flex: N`). The E2E test compares content widths.
- **The larger page gutter (24px) changed a test's premise.** At 1280px the
  App shell scenario's frame became narrower than `lg`, so its demo showed
  the drawer. The test now uses a 1440px window.
- **A `hidden` attribute loses to an inline `display`.** The single-demo
  preview omits the layout choice instead.
- **Already on `master`:** the Theming scenario's "dark-tone region" text is
  nearly invisible on the light page, because a `<Theme tone="dark">` has no
  background of its own (`display: contents`). Not changed here.

## Open for later steps

- Responsive layout props (`width-md="50%"`), as XMLUI has.
- `dock` (XMLUI's DockPanel mode), `scrollStyle`, `hoverContainer`.
- Margins, if a real case needs them.
- `Card`, `ModalDialog` and `Tabs` as surfaces (their batches).
- RTL (`direction`), with step 34.
