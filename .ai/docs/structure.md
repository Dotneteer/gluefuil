# Structure components

> Subsystem reference: `Tabs`/`TabItem`, `ExpandableItem`, `Stepper`/`Step`,
> `Splitter` (`HSplitter`, `VSplitter`), `ScrollViewer`, `StickyBox`,
> `StickySection`, `ResponsiveBar` (step 28). Describes the code as it is.
> Design and XMLUI comparison:
> [`../plan/poc-28-structure.md`](../plan/poc-28-structure.md).
>
> **Last updated:** step 28.

## In markup

```xml
<Tabs id="tabs" activeTab="1" onDidChange="(index, id, label) => …">
  <TabItem label="Account"><TextBox id="name"/></TabItem>
  <Items data="{projects}"><TabItem label="{$item}">…</TabItem></Items>
</Tabs>
<Text>{name.value}</Text>

<ExpandableItem summary="Details" withSwitch="true">…</ExpandableItem>
<Stepper id="wizard" nonLinear="true"><Step label="Account" completed="{done}">…</Step></Stepper>
<HSplitter initialPrimarySize="30%" minPrimarySize="120px" maxPrimarySize="-120px" onResize="(px) => …"><A/><B/></HSplitter>
<ScrollViewer scrollStyle="whenMouseOver"><StickySection><H3>A</H3></StickySection> …</ScrollViewer>
<StickyBox to="bottom">…</StickyBox>
<ResponsiveBar gap="8px"><Button label="{$overflow ? 'File…' : 'File'}"/> …</ResponsiveBar>
```

| Component | Props | Events | API |
|-----------|-------|--------|-----|
| `Tabs` | `activeTab`, `orientation`, `tabAlignment`, `distributeEvenly`, `accordionView`, `keepMounted`, `gap`, `headerTemplate` (`$header`) | `didChange(index, id, label)`, `contextMenu` | `next`, `prev`, `setActiveTabIndex`, `setActiveTabById`, `activeTabIndex` |
| `TabItem` | `label`, `headerTemplate` (`$header`), `id` | `activated`, `deactivated` | |
| `ExpandableItem` | `summary` (text or template), `initiallyExpanded`, `enabled`, `iconExpanded`, `iconCollapsed`, `iconPosition`, `withSwitch`, `fullWidthSummary`, `contentWidth` | `expandedChange(open)` | `expand`, `collapse`, `toggle`, `isExpanded` |
| `Stepper` | `activeStep`, `orientation`, `nonLinear`, `stackedLabel` | `didChange(index)` | `next`, `prev`, `reset`, `setActiveStep`, `activeStep` |
| `Step` | `label`, `description`, `icon`, `completed`, `error` | `activated` | |
| `Splitter` | `orientation` (vertical: stacked), `initialPrimarySize`, `minPrimarySize`, `maxPrimarySize` (px or %; negative from the end), `resizeMode`, `swapped`, `floating`, `splitterTemplate` | `resize(px)` | |
| `HSplitter`, `VSplitter` | Splitter's, without `orientation` (aliases: side by side, stacked) | | |
| `ScrollViewer` | `scrollStyle` (normal, overlay, whenMouseOver, whenScrolling), `showScrollerFade`, `headerTemplate`, `footerTemplate` | | `scrollToTop`, `scrollToBottom` |
| `StickyBox` | `to` (top, bottom) | | |
| `StickySection` | `stickTo` (top, bottom) | | |
| `ResponsiveBar` | `orientation`, `reverse`, `gap`, `overflowIcon`, `dropdownText`, `dropdownAlignment`, `triggerTemplate` | `click`, `willOpen` | `open`, `close`, `hasOverflow` |

## How it works

### Headers as data (`childrenAsHeaders`, decision 1)

- Tabs (`{ item: "TabItem" }`) and Stepper (`{ item: "Step" }`): the compiler
  builds the hidden binding `$$headers`, an array of `{ $$key, …props, id }`
  per item (with `$$headerTemplate` and `$$scope` when the item has its own
  `headerTemplate`). An `Items` of items spreads `$$optionItems` (step 25's
  helper). `when` filters, as for Options.
- **Keys:** the child's position (`"0"`, `"1"`, …), and `"position:" +
  $itemIndex` inside an `Items`. The **items still compile in place**, each
  with the same `$$key` (a constant, or a binding of `$itemIndex`), so their
  content has file-scoped IDs.
- The header compile keeps only E002 and E038; the item's own compile
  reports its binding problems (no duplicates). **E038:** a Tabs/Stepper
  child that isn't its item or an `Items` of them. `when-*` on an item is
  E002 (the headers can't follow breakpoints).
- At runtime `useActiveKey` keeps the active key (from `activeTab`/
  `activeStep`, applied again when it changes; a removed item falls back to
  its index); `TabItem`/`Step` read it from context and show their content
  only while active. The prerender has the headers and the active content.

### The components (`structure.tsx`)

- **Tabs** on Mantine `Tabs` (keyboard arrows, Home, End): headers from
  `$$headers`, each TabItem a `Tabs.Panel`. `accordionView`: Mantine
  `Accordion`, each TabItem an `Accordion.Item`. `activated` fires when an
  item becomes active (also when it mounts active) and before the Tabs'
  `didChange` (child effects first).
- **ExpandableItem**: our own: a `<button aria-expanded>` (or a Mantine
  `Switch`) and Mantine `Collapse`. `summary` is a prop or a template (the
  component receives a string or a renderer).
- **Stepper**: our own (not Mantine's, which can't put a vertical step's
  content under its header): a list of step headers (number, icon, check,
  `!`; `data-state` active, completed, error, past, upcoming); `nonLinear`
  makes them buttons. Vertical: each Step renders its header and, while
  active, its content.
- **Splitter** (decision 2, our own): two panes and a `role="separator"`
  bar. The primary pane's size is CSS: `initialPrimarySize`, then what a
  drag leaves, written for `resizeMode` (`splitterSizeAfterDrag`: a
  percentage, px, or `calc(100% - px)`), so the browser keeps it when the
  splitter resizes, with no observer. Limits are `min-`/`max-` sizes
  (`splitterSize`: negative ones count from the end). Pointer capture while
  dragging; the bar keeps the point where it was grabbed under the pointer;
  arrow keys move it 10px (Shift: 50px), Home and End. `resize(px)` after a
  drag or a key. A pane left empty (its child hidden by `when`) hides the bar
  (CSS `:empty`).
- **ScrollViewer**: `normal` is an overflow box; the others are Mantine's
  `ScrollArea` (overlay → always, whenMouseOver → hover, whenScrolling →
  scroll). Its content is a vertical `Stack`. Fades (`data-fade-top`,
  `data-fade-bottom`) follow the scroll position. It sets `--gfui-shell-top`
  to 0 inside.
- **StickyBox, StickySection** (decision 4): CSS `position: sticky`. At the
  top of a page that scrolls they sit under a sticky AppHeader
  (`--gfui-shell-top`); in any other scroll container at its edge. Later
  sections cover earlier ones (document order, a background).
- **ResponsiveBar**: each child in a wrapper; their sizes are measured once
  while all are in the bar (again when the number of children changes), and
  every resize (`ResizeObserver`) splits them with `fittingCount`; the rest go
  into a step 27 `DropdownMenu` (its icon-only trigger labelled by
  `dropdownText`). **`$overflow`** (decision 3): `perChildContextVars` gives
  each direct child its own context scope (`usePerChildScope`), set from
  `ChildContextValues` in a layout effect. Without layout (a server render)
  every child is in the bar. **An `Items` is one child** (it can't be split).

## Theme variables

| Component | Variables |
|-----------|-----------|
| Tabs | `borderColor-Tabs`, `textColor-Tabs` (`--active`), `borderColor-Tabs--active`, `backgroundColor-Tabs--hover`; `gap` → `--gfui-gap-Tabs` |
| ExpandableItem | `textColor-summary-ExpandableItem`, `gap-ExpandableItem` |
| Stepper | `color-Stepper--active`, `--completed`, `--error` |
| Splitter | `backgroundColor-resizer-Splitter` (`--hover`), `thickness-resizer-Splitter` |
| ScrollViewer | `size-scrollbar-`, `backgroundColor-thumb-`, `height-fade-ScrollViewer` |
| StickyBox, StickySection | `backgroundColor-StickyBox`, `backgroundColor-StickySection` |

## Size

The hello app's eager JavaScript: 963 KB → 995 KB (267 → 272 KB gzipped);
Mantine's Tabs and Accordion CSS joined `MANTINE_STYLESHEET`. `gfui.js`:
1,387 → 1,453 KB.

## Files

| File | Contents |
|------|----------|
| `components/src/structure.tsx` | The components; `splitterSize`, `splitterSizeAfterDrag`, `fittingCount` |
| `components/src/metadata.ts` | `STRUCTURE_COMPONENTS`; `childrenAsHeaders`, `perChildContextVars` |
| `compiler/src/module/compile-module.ts` | `headerParts`, `headerItems`, `headerEntry`, `itemKey`, `headerKeys` (E038); the per-child containers |
| `runtime/src/render/context-scope.ts` | `usePerChildScope`, `ChildContextValues` |
| `components/src/styles.ts` | `STRUCTURE` |

## Tests

| File | Covers |
|------|--------|
| `compiler/tests/module/structure.test.ts` | E038, E037 for items, headers code (keys, `when`, Items, headerTemplate), keys in place, `$overflow` scopes, the splitter aliases |
| `components/tests/structure.test.tsx` | Tabs (headers, IDs outside, `activeTab`, events, API, templates, `keepMounted`, accordion, the prerender), ExpandableItem, Stepper (states, API, vertical), splitter sizes, ScrollViewer and sticky elements, `fittingCount`, ResponsiveBar without layout |
| `e2e/structure.spec.ts` (project `playground`) | Tabs by keyboard; splitter drags, limits, keys, a hidden pane, resize modes, swapped, floating; ScrollViewer styles and fades; StickySection covering; StickyBox at the bottom; ResponsiveBar at narrow widths and vertical |
| `e2e/playground-scenarios.spec.ts` | The three scenarios |
