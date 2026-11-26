# Step 29: The virtualized List

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the seventh batch of Phase F: `List`.
E2E is needed for scrolling, bottom anchoring, dynamic heights, grouping and
selection. This step also chooses the **virtualizer** that List, Table (step
30), Tree and TileGrid (step 31) will share (architecture.md, *List and Table
(virtualized)*).

## Goal

```xml
<!-- 10,000 rows of different heights; only the visible ones are mounted -->
<List id="people" data="/api/people" idKey="id" height="*"
      orderBy="{{ field: 'name', direction: 'asc' }}"
      rowsSelectable="true" onSelectionDidChange="items => count = items.length">
  <HStack><Avatar name="{$item.name}"/><Text>{$item.name}</Text></HStack>
</List>
<Button label="Top" onClick="people.scrollToTop()"/>

<!-- a chat: starts at the bottom, follows new messages, keeps its place
     when older ones are prepended, stops following when the user scrolls up -->
<List scrollAnchor="bottom" height="400px" data="{messages}">
  <Card><Markdown>{$item.text}</Markdown></Card>
</List>

<!-- groups with headers and footers that fold -->
<List data="{employees}" groupBy="department">
  <property name="groupHeaderTemplate">
    <HStack onClick="$group.toggle()"><Text>{$group.key}</Text><Badge value="{$group.items.length}"/></HStack>
  </property>
  <Text>{$item.name}</Text>
</List>
```

XMLUI's markup and behavior; the first window prerendered; scrolling,
anchoring and selection proven in a real browser.

## Background

### XMLUI

- **Metadata:** `xmlui/src/components/List/List.tsx` 32–493.
- **Defaults:** `List.defaults.ts`.
- **Implementation:** `ListReact.tsx` (1,939 lines, on `virtua` ^0.48.2,
  `xmlui/package.json` 110).
- **Docs:** `website/content/docs/reference/components/List.md`.
- **How-to guides** (`website/content/docs/pages/howto/`):
  `follow-a-list-to-the-bottom.md`, `group-items-in-list-by-a-property.md`,
  `build-a-full-height-scroll-layout.md`,
  `implement-infinite-scroll-pagination.md`.

**Props**

- **Data:**
  - `data`: an array, or a URL;
  - `items` (internal alias);
  - `idKey` (default `id`): unique and never empty, or rows reconcile wrongly
    (`List.tsx` 143–155);
  - `limit`;
  - `orderBy`: `{ field, direction }` or an array of them (the docs' example,
    `ListReact.tsx` 119–137; the metadata says `string`);
  - `loading`;
  - `loadingDelay` (400 ms).
- **Templates:**
  - `itemTemplate`: also the children (`childrenAsTemplate`);
  - `emptyListTemplate`: the default is "No data available";
  - `groupHeaderTemplate`, `groupFooterTemplate`.
- **Groups:**
  - `groupBy`: a field name or a function;
  - `defaultGroups`: groups listed first, even when they are empty;
  - `availableGroups`;
  - `hideEmptyGroups` (true);
  - `groupsInitiallyExpanded` (true).
- **Scrolling:**
  - `scrollAnchor` (top, bottom);
  - `fixedItemSize`;
  - `renderCache` (true);
  - `renderCacheSize` (80): recently seen rows stay mounted;
  - `virtualBufferSize` (pixels, rendered outside the viewport);
  - `borderCollapse` (true).
- **Selection:**
  - `rowsSelectable`;
  - `enableMultiRowSelection` (true);
  - `initiallySelected`;
  - `syncWithVar`: the *name* of a global holding `{ selectedIds }`;
  - `rowUnselectablePredicate`;
  - `hideSelectionCheckboxes`;
  - `selectionCheckboxPosition` (before, overlay), `selectionCheckboxAnchor`,
    `selectionCheckboxOffsetX`/`Y`, `selectionCheckboxSize`;
  - `keyBindings`: `selectAll`, `cut`, `copy`, `paste`, `delete`.
- **Refresh:**
  - `dataRefreshMode` (reset, preserve-state);
  - `refreshOn`: a performance workaround that re-renders items only when the
    bound value changes;
  - `pageInfo`: infinite scroll, with the events `requestFetchNextPage` and
    `requestFetchPrevPage` (`List.tsx` 756–757; *not declared in the metadata*,
    but `implement-infinite-scroll-pagination.md` uses
    `onRequestFetchNextPage`).

**Events**

- `scroll({ scrollTop, scrollHeight, viewportSize, atEnd, visibleRange, itemCount })`:
  user scrolls only;
- `visibleRangeDidChange({ startIndex, endIndex })`: whatever caused it,
  deduplicated;
- `selectionDidChange(items)`;
- `rowDoubleClick(item)`;
- `contextMenu`;
- `selectAllAction`, `cutAction`, `copyAction`, `pasteAction`, `deleteAction`,
  each `(row, selectedItems, selectedIds)`.

**API**

- `scrollToTop`, `scrollToBottom`, `scrollToIndex`, `scrollToId`;
- `getItemCount`, `getVisibleRange`;
- `clearSelection`, `getSelectedItems`, `getSelectedIds`, `selectAll`,
  `selectId(id | ids)`;
- `preserveStateOnNextDataRefresh(options)`.

**Context**

- `$item`, `$itemIndex`, `$isFirst`, `$isLast`, `$isSelected`.
- `$group`: the group row `{ id, key, items }` plus `isExpanded` and
  `toggle()` (`ListReact.tsx` 167–190, 1905–1939).

**Theme variables**

- `backgroundColor-List`, `backgroundColor-selected-List` (and `--hover`),
  `backgroundColor-row-List--hover`;
- the `*-selectionCheckbox-List` variables, which fall back to Checkbox's
  (`List.md` § Styling).

**Where it scrolls** (`ListReact.tsx` 787–821)

- **Its own scroll box:** when the List has a height, or stretches in a
  column flex parent (`height="*"`).
- **The nearest scrolling ancestor ("outside scroll"):** otherwise, for
  example the page.

**Selection is shared with Table** (`Table/useRowSelection.tsx`, 673 lines)

- click, Shift/Ctrl/Cmd-click;
- ArrowUp/Down, PageUp/Down;
- a focused row.

**What XMLUI learned the hard way with virtua** (from comments and tests in
`ListReact.tsx`):

- **`shift` must be true only when rows were prepended,** and it must be
  correct on the same render (virtua issue #284). Otherwise rendering breaks.
  XMLUI's `useShift` (684–720) detects a prepend by comparing the edge keys
  (#3936).
- **virtua binds its `scrollRef` once,** in a mount-only effect. On the first
  render the scroll parent isn't known yet, so XMLUI remounts the
  `Virtualizer` with a `key` when it is (1802–1819, #3760). We confirmed this
  in virtua 0.56's own source: `src/react/Virtualizer.tsx` 248–290 has an
  empty dependency list.
- **Following the bottom is all XMLUI's own code:** an effect on new rows, a
  `ResizeObserver` for content that grows later (Markdown, images), and a
  "programmatic scroll" flag so that only a user's scroll stops the follow
  (1155–1215). virtua's `onScroll` can't tell user scrolls from the List's own.
- **"ResizeObserver loop" errors** while scrolling are virtua's
  (`virtua-isolation.spec.ts`, #3830, a `test.fail()` against a bare virtua
  page).

**Doc/source disagreements** (to decide; see *Open questions*)

- **`availableGroups`:** the docs say the List shows only these groups. The
  source only *sorts* by them (`ListReact.tsx` 154–165), so other groups are
  still shown, and first, because their `indexOf` is -1.
- **The default `selectionCheckboxAnchor`** is `"left-center"`
  (`List.defaults.ts`), which is not one of its values (`center-left`, …).
- **`orderBy`'s metadata says `string`;** the docs and the source take
  objects.
- **`requestFetchNextPage`/`PrevPage`** are not in the metadata.

### Here

- **`Items`** (`components/src/items.tsx`) renders a template per item with no
  wrapper and no virtualization. It already loads a URL in `data` (`DataUrl`).
  Its template instances are keyed by index
  ([visibility-templates.md](../docs/visibility-templates.md)). A List must
  key them by `idKey`, which `templateRenderer(scope, $$TN)(context, key)`
  allows.
- **Templates:** `templates` and `childrenTemplate` in the metadata. Each
  instance has its own scope and its own IDs; context values update in a layout
  effect.
- **The App shell scrolls the window** (`scroll="page"`) or `.gfui-AppMain`
  (`scroll="content"`) ([app-shell.md](../docs/app-shell.md)). Step 28's
  `ScrollViewer` is another scroll container.
- **The spacing ladder** (19D): the List is a container whose rows get the
  ladder's gaps; `height="*"` star sizes exist.
- **Not built yet:** DataSource paging (`nextPageSelector`, `pageInfo`,
  `fetchNextPage`; [poc-20-data.md](poc-20-data.md), "Not in this step").
  `pageInfo` has nothing to bind to.
- **Step 27's `ContextMenu`** takes `openAt(ev, context)`. Pointer handlers get
  a frozen snapshot.
- **The prerender** renders at a breakpoint without a real viewport
  ([ssg.md](../docs/ssg.md)).

## Options considered

### A. The virtualizer *(the first decision)*

The candidates are virtua 0.56.0 (published 2026-11-25) and TanStack Virtual
(`@tanstack/react-virtual` 3.14.28 on `@tanstack/virtual-core` 3.19.13,
2026-11-22). react-virtuoso 4.18.24 (2026-11-20) is maintained too, unlike
architecture.md's "unverified", but it is opinionated and owns its DOM; it is
listed for size only.

**How it was measured.**

- **The prototype:** `.tmp/vproto/`, outside the repository's packages and
  ignored by git. It renders the same list with each library in a production
  build: React 19.3.1 in StrictMode, a 600 px scroll box, and 10,000 rows of
  1–12 lines of text whose heights are unknown until measured.
- **The driver:** `measure.mjs`, Playwright with Chromium. Three runs per
  case; the table shows the median.
- **virtua** is wired as XMLUI wires it: `Virtualizer` with `scrollRef`,
  XMLUI's `useShift`, and XMLUI's follow logic in a minimal form.
- **TanStack** uses `useVirtualizer` with `measureElement`,
  `anchorTo: "end"` and `followOnAppend`.

| Case | virtua | TanStack Virtual |
|------|--------|------------------|
| Mount, 10,000 rows (first two frames) | 11 ms | 15 ms |
| Mount, 100,000 rows | 9 ms | 38 ms |
| Fast scroll, 60 frames: blank viewport at 100 / 200 / 300 / 500 px per frame | 1 / 39 / 60 / 60 | 0 / 0 / 0 / 0 |
| Same, virtua `bufferSize` 600 / 1,200 (at 300 and 500 px per frame) | 4, 49 / 0, 0 | n/a |
| Most rows mounted while scrolling | 13 | 20 |
| `scrollToIndex(7000)` with unmeasured heights: error after settling | 0 px | 0 px |
| `scrollToBottom()`: distance from the end | 0 px | 0 px |
| Prepend 50 rows in the middle: jump of the visible row (next frame, settled) | 0, 0 px | 0, 0 px |
| Prepend 30 rows at the top: jump | 0 px | 0 px |
| Follow the bottom: 10 appends, then the last row grows 10 times (worst distance from the end) | 0 / 0 px (our own code) | 0 / 0 px (built in) |
| Stops following after the user scrolls up | yes (our own code) | yes (built in) |
| "ResizeObserver loop" errors, XMLUI's wheel pattern (#3830) | 0 | 0 |
| Server render of the first window | 30 rows (`ssrCount`) | 14 rows (`initialRect` 600 px ÷ the estimate + overscan) |
| Hydration errors | 0 | 0 |
| Size, minified / gzipped (React external) | 7.7 / **4.1 KB** | 37.2 / 11.1 KB |
| (react-virtuoso, for reference) | | 62.2 / 20.9 KB |
| Prototype list component, including the follow logic | 40 lines | 32 lines |

**What the numbers say.**

- **Correctness is a tie** on every hard case we could script: prepends,
  appends, growing rows, `scrollToIndex` with unknown heights, the server
  render and hydration. virtua 0.56 no longer shows XMLUI's ResizeObserver
  errors.
- **virtua is one frame behind the scroll position;** TanStack renders
  synchronously in the scroll handler (its React adapter uses `flushSync`).
  virtua is blank on most frames from 200 px per frame (a fast trackpad
  fling) at its default buffer of 200 px. A buffer of about 1,200 px hides
  it, at the cost of more mounted rows. This is why XMLUI has
  `virtualBufferSize`.
- **virtua is smaller and mounts faster;** at 100,000 rows it is about 30 ms
  faster.
- **Anchoring is built into TanStack.**
  - `anchorTo: "end"` keeps the visible row by key whenever the first or last
    key changes, so prepends need no `shift` bookkeeping.
  - `followOnAppend`, `isAtEnd()` and `scrollToEnd()` are what
    `scrollAnchor="bottom"` needs.
  - Growing rows above the fold are compensated, and a row that spans the fold
    is not (virtual-core `index.js` 1084–1105).
  - With virtua, XMLUI's `useShift`, the follow effect, the ResizeObserver and
    the programmatic-scroll flag are ours to write and maintain: the parts that
    caused XMLUI's #284, #3760 and #3936.
- **The scroll element:** TanStack reads `getScrollElement()` again on every
  update (virtual-core `_willUpdate`). virtua reads `scrollRef` once, the
  #3760 trap.
- **Maturity:** virtua is 0.x (228 releases; minor versions may break).
  TanStack Virtual is 3.x semver, and it pairs with TanStack Table v9 in step
  30.
- **Headless:** TanStack renders nothing; we own the DOM, the parts and the
  theme variables (architecture.md's constraint 2). virtua renders its
  container and item wrappers. Both have grid support for TileGrid: TanStack
  `lanes`, virtua `VGrid`.

1. **virtua:** what XMLUI uses. The smallest and fastest to mount. But XMLUI's
   workarounds come with it, and fast scrolls need a larger buffer.
2. **TanStack Virtual** *(recommended)*: anchoring and following are built in,
   it has no blank frames, it re-reads the scroll element, it is semver and
   headless, and it pairs with step 30's Table. It costs about 7 KB more
   gzipped (about 2.5% of the hello app's 272 KB of eager JavaScript), and
   mounting 100,000 rows takes 38 ms instead of 9.

### B. What step 29 covers

1. **Everything XMLUI's List has.** This includes `pageInfo` paging, which
   needs DataSource paging first (step 20 left it out), and the data-refresh
   modes.
2. **Everything except paging and the data-refresh modes** *(recommended)*.
   `pageInfo`, `requestFetchNextPage`/`PrevPage`, `dataRefreshMode` and
   `preserveStateOnNextDataRefresh` move to a later step, together with
   DataSource's `nextPageSelector`/`prevPageSelector`. This step has enough
   without them: virtualization, anchoring, groups, selection and keyboard
   actions.
3. **A core List:** data, templates, scrolling and groups, with selection and
   the keyboard actions left to step 30 (built once for both). This keeps the
   step small, but the List would ship without selection.

### C. `syncWithVar` and `refreshOn`

- **`syncWithVar`** names a global at runtime. Our globals are known at compile
  time (AGENTS.md *Decisions*).
- **`refreshOn`** exists because XMLUI re-renders every item on every reactive
  cycle. With signals, each item subscribes only to what it reads, so
  `refreshOn` would change nothing.

1. *(recommended)*
   - `syncWithVar="sel"` keeps XMLUI's markup. The compiler resolves the
     literal name to a known global (an error otherwise). The List reads and
     writes its `selectedIds`.
   - `refreshOn` is accepted and ignored, with a compile warning that says why.
2. **Both are errors** (`removedProps`). Use `initiallySelected` and
   `selectionDidChange` (or `selectId()`) instead.

### D. The prerendered window

1. **The first window** *(recommended)*: as many rows as fit a viewport at
   the prerender breakpoint, estimated (TanStack `initialRect`). The last
   window with `scrollAnchor="bottom"`. Takeover keeps them, as measured above
   (no hydration errors).
2. **Every row:** good for search engines, but the HTML grows with the data,
   and takeover unmounts most of it.
3. **No rows:** an empty box until takeover (XMLUI's behavior, since its List
   is client-only).

## Design

- **The virtualizer** (decision A) lives behind one small internal module,
  `components/src/virtual.ts`, so that Table, Tree and TileGrid reuse the
  setup:
  - finding the scroll element;
  - the scroll margin for outside scroll;
  - the render-cache indexes;
  - the server window.
- **Where it scrolls** (as XMLUI):
  - **Its own scroll box** when the List has a height or a max height, or a
    star size in a vertical Stack.
  - **The nearest scrolling ancestor** otherwise: the window under
    `App scroll="page"`, `.gfui-AppMain` under `scroll="content"`, or a
    `ScrollViewer`. The List's offset in that ancestor is the scroll margin.
  - Decided after mount from computed styles. TanStack re-reads the element,
    so nothing is remounted (unlike XMLUI's #3760 workaround).
- **Rows** are template instances keyed by `idKey`, falling back to the index
  with a runtime warning on duplicate or empty keys, as XMLUI does.
  - Group header and footer rows have their own keys.
  - Each row is measured (dynamic heights). `fixedItemSize` measures the first
    row and uses it as the size of every row.
  - `borderCollapse` and the ladder's gap between rows are CSS on the row
    wrapper.
- **The row model** is a pure function, tested in tables: `data` →
  filter nulls → `orderBy` → `limit` → groups (`groupBy`, `defaultGroups`,
  `availableGroups`, `hideEmptyGroups`, expanded state) → rows.
  - `$group` is `{ id, key, items, isExpanded, toggle() }`.
  - `toggle()` is a function the List puts into the context value. It is a
    closure of ours that touches no platform object, so the sandbox invariant
    holds; the implementation will check that with a test.
- **The render cache:** a bounded list of recently seen row keys (LRU,
  `renderCacheSize`) added to the virtualizer's range (TanStack
  `rangeExtractor`).
  - `virtualBufferSize` maps to overscan in pixels, converted to rows with the
    average measured size.
- **`scrollAnchor="bottom"`:**
  - `anchorTo: "end"` and `followOnAppend`;
  - the initial scroll to the end;
  - the follow stops on a user scroll up and resumes at the end.
  - The `scroll` event fires for user scrolls only (TanStack's
    `scroll-classifier` tells them apart; to verify in the implementation).
  - `visibleRangeDidChange` fires on any change, deduplicated.
- **Selection** is a framework-free model in `components/src/selection.ts`,
  built to be reused by step 30's Table:
  - selected ids;
  - the anchor and focused row;
  - click, Shift- and Ctrl/Cmd-click;
  - arrows, PageUp/Down, Home/End;
  - `rowUnselectablePredicate`;
  - `initiallySelected`, `syncWithVar` (decision C).

  It renders as Mantine `Checkbox`es (before, or overlaid at the anchor), with
  `aria-selected` rows in a `role="listbox"` (`aria-multiselectable`).
  `$isSelected` is in the row's context.
- **Keyboard actions:** `keyBindings` (`CmdOrCtrl+A`, …) on the focused List
  fire `selectAllAction`, `cutAction`, `copyAction`, `pasteAction` and
  `deleteAction` with `(row, selectedItems, selectedIds)`. `selectAll` selects
  first, as XMLUI does.
- **Loading and empty states:**
  - `loading` shows a Spinner after `loadingDelay`;
  - an empty list shows `emptyListTemplate`, or "No data available";
  - `data` as a URL reuses `DataUrl`, as `Items` does.
- **Events with plain data only:**
  - `scroll(state)`, `visibleRangeDidChange(range)`, `selectionDidChange(items)`;
  - `rowDoubleClick(item)`;
  - `contextMenu` with the pointer snapshot. *Divergence:* it also passes the
    row's item, which step 28 found missing for Tabs.
- **The API:** the scroll methods, `getItemCount`, `getVisibleRange` and the
  selection methods, through `wrapComponent`'s API context.
- **The prerender** (decision D): the first window, or the last one for
  `scrollAnchor="bottom"`.
- **Metadata** from `List.tsx`. The theme variables from `List.md` §
  Styling, with our tokens as defaults.
- **The doc/source disagreements** follow the decisions under *Open questions*.

## Steps

- [x] Record the virtualizer decision; add the dependency (and
      `optimizeDeps.include` in every fixture config).
- [x] The row model (`orderBy`, `limit`, groups) as pure functions, with
      tables.
- [x] `List` on the virtualizer: own and outside scroll, dynamic and fixed
      sizes, the render cache, the buffer, empty and loading states, `data` as
      a URL.
- [x] Groups: header and footer templates, `$group`, folding.
- [x] `scrollAnchor="bottom"`, the `scroll` and `visibleRangeDidChange`
      events, the scroll API.
- [x] The selection model (`selection.ts`), checkboxes, keyboard,
      `keyBindings` and their action events, the selection API,
      `syncWithVar`/`refreshOn` (decision C).
- [x] The prerendered window (decision D).
- [x] Unit tests (jsdom); playground scenarios ("Long lists", "Chat feed",
      "Grouped and selectable lists"); E2E.
- [x] Docs: `code-structure.md`, a new `list.md`; `architecture.md`'s
      virtualizer paragraph; *Decisions* in `AGENTS.md`.
- [x] `npm run check`; measure the bundle.

## Verification

- **jsdom:**
  - the row model tables (order, limit, groups, empty groups, default and
    available groups, folding);
  - the selection model tables (clicks with modifiers, keys, unselectable
    rows, single vs multi);
  - the context variables, events with their arguments, the API;
  - keys by `idKey` (row state survives a reorder) and the duplicate-key
    warning;
  - `syncWithVar` compile errors;
  - the prerendered window.
- **E2E (real layout):**
  - 10,000 rows of different heights: mounted rows stay bounded, and fast
    scrolling shows no blank viewport at default settings (the prototype's
    coverage check);
  - `scrollToIndex` and `scrollToId` land exactly (measured);
  - the chat list starts at the bottom, follows appends and a growing row
    (Markdown), keeps its place when older rows are prepended, and stops
    following after a user scroll;
  - outside scroll under `App scroll="page"` and `scroll="content"`, and in
    a `ScrollViewer`;
  - groups fold;
  - selection by mouse and keyboard, and `copyAction` with the right
    arguments;
  - a prerendered List taken over without DOM changes or hydration errors;
  - no "ResizeObserver loop" errors (a capture-phase listener, as in XMLUI's
    isolation test).

## Outcome

- **The component:** `List` ([list.md](../docs/list.md)): virtualized on
  TanStack Virtual (`@tanstack/react-virtual` 3.14.28, the only new
  dependency), in its own scroll box or its container's; dynamic heights,
  `fixedItemSize`, the render cache, `virtualBufferSize`; `orderBy`, `limit`;
  groups with header and footer templates that fold; `scrollAnchor="bottom"`;
  selection by mouse, keys and checkboxes; `syncWithVar`; the keyboard actions;
  `scroll`, `visibleRangeDidChange`, `selectionDidChange`, `rowDoubleClick`,
  `contextMenu`; the scroll and selection API; `data` as a URL.
- **Shared for steps 30–31:** `selection.ts` (XMLUI's selection rules, for
  Table) and `virtual.ts` (the scroll container, element-or-window observers,
  the render cache, user-scroll detection).
- **The compiler:** `PropMetadata.variableName` and **E039**.
- **The playground:** "Long lists", "Chat feed", "Grouped and selectable
  lists" (45 scenarios). The hello app has a List, so the prerender and
  takeover are checked on it.
- **Evidence:** `npm run check` passes and prints no warnings: 3,010 unit
  tests in 108 files, 247 E2E tests. New: `components/tests/list-model.test.ts`
  (59), `list.test.tsx` (14), `compiler/tests/module/list.test.ts` (10), a
  List case in `data.test.tsx`, `e2e/list.spec.ts` (9; passed 27 of 27 with
  `--repeat-each=3`), three scenario tests, a List check in `ssg.spec.ts`.
- **Size** (measured against a build of `master`): the hello app's eager
  JavaScript 995 → 1,056 KiB (272 → 290 KiB gzipped): TanStack Virtual 35 KiB,
  the List's code 17 KiB, its metadata and CSS the rest. `gfui.js` 1,453 →
  1,481 KiB.

### Findings

- **A re-sort jumped to the end.** `anchorTo: "end"` keeps the visible row by
  key whenever an edge key changes, so after `orderBy` reversed the rows it
  followed `Row 0` to the bottom (XMLUI's #3936 in another form). Anchoring is
  now used only when the old first or last key survives (`keepsAnEdge`); a sort
  or new data keeps the scroll offset, as XMLUI's `useShift`.
- **A List scrolling with the page drew its rows below its box:** the List had
  `min-height: 0` and shrank in a Card. Only a List with its own scroll box may
  shrink now.
- **The offset in the scroll container goes stale** when content above the List
  changes size (another List's rows measured, text wrapping). A
  `ResizeObserver` on the ancestors up to the container re-measures it.
- **A pre-existing Card bug** (step 23): `.gfui-Card-header` had
  `flex-basis: 100%` in every Card, which in a vertical Card is its height, so a
  Stack after the title (which has `min-height: 0`) was squeezed: a wrapping
  HStack 36 → 4 px. The rule is now for horizontal Cards only.
- **A click elsewhere counted as a user scroll:** the tracker marked any
  `pointerup`; now only one that ends a press on the scroll container.
  TanStack's own scroll classification (`scroll-classifier`) is private, so the
  List tracks input itself.
- **jsdom gives the window a size,** so a List went virtual against it and
  TanStack called `window.scrollTo` (not implemented in jsdom). The List now
  attaches only once it has a layout box, which also covers a List mounted in a
  hidden tab.
- **A flaky Select test, a real race** (step 25's code, found in review): after
  ArrowDown opened a Select, Mantine looked for the highlighted option in a
  `setTimeout(0)`, before its transition mounted the options in an animation
  frame. On a busy machine (the full E2E run) the next ArrowDown then started
  over from the first option, and Enter picked Apple instead of Banana: 1 of
  30 parallel runs. The Select now sets the highlight when the options mount
  (`settleOnOpen` in `choice.tsx`); 150 of 150 parallel runs passed after it.
- **lodash's `orderBy` puts `null` first when descending** (it negates the whole
  comparison); we match it, since XMLUI uses lodash.

### Divergences from XMLUI

- **`availableGroups` filters** (decision 5; XMLUI's source only orders).
- **`syncWithVar` is resolved at compile time** (E039), and may name any
  variable visible at the List, not only a global.
- **`refreshOn` is ignored** with a warning (each row follows only what it
  reads).
- **`selectionDidChange` fires on changes,** not also on mount with the initial
  selection.
- **`contextMenu` passes the row's item** after the pointer snapshot.
- **`$itemIndex`, `$isFirst`, `$isLast` count the items** in display order; XMLUI
  counts rows, group headers and footers included.
- **`selectionCheckboxAnchor` defaults to `center-left`** (XMLUI's default is
  not one of its values).
- **Of XMLUI's ten `*-selectionCheckbox-List` theme variables, none is
  declared:** the checkboxes use Checkbox's variables. `outlineColor-row-List--focus`
  is ours (the focused row).
- **The prerender shows the first 20 rows** (the last 20 with
  `scrollAnchor="bottom"`); XMLUI's List renders on the client only.

### Open for later steps

- **Paging:** `pageInfo`, `requestFetchNextPage`/`PrevPage`, with DataSource's
  `nextPageSelector` (decision 2).
- **`dataRefreshMode` and `preserveStateOnNextDataRefresh`.**
- **XMLUI's checkbox theme variables** (`*-selectionCheckbox-List`).
- **A static window sized from the viewport:** `STATIC_ROWS` is a constant.
- **Touch and iOS Safari** were not tested (Chromium only), nor screen readers
  with a virtualized listbox (`aria-setsize`/`aria-posinset` are set).

## Decisions (asked 2026-11-26)

1. **The virtualizer is TanStack Virtual** (`@tanstack/react-virtual`;
   option A2), shared by List, Table, Tree and TileGrid.
2. **The scope is everything except paging and the data-refresh modes**
   (option B2). `pageInfo`, `requestFetchNextPage`/`PrevPage`,
   `dataRefreshMode` and `preserveStateOnNextDataRefresh` wait for DataSource
   paging.
3. **`syncWithVar` is resolved at compile time; `refreshOn` is ignored with a
   warning** (option C1).
4. **The prerender shows the first window,** or the last one with
   `scrollAnchor="bottom"` (option D1).

5. **`availableGroups` filters** (as the docs say): only these groups are
   shown, in this order (a divergence from XMLUI's source, which only orders).
6. **The smaller disagreements** as proposed: `orderBy` takes
   `{ field, direction }` or an array of them; `selectionCheckboxAnchor`
   defaults to `center-left`; `requestFetchNextPage`/`PrevPage` are declared
   when paging is built.
