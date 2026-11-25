# The layout system

> Subsystem reference: `Stack` and its aliases, `SpaceFiller`, the layout
> props on every visual component, and the automatic spacing (levels, the
> ladder, surfaces). Describes the code as it is. Design, XMLUI comparison
> and findings: [`../plan/poc-19d-layout.md`](../plan/poc-19d-layout.md).
>
> **Last updated:** steps 19D–19F.

## Using it

```xml
<VStack>                                   <!-- the page's only root: level 0 -->
  <H1>Dashboard</H1>
  <HStack>                                 <!-- level 1, items: the next tighter step -->
    <Button label="New"/>
    <SpaceFiller/>
    <Button label="Import"/>
  </HStack>
  <HStack>                                 <!-- level 1, columns: the level's own step -->
    <VStack width="*">…</VStack>           <!-- level 2; 1 share of the free width -->
    <VStack width="2*" backgroundColor="$color-surface-50">…</VStack>   <!-- a surface: padding -->
  </HStack>
  <HStack wrapContent="true" itemWidth="25%">  <!-- a flow: four per row, one on a phone -->
    <Items data="{tiles}"><Tile tile="{$item}"/></Items>
  </HStack>
  <VStack density="compact">…</VStack>    <!-- this subtree one step tighter -->
</VStack>
```

| Component | Is |
|-----------|----|
| `Stack` | the container: `orientation` vertical (default) or horizontal |
| `VStack`, `HStack`, `CVStack`, `CHStack` | compile-time aliases (metadata `alias`): `Stack` with a fixed orientation, and centered |
| `SpaceFiller` | takes the free space; in a wrapping stack, a line break |
| `FlowLayout` | removed: E032 points to `<HStack wrapContent="true">` |

**Stack props:**
- `gap`: automatic unless set; a length, a number (px) or a `$token`.
- `horizontalAlignment`, `verticalAlignment`: `start`, `center`, `end`,
  `stretch`.
- `wrapContent`: makes the stack a flow.
- `itemWidth`: the default width of the flow's children.
- `reverse`.
- `density`: `compact` (+1 level), `normal` (resets), `comfortable` (−1).

**Layout props** (`LAYOUT_PROPS`, `components/src/layout-metadata.ts`) are
accepted by every visual component, except where the metadata says
`layoutProps: false` (App, the shell regions, NavLink/NavGroup/the collapse
button):
- sizes: `width`, `height`, `minWidth`, `maxWidth`, `minHeight`,
  `maxHeight`, `borderRadius`;
- the padding family: `padding`, `paddingHorizontal`, `paddingVertical`,
  `paddingTop`/`Right`/`Bottom`/`Left`;
- `backgroundColor`;
- `border`.

**Values:**
- A number is pixels.
- `$name` is a theme variable (`var(--gfui-name)`), also embedded
  (`1px solid $borderColor`).
- `*` and `N*` are star sizes (`width`/`height` only).
- Literals are checked at compile time (E031): the form, and that each
  `$name` is a known theme variable.

## The automatic spacing

**Levels** (`LayoutContext`, `components/src/layout.tsx`):
- The App content is level 0.
- A container is one level deeper than the container around it, unless it is
  that container's only child: a wrapper groups nothing, so it keeps the
  level.
- Components in between are transparent. A user component's root, `Pages`,
  `Page` and `Items` count no level, but:
  - `Page` recounts its own children (the page's roots);
  - `Items` is never single (any number of items).
- Bars (AppHeader, NavPanel, Footer) start their content at level 2, so the
  first stack in them is level 3.
- `density` shifts the subtree.
- The shown level (`data-level`) is clamped to 0–3.

**The ladder** (root theme, `components/src/theming/themes.ts`):

| Theme variable | Default | 4px base |
|----------------|---------|----------|
| `space-level0` | `$space-6` | 24px |
| `space-level0-phone` | `$space-4` | 16px (below md) |
| `space-level1` | `$space-4` | 16px |
| `space-level2` | `$space-3` | 12px |
| `space-level3` | `$space-2` | 8px |

| Container at level L | gap | padding |
|----------------------|-----|---------|
| vertical | level L | 0; level L if a surface |
| horizontal with a container child (columns, `:has(> .gfui-Stack)`) | level L | the same |
| horizontal of items | level L+1 (max 3) | the same |
| App content | level 0 | level 0, unless `paddingHorizontal/Vertical-content-App` is set |

- A surface is a stack with a `backgroundColor` or a `border`
  (`data-surface`). **`Card`** (step 23) is a stack that is always a surface
  (its own background and border from `backgroundColor-Card`, `border-Card`);
  `gap-Card` and `padding-Card` override the ladder for cards only. Its title
  row counts against the wrapper rule ([display.md](display.md)).
- A heading that is not the first child of a vertical stack (or of the App
  content) gets the gap again above it (`margin-block-start`). This is the
  framework's only margin.
- Overrides:
  - an explicit `gap` sets `--gfui-gap` inline on that stack;
  - `gap-Stack` (a theme variable with no default, `optionalThemeVars`)
    makes every gap flat, which is XMLUI's behavior;
  - XMLUI's named sizes `gap-*`/`padding-*` (none, tight, normal, loose)
    exist.
- Everything is a multiple of `space-base`:
  - the ladder;
  - the shell's heights (`height-AppHeader` `$space-14`, `height-Footer`
    `$space-12`);
  - the NavPanel's item gaps.

  `components/tests/layout.test.tsx` fails on a fixed length in a spacing
  declaration or default.

## Who does what

| Part | Does |
|------|------|
| **Compiler** (`compile-module.ts`) | Renders an alias as its component with the alias's props unless the markup sets them. Accepts `LAYOUT_PROPS` (`layoutProp()` in metadata) as ordinary props. Checks literals with a `cssKind` (E031) and removed components (E032). A user component's single root element gets the binding `$$layoutFrom` (`{ width: $props.width, … }`), so the root applies what the component's tag was given. |
| **`layoutStyle` / `useLayout`** (`layout.tsx`) | The layout props as a style and `data-surface`. Star sizes become `flex: N 1 0px` on the main axis and `align-self: stretch` on the other. A fixed main-axis size doesn't shrink; percentages may (so 25/50/25 fits with the gaps). A percentage width in a flow is `flowWidth()`: gap-aware, 100% on phones. `$$layoutFrom` wins over the root's own. No layout props: a shared frozen result. |
| **`Stack`** (`layout.tsx`) | Its level, from the context; the new context for its children; `data-orientation`, `data-level`, `data-wrap`, `data-item-width` (`%` or `fixed`); the flex direction and alignment inline. |
| **Components** | `Text`, `Heading`/`H1`–`H6`, `Link`, `SpaceFiller` apply `useLayout`. The Mantine components go through `withLayout` (`mantine.tsx`), which passes only the `style`: Mantine puts it on the root, but other attributes on the `<input>`. |
| **CSS** (`styles.ts`, `LAYOUT`) | The ladder by `data-level` and orientation (`--gfui-step`, `--gfui-pad`), `--gfui-gap`, the phone step for level 0 (`--gfui-l0`, resolved on every container so a nested `<Theme>` can change it), flows (`--gfui-flow-gap`, `--gfui-flow-wide`), `SpaceFiller`, the heading margin, buttons keeping their width. |
| **Shell** (`shell.tsx`) | The App content's context (level 0) and the bars' context. |

## Details worth knowing

- **A SpaceFiller line break in a flow** sits on a line of its own, with
  zero height. That line still has a row gap on each side, so the break adds
  one row gap. This matches XMLUI's FlowLayout `.break`, and flexbox can't
  absorb it.
- **Star sizes share the space left after paddings.** That is how flexbox
  works, and XMLUI's `flex: N` too. Two surfaces at `*` and `2*` have
  content widths in a 1:2 ratio, not outer widths.
- **Buttons keep their width:** `fit-content` in a column and no shrinking in
  a row. Mantine's button root clips its label, so in a narrow row it would
  otherwise shrink to nothing. `width="100%"` fills a column.
- **Mantine's inputs need `box-sizing: border-box`,** which its
  `baseline.css` would set globally. gfui sets it only on Mantine's input
  parts. Before 19D a TextBox's input was 26px wider than its wrapper.
- **`display: contents` wrappers** (`Theme`, the variant behavior) are
  transparent to flex layout. The columns rule (`:has(> .gfui-Stack)`) can't
  see through them.

## Files

| File | Contents |
|------|----------|
| `components/src/layout-metadata.ts` | `LAYOUT_PROPS`, `LAYOUT_PROP_NAMES`, `checkLayoutValue` (E031), `layoutCss`, `starShares`, `themeRefs` (React-free) |
| `components/src/layout.tsx` | `LayoutContext`, `LayoutScope`, `useRecountedScope`, `useMultipleScope`, `BAR_SCOPE`, `pageScope`, `childCount`, `layoutStyle`, `useLayout`, `flowWidth`, `withoutLayoutProps`, `Stack`, `SpaceFiller` |
| `components/src/metadata.ts` | `STACK_PROPS`, `stackAlias`, the Stack family, `SpaceFiller`, `FlowLayout` (`removed`); the fields `alias`, `removed`, `layoutProps`, `optionalThemeVars`, `cssKind`, `star`; `acceptsLayoutProps`, `layoutProp` |
| `components/src/styles.ts` | `LAYOUT`, `PHONE_MAX` |
| `components/src/theming/themes.ts` | The ladder and XMLUI's named sizes |
| `playground/src/layouts/spacing.gui`, `src/react/SpacingInspector.tsx`, `components/LayoutScenario.gui` | The demo, the inspector, the scenario |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/layout.test.ts` | Aliases; layout props on components, not on the shell or non-visual ones; E031 table; E032; `$$layoutFrom` on a user component's root only |
| `components/tests/layout.test.tsx` | Levels for each rule (nesting, wrapper, Page, Items, `when`, user components, bars, density); stack attributes; layout props reaching each component; the `layoutStyle` table; the space-base rule over the stylesheet and the defaults |
| `e2e/layout.spec.ts` (project `playground`) | The spacing demo measured: every gap (from the children's boxes) and surface padding against the ladder at 1280 and 390 px and space-base 3/4/5 px; the gutter; star sizes and percentages; flows (itemWidth, percentages, the line break) at both widths; density; the inspector |
| `e2e/app-shell-prerender.spec.ts` | The prerendered dashboard has its levels and gaps without JavaScript |
| `e2e/playground-scenarios.spec.ts` | The Layout scenario: the frame at both widths, the inspector, space-base |
| `components/bench/layout.bench.tsx` | 1,000 stacks against step 5's plain div stack: mount and re-render |
