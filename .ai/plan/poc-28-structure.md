# Step 28: Structure

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the sixth batch of Phase F: `Tabs`
(`TabItem`), `ExpandableItem`, `Stepper` (`Step`), `Splitter` (`HSplitter`,
`VSplitter`), `ScrollViewer`, `StickyBox`, `StickySection`, `ResponsiveBar`.
E2E is needed for resizing, sticky positioning and overflow.

## Goal

```xml
<Tabs id="tabs" onDidChange="(index, id, label) => …">
  <TabItem label="Account"><TextBox id="name" label="Name"/></TabItem>
  <Items data="{projects}"><TabItem label="{$item.title}">…</TabItem></Items>
</Tabs>
<Text>{name.value}</Text>   <!-- IDs inside a tab stay file-scoped -->

<ExpandableItem summary="Details" withSwitch="true">…</ExpandableItem>

<Stepper id="wizard" orientation="vertical">
  <Step label="Account" description="Who you are">…</Step>
  <Step label="Plan" completed="{planChosen}">…</Step>
</Stepper>
<Button label="Next" onClick="wizard.next()"/>

<HSplitter height="400px" initialPrimarySize="30%" minPrimarySize="200px" maxPrimarySize="-200px">
  <NavList/><Details/>
</HSplitter>

<ScrollViewer height="300px" scrollStyle="whenMouseOver">
  <StickySection><H3>A</H3></StickySection> … <StickySection><H3>B</H3></StickySection> …
</ScrollViewer>
<StickyBox to="bottom"><Button label="Save changes"/></StickyBox>

<ResponsiveBar><Button label="File"/><Button label="Edit"/> … </ResponsiveBar>
```

XMLUI's markup; tab and step headers prerendered; dragging, sticking and
overflow proven in a real browser.

## Background

### XMLUI (`website/content/docs/reference/components/*.md`, `xmlui/src/components/*`)

- **Tabs** (`Tabs.md`, `Tabs/TabsReact.tsx`, Radix): `activeTab` (index,
  default 0), `orientation` (horizontal, vertical), `tabAlignment` (start,
  end, center, stretch), `distributeEvenly`, `accordionView` (stacked
  headers, one open; `orientation` ignored), `keepMounted` (default false:
  only the active panel is mounted), `gap`, `headerTemplate` (with
  `$header`: `{ id, index, label, isActive }`); events `didChange(index, id,
  label)`, `contextMenu`; API `next`, `prev`, `setActiveTabIndex`,
  `setActiveTabById`.
- **TabItem** (`TabItem.md`): `label`, `headerTemplate` (`$header`), its own
  `id`; events `activated`, `deactivated`. **It registers with its Tabs in a
  layout effect** (`Tabs/TabItemReact.tsx` 21–28): the Tabs learn their
  headers only after mounting.
- **ExpandableItem** (`ExpandableItem.md`): `summary` (a string, or a
  `<property>` template), `initiallyExpanded`, `enabled`, `iconExpanded`
  (chevrondown), `iconCollapsed` (chevronright), `iconPosition` (end),
  `withSwitch` (a switch instead of the icon), `fullWidthSummary`,
  `contentWidth` (100%); event `expandedChange(isExpanded)`; API `expand`,
  `collapse`, `toggle`, `isExpanded`.
- **Stepper** (`Stepper.md`, `Stepper/StepperReact.tsx`): `activeStep`
  (default 0), `orientation`, `nonLinear` (headers are clickable),
  `stackedLabel` (the label under the icon); `didChange`; API `next`,
  `prev`, `reset`, `setActiveStep`. **Step** (`Step.md`): `label`,
  `description`, `icon`, `completed`, `error`; event `activated`; its
  children are the step's content (shown for the active step;
  `StepReact.tsx` 85, 163). Steps register in an effect too
  (`StepReact.tsx` 50–58).
- **Splitter** (`Splitter.md`, `Splitter/SplitterReact.tsx`, their own):
  two children, primary and secondary, with a bar between; `orientation`
  (default vertical: stacked), `initialPrimarySize` (50%),
  `minPrimarySize` (0%), `maxPrimarySize` (100%; negative counts from the
  end: `-200px`), `resizeMode` (preserveRatio, preservePrimary,
  preserveSecondary, when the container resizes), `swapped`, `floating`
  (the bar shows on hover only), `splitterTemplate`; event
  `resize(primarySize)` (px). One visible child: no bar, it fills.
  **HSplitter** is side by side, **VSplitter** stacked (`Splitter.tsx`
  209–231). *`HSplitter.md` says "with a vertical orientation", which
  contradicts the source: we follow the source.*
- **ScrollViewer** (`ScrollViewer.md`, OverlayScrollbars): fills its
  parent; `scrollStyle` normal (native), overlay, whenMouseOver,
  whenScrolling (ignored on touch devices); `showScrollerFade` (gradients
  where more content is); `headerTemplate`, `footerTemplate` (stay put
  around the scrolling content).
- **StickyBox** (`StickyBox.md`, `react-sticky-el`): `to` top or bottom;
  sticks in the page's scroll container. Its own doc warns it doesn't
  compose inside nested scroll areas and has a StrictMode defect.
- **StickySection** (`StickySection.md`): `stickTo` top or bottom; in any
  scroll container; of several with the same direction, the last one that
  scrolled out stays visible, covering the earlier ones.
- **ResponsiveBar** (`ResponsiveBar.md`, `ResponsiveBar/*`): children that
  don't fit move into a DropdownMenu (`overflowIcon`, `dropdownText`
  "More options", `dropdownAlignment`, `triggerTemplate`); `orientation`,
  `reverse`, `gap`; each child sees `$overflow` (true in the dropdown,
  `ResponsiveBarItem.tsx`); events `click`, `willOpen`; API `open`,
  `close`, `hasOverflow`. It measures all children, then splits them
  (`README.md`, "two-phase rendering").

### Here

- **Step 25 compiled `Option` children to data** (`childrenAsOptions`,
  [choice.md](../docs/choice.md)) so the prerender shows the selection. Its
  content becomes a template: IDs inside are local to it.
- **`childContextVars`** (step 22) gives children compiled in place a
  context scope (IDs stay file-scoped).
- **Step 27's menus** (`DropdownMenu`) can hold ResponsiveBar's overflow.
- **The spacing ladder** (19D): every new container must fit it (Tabs
  panels, the expandable content, step content, splitter panes).
- **The App shell's sticky header** sets `--gfui-shell-top`
  ([app-shell.md](../docs/app-shell.md)); a top StickyBox goes under it.
- architecture.md's map: Mantine `Tabs`, `Accordion`/`Collapse`, `Stepper`,
  `ScrollArea`; Splitter on `react-resizable-panels` ⚠; StickyBox and
  StickySection own CSS; ResponsiveBar own with a `ResizeObserver`.

### Mantine 9.8.2

`Tabs` (controlled `value`, `orientation`, `keepMounted`, `Tabs.List`
`justify`/`grow`, keyboard arrows), `Accordion`, `Collapse`, `Stepper`
(`active`, `onStepClick`, `orientation`, `iconPosition`,
`allowNextStepsSelect`, `Stepper.Step` with `label`, `description`, `icon`,
`completedIcon`, `color`, `loading`; content as children), `ScrollArea`
(`type`: auto, always, scroll, hover, never; `scrollHideDelay`). No
splitter.

## Options considered

### A. Tab and step headers: where they come from

1. **XMLUI's way:** each TabItem/Step registers in a layout effect. The
   prerendered page has no headers; they appear on takeover (the page
   shifts).
2. **Everything compiled to data** (step 25's mechanism): the content
   becomes a template, so `<TabItem><TextBox id="name"/></TabItem>` is
   invisible to `{name.value}` outside: a real XMLUI app pattern breaks.
3. **Headers compiled to data, content in place** *(recommended)*: the
   compiler turns each TabItem's header part (`label`, `id`, `when`,
   `headerTemplate`; for Step `label`, `description`, `icon`, `completed`,
   `error`) into one reactive array (as `$$options`), with a key per item
   (an ordinal, plus `$itemIndex` inside an `Items`). The TabItem elements
   still compile in place with the same key, so their content has
   file-scoped IDs; each renders its panel only while its key is active.
   The prerender has the headers and the active panel.

### B. Splitter

1. **`react-resizable-panels`** (architecture.md ⚠): percentages only, so
   XMLUI's pixel sizes, negative limits and `resizeMode` need conversions
   on every resize; another dependency.
2. **Our own** *(recommended)*, as XMLUI's: two panes and a bar, pointer
   capture while dragging, arrow keys on the focused bar (`role="separator"`
   with `aria-valuenow`), a `ResizeObserver` for `resizeMode`. About as
   small as the adapter for option 1 would be.

### C. ResponsiveBar's `$overflow`

1. **One context scope per direct child** *(recommended)*: a new metadata
   flag (`perChildContextVars: ["$overflow"]`): the compiler wraps each child
   in its own context scope, so IDs stay file-scoped and each child can tell
   where it is.
2. **Children as a template** (one instance per child): IDs become local.

## Design

- **Tabs** on Mantine `Tabs`: headers from the compiled array; a TabItem
  renders its panel when its key is active (`keepMounted`: always, hidden
  otherwise). `activeTab` is the initial index and follows later changes
  (XMLUI); `didChange(index, id, label)`, `activated`/`deactivated` on the
  items; the API. `headerTemplate` on Tabs or a TabItem with `$header`.
  `accordionView` on Mantine `Accordion` with the same data. The panel is a
  level of the spacing ladder (a surface-less stack).
- **ExpandableItem**: our own: a `<button aria-expanded>` summary (or a
  Mantine `Switch` with `withSwitch`) and Mantine `Collapse` for the content;
  `summary` is a prop or a template; the API. Prerendered in its initial
  state.
- **Stepper** on Mantine `Stepper` (*as built: our own*, as Mantine's can't
  put a vertical step's content under its header), the same header array as
  Tabs; a Step's content renders while its key is active; `nonLinear` allows clicking any
  header; `completed`/`error` states; `stackedLabel` with
  `iconPosition`; the API.
- **Splitter/HSplitter/VSplitter**: our own (decision B); `HSplitter` and
  `VSplitter` are compile-time aliases (as `HStack`). Sizes are CSS sizes
  (px, %), the limits clamp while dragging and on resize; `resize(px)` fires
  at the end of a drag. One visible child: no bar.
- **ScrollViewer** on Mantine `ScrollArea` (*as built:* its content is a
  vertical Stack; `normal` is a plain overflow box; overlay → `always`, whenMouseOver → `hover`, whenScrolling →
  `scroll`); `showScrollerFade` our own gradients from the scroll position;
  header and footer templates outside the scrolling part. It fills its
  parent.
- **StickyBox**: CSS `position: sticky` in the page's scroll container, top
  offset `--gfui-shell-top` (under a sticky AppHeader); no runtime scroll
  listener, so it also works inside nested scroll areas, unlike XMLUI's.
- **StickySection**: CSS `position: sticky` with a background; later
  sections in the same container cover earlier ones by document order
  (XMLUI's "last one stays").
- **ResponsiveBar**: our own; it measures its children (a `ResizeObserver`
  on the bar, widths taken once and when children change) and moves those
  that don't fit into a step 27 `DropdownMenu`; `$overflow` per child
  (decision C). The prerender shows every child in the bar (clipped); the
  split happens after takeover.
- **Metadata and theme variables** from XMLUI's docs for each component;
  defaults from our tokens.

## Steps

- [x] The compiler: headers to data with keys (`childrenAsHeaders` for Tabs
      and Stepper), `perChildContextVars`, the splitter aliases; tests.
- [x] Tabs and TabItem; Stepper and Step.
- [x] ExpandableItem.
- [x] Splitter, HSplitter, VSplitter.
- [x] ScrollViewer, StickyBox, StickySection.
- [x] ResponsiveBar.
- [x] Unit tests (jsdom); playground scenarios ("Tabs and steppers",
      "Splitters and scrolling", "Responsive bars"); E2E.
- [x] Docs: `code-structure.md`, a new `structure.md`.
- [x] `npm run check`; measure the bundle.

## Verification

- **jsdom:** the compiled headers (static, `Items`, `when`, bound labels);
  IDs inside a tab visible outside; `activeTab` and the API; events with
  their arguments; `keepMounted`; ExpandableItem's API and switch; Stepper's
  API and states; splitter sizes from props and clamping (no layout: logic
  tests); `$overflow`; prerendered headers and the active panel.
- **E2E:** tabs by keyboard (arrows, Home/End); dragging a splitter bar and
  the limits (measured), arrow keys on the bar, `resizeMode` when the window
  resizes, `floating`; ScrollViewer styles and the fade; StickyBox under the
  sticky header, StickySection stacking (measured while scrolling);
  ResponsiveBar at several widths (which items moved, the menu, `$overflow`);
  a prerendered Tabs page taken over without DOM changes.

## Outcome

- **The components:** `Tabs`, `TabItem`, `ExpandableItem`, `Stepper`,
  `Step`, `Splitter`, `HSplitter`, `VSplitter`, `ScrollViewer`, `StickyBox`,
  `StickySection`, `ResponsiveBar` ([structure.md](../docs/structure.md)). No
  new dependency.
- **The compiler:** `childrenAsHeaders` (headers as data, keys shared with
  the items compiled in place; E038), `perChildContextVars`, the splitter
  aliases.
- **The runtime:** `usePerChildScope`, `ChildContextValues`.
- **The playground:** "Tabs and steppers", "Splitters and scrolling",
  "Responsive bars" (42 scenarios).
- **Evidence:** `npm run check` passes and prints no warnings: 2,926 unit
  tests in 105 files, 235 E2E tests. New: `compiler/tests/module/structure.test.ts`
  (18), `components/tests/structure.test.tsx` (26), `e2e/structure.spec.ts`
  (12; also passed three times in a row) and three scenario tests.
- **Size:** the hello app's eager JavaScript 963 → 995 KB (267 → 272 KB
  gzipped); `gfui.js` 1,387 → 1,453 KB.

### Findings

- **A drag made the splitter jump** by half the bar's thickness: the pane was
  sized from the pointer, not from where the bar was grabbed. The grab offset
  is kept now (the E2E test checks the bar stays under the pointer).
- **A ScrollViewer's content didn't stack:** Texts flowed inline, so nothing
  overflowed. Its content is a vertical Stack now, like a Card's.
- **Mantine's ScrollArea viewport must keep its own overflow;** an early
  rule of mine set it to `visible` and broke scrolling.
- **The primary pane's size and limits are inline styles,** so the "one pane
  left" rule needs `!important`.
- **`activated` fires before the Tabs' `didChange`** (child effects run
  first).
- **`HSplitter.md` says "vertical orientation";** the source makes it side by
  side (`Splitter.tsx` 221–231). We follow the source.
- **jsdom has no layout:** the splitter's and the bar's arithmetic are pure
  functions (`splitterSize`, `splitterSizeAfterDrag`, `fittingCount`) tested
  in tables; the behavior is measured in E2E.

### Divergences from XMLUI

- **StickyBox works in nested scroll areas** (CSS sticky; decision 4).
- **A ResponsiveBar's `Items` is one child:** it moves into the menu whole,
  not item by item (XMLUI renders a component's node list).
- **`when-*` on a TabItem or Step is E002** (the headers can't follow
  breakpoints).
- **The Stepper is our own**, not Mantine's (architecture.md suggested it).
- **The overflow menu's default icon is `dotmenuhorizontal`** (XMLUI's is a
  themed `ellipsisHorizontal`, not a registered name here).

### Open for later steps

- A prerendered page with Tabs taken over in a real browser (the jsdom
  server render covers the headers; the hello app has no Tabs yet).
- ResponsiveBar items from an `Items`.
- `Tabs` `contextMenu` receives the pointer but the tab under it isn't
  passed.

## Decisions (asked 2026-11-26)

1. **Tab and step headers are compiled to data,** with the content in place
   (option A3): headers prerendered, IDs inside a tab file-scoped.
2. **Our own Splitter** (option B2); no `react-resizable-panels`.
3. **ResponsiveBar's `$overflow`:** a context scope per child (option C1,
   `perChildContextVars`).
4. **StickyBox is CSS sticky,** also inside nested scroll areas (an
   improvement over XMLUI's, recorded as a divergence).
