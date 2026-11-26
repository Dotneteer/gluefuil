# Step 31: Tree, TileGrid and Items

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the ninth batch of Phase F: `Tree`,
`TileGrid` and the rest of `Items` (`Pagination` moved to step 30). E2E is
needed for virtualized scrolling. The step builds on steps 29–30: the
virtualizer (`useVirtualRows`, `virtual.ts`), the row selection
(`useRowSelection`, `row-selection.ts`; the rules in `selection.ts`), the
static window and its takeover, `syncWithVar` (`variableName`, E039),
`matchesKeyBinding`.

## Goal

```xml
<Tree id="files" data="{nodes}" height="400px" defaultExpanded="first-level"
      selectedValue="{current}" onSelectionDidChange="e => current = e.newNode?.id"
      onLoadChildren="node => loadFolder(node.id)">
  <property name="itemTemplate">
    <HStack><Icon name="{$item.hasChildren ? 'folder' : 'doc'}"/><Text>{$item.name}</Text></HStack>
  </property>
</Tree>

<TileGrid data="/api/photos" height="*" itemWidth="160px" itemHeight="180px"
          itemsSelectable="true" syncWithVar="picked">
  <Card><Image src="{$item.thumb}"/><Text>{$item.title}</Text>
        <Badge when="{$selected}" value="selected"/></Card>
</TileGrid>

<Items data="{{ b: 'second', a: 'first' }}"><Text>{$item}</Text></Items>
```

XMLUI's markup and behavior; the first rows and tiles prerendered; scrolling,
keys, expansion, lazy loading and selection proven in a real browser.

## Background

### XMLUI

- **Tree:** metadata `xmlui/src/components/Tree/Tree.tsx` (710 lines),
  defaults `Tree.defaults.ts`, implementation `TreeReact.tsx` (3,629 lines), the
  data conversion `xmlui/src/components-core/utils/treeUtils.ts` (`toFlatTree`,
  `flatToNative`, `hierarchyToNative`), styles `TreeComponent.module.scss`, nine
  spec files (about 14,000 lines); docs
  `website/content/docs/reference/components/Tree.md`.
- **TileGrid** (status "experimental"): `xmlui/src/components/TileGrid/TileGrid.tsx`
  (576 lines), `TileGridReact.tsx` (520), `TileGrid.defaults.ts`,
  `TileGrid.module.scss`; docs `TileGrid.md`.
- **Items:** `xmlui/src/components/Items/Items.tsx`, `ItemsReact.tsx` (62 lines),
  `Items.spec.ts`; docs `Items.md`.
- **How-to guides** (`website/content/docs/pages/howto/`):
  `configure-tree-data-format-and-mapping.md`,
  `lazy-load-tree-children-on-expand.md`,
  `keep-tree-data-stable-during-refetch.md`,
  `pre-select-a-tree-node-on-load.md`,
  `preserve-tree-state-across-data-refreshes.md`,
  `build-a-responsive-card-grid.md`, `sync-tilegrid-selection-across-grids.md`.

**Tree props** (`Tree.tsx` 57–262; defaults `Tree.defaults.ts`)

- **Data:** `data` (required), `dataFormat` (`flat`: `parentId` links;
  `hierarchy`: nested `children`), the field mappings `idField`, `nameField`,
  `iconField`, `iconExpandedField`, `iconCollapsedField`, `parentIdField`,
  `childrenField`, `selectableField`, `loadedField`, `dynamicField`,
  `autoLoadAfterField`.
- **Expansion:** `defaultExpanded` (`none`, `first-level`, `all`, or an array
  of ids whose paths open), `autoExpandToSelection` (true), `itemClickExpands`,
  `iconExpanded`/`iconCollapsed` (chevrondown, chevronright), `iconSize` (16),
  `animateExpand` (one icon, rotated by `expandRotation`, 90).
- **Selection:** `selectedValue`, its alias `selectedId`; a node's
  `selectable` field. Single selection only (`aria-multiselectable="false"`).
- **Lazy loading:** `dynamic` (default for every node), `loadChildren` event,
  `spinnerDelay` (0), `autoLoadAfter` (ms; reload on re-expansion after that
  long collapsed).
- **State:** `initialTreeState`, `dataRefreshMode` (`reset`, `preserve-state`).
- **Rows and scrolling:** `itemHeight` (32, the estimate), `fixedItemSize`,
  `scrollStyle`, `showScrollerFade`, `overflow`, `itemTemplate`.

**Tree events:** `selectionDidChange`, `nodeDidExpand(node)`,
`nodeDidCollapse(node)`, `loadChildren(node)` (returns the children),
`contextMenu` (`$item`), `cutAction`, `copyAction`, `pasteAction`,
`deleteAction` (the focused node).

**Tree API:** `expandAll`, `collapseAll`, `expandToLevel`, `expandNode`,
`collapseNode`, `selectNode`, `selectNodeByIndex`, `clearSelection`,
`getNodeById`, `getExpandedNodes`, `getSelectedNode`, `scrollIntoView`,
`scrollToItem`, `getVisibleItems`, `getTreeState`, `setTreeState`,
`preserveStateOnNextDataRefresh`, `appendNode`, `removeNode`,
`removeChildren`, `insertNodeBefore`, `insertNodeAfter`, `replaceNode`,
`replaceChildren`, `getNodeLoadingState`, `markNodeLoaded`,
`markNodeUnloaded`, `getExpandedTimestamp`, `setAutoLoadAfter`,
`getNodeAutoLoadAfter`. (`TreeReact.tsx` also registers `getDynamic` and
`setDynamic`, 3477–3510, which no metadata or doc mentions.)

**`$item` in the template** (`Tree.md` § Item templates; `Tree.tsx` 617–625):
`id`, `name`, `depth`, `isExpanded`, `hasChildren`, `children`, `selectable`,
`parentId`, `parentIds`, `path`, `loadingState`, and every source field.

**How XMLUI builds the Tree** (`TreeReact.tsx`):

- **A flat list of rows on virtua** (`<Virtualizer>`, 3597): the visible nodes
  in order, each a `role="treeitem"` with `aria-level`, `aria-expanded`,
  `aria-selected` (217–222) inside a `role="tree"` container (3577); indentation
  is a 10 px placeholder per level (238). No `aria-setsize`/`aria-posinset`.
- **Keys** (2329–2400): Up, Down, Home, End; Right expands or enters the first
  child; Left collapses or goes to the parent; Enter selects and toggles;
  Space selects; Ctrl/Cmd+X, C, V and Delete fire the action events.
- **A mouse-down selects** (143–155); the toggle gutter expands without
  selecting (133–140).
- **Loaded children and API edits go into an internal copy of `data`**
  (`internalData`, 737; `effectiveData = internalData ?? data`, 741). By
  reading, nothing sets it back to `undefined`, so after the first load or edit
  later changes of `data` seem not to reach the tree: to confirm while
  implementing (decision C).
- **Loaded children in flat format get `parentId: String(node.key)`**
  (2015, 2128): numeric ids become strings.
- **Selection is controlled only when a `selectionDidChange` handler exists**
  (`isControlledMode = !!onSelectionChanged`, 873); otherwise `selectedValue`
  is read once on mount (729–731, 1627–1632).

**TileGrid props** (`TileGrid.tsx`; defaults `TileGrid.defaults.ts`):
`data`, `itemWidth` (120px), `itemHeight` (140px), `gap` (8px),
`stretchItems`, `loading`, `itemsSelectable`, `enableMultiSelection` (true),
`toggleSelectionOnClick`, `syncWithVar` (a variable holding `{ selectedIds }`,
as Table's), `refreshOn`, `hideSelectionCheckboxes`, `checkboxPosition`
(`topStart`, `topEnd`, `bottomStart`, `bottomEnd`), `idKey` (id),
`itemUserSelect` (none), `itemTemplate`.
**Events:** `selectionDidChange(items, ids)`, `itemDoubleClick`,
`cutAction`/`copyAction`/`pasteAction`/`deleteAction(focused, items, ids)`,
`selectAllAction(items, ids)`, `contextMenu` (`$item`, `$itemIndex`).
**Context:** `$item`, `$itemIndex`, `$isFirst`, `$isLast`, `$selected`.

**How XMLUI builds the TileGrid** (`TileGridReact.tsx`):

- **Rows of tiles on virtua:** the column count from the measured width,
  `floor((width + gap) / (itemWidth + gap))` (206–209); the items chunked into
  rows (228–235); one fixed-size virtual item per row (423–515), `role="grid"`,
  `row`, `gridcell`.
- **Nothing renders until the width is known** (`containerWidth > 0`, 422): no
  prerender.
- **Selection is Table's `useRowSelection`** (238–247); 2-D keys
  (`computeNextFocusIndex`, 38–80: arrows, Home/End per row, Ctrl+Home/End,
  PageUp/PageDown by the visible rows); Ctrl+arrows move the focus without
  selecting.

**Items** (`ItemsReact.tsx`): an object's values in `orderedKeys` order
(integer keys ascending first, then strings; `components-core/utils/orderedKeys.ts`);
`reverse`; keys `${id}:${index}` from `$id`, `id` or `key`, else the index
(17–25), so a new item identity at an index remounts its template
(`Items.spec.ts` 99, "remounts item template when … item identity changes").

### Disagreements in XMLUI found while reading

| Where | What |
|-------|------|
| `Tree.tsx` 342–432 | Thirteen API entries (`expandNode` … `getNodeAutoLoadAfter`) are nested inside `expandToLevel`'s object, so `Tree.md` § Exposed Methods omits them; `TreeReact.tsx` implements them and the how-to guides use `selectNode` and `scrollIntoView`. |
| `Tree.tsx` 268–271 vs `TreeReact.tsx` 1137–1140 | The metadata says `selectionDidChange({ selectedNode, previousNode })`; the code passes `{ previousNode, newNode }` (as `pre-select-a-tree-node-on-load.md` does). |
| `Tree.md` 108 | Says `expandOnItemClick`; the prop is `itemClickExpands`. |
| `Tree.tsx` 132–138 | `fixedItemSize`'s default is `defaultProps.animateExpand` (false either way). |
| `TileGrid.tsx` vs `TileGridReact.tsx` 276–295 | No `apis` in the metadata (`TileGrid.md`: "does not expose any methods"); the code registers `clearSelection`, `selectAll`, `selectId`, `getSelectedItems`, `getSelectedIds`. |
| `TileGridReact.tsx` 470 | `itemDoubleClick(item, itemIndex)` is called with the item only. |
| `TileGridReact.tsx` 318–336 | The action events always pass `null` as the focused item. |
| `TileGridReact.tsx` 300, 419 | Keys and focus work only with `itemsSelectable`. |

### Here

- **Steps 29–30:** `useVirtualRows` takes the rows' keys and does the static
  window (`STATIC_ROWS`), attaching, `scrollMargin`, anchoring, the render
  cache, user scrolls; `useRowSelection` keeps a selection with
  `initiallySelected`, `syncWithVar` both ways and `selectionDidChange`; the
  rules (`pickRow`, `keyTarget`, `selectAllRows`, `selectKeys`) are framework-free.
  A Tree's visible nodes are a list of keys, so it fits as it is; a TileGrid's
  rows are too.
- **`Items` exists** (`components/src/items.tsx`, step 10; a URL in `data`
  since step 20): `$item`, `$itemIndex`, `$isFirst`, `$isLast`, `reverse`, no
  wrapper element. Missing: an object as `data` (it renders nothing), and its
  instances are keyed by index (`visibility-templates.md` § Templates).
- **`eventResults`** (step 20) lets a handler return a value: `loadChildren`
  needs it.
- **Step 28's ScrollViewer** has `scrollStyle` and `showScrollerFade`; step 27
  gives `contextMenu` its pointer snapshot; step 23's `Icon` and `Spinner` draw
  the toggles and the loading state.
- **Data values are deep-frozen:** edits to the Tree's nodes (loaded children,
  `appendNode`, …) make new arrays.

## Options considered

### A. The tree model *(decided: headless-tree)*

What a Tree needs: an index of the data (flat or nested, mapped fields), the
visible rows for the expanded set, default expansion and paths to a node,
loading states, edits, a state to save and restore, and a refresh that keeps
it. The virtualizer and the rows are ours either way.

**Measured** (`.tmp/vproto/.size-tree/`: `bench.mjs`, `bench3.mjs`,
`bench4.mjs`): `@headless-tree/core` and `/react` 1.8.1, a headless tree with
features registered one by one, against a sketch of our own (an index, then a
depth-first walk of the expanded nodes). Node, medians; flat data, 10 roots,
fan-out 6.

| | headless-tree | Our own sketch |
|---|---|---|
| Size (esbuild, minified, React external) | 19.1 KB, **6.0 KB gzipped** (sync loader, selection, keys); 23.9 KB, 7.1 KB with the async loader, search, expand-all | none |
| Expand all, 5,000 / 50,000 nodes, warm | 9 / **113 ms** | 1.5 / 4.2 ms (plus an index once per data: 1.1 / 5.6 ms) |
| Toggle one node, 5,000 / 50,000 nodes all expanded | 7 / **90 ms** | the same walk: under 1.5 / 4.2 ms |
| First expand-all of a new tree, 50,000 | 333–475 ms (cold) | 10 ms |
| Why | every state change rebuilds every visible item instance (about 2 µs a row) | a walk that builds plain row records |

- **A first reading was wrong:** `isExpanded` is
  `expandedItems.includes(id)`, which looked quadratic. A custom feature
  answering it from a `Set` changed nothing (258 vs 270 ms; 99 vs 90 ms per
  toggle): the cost is linear, per visible row and per change.
- **In practice:** a tree of a few thousand visible nodes toggles in a few
  milliseconds; a fully expanded 50,000-node tree takes about 90 ms per click.

What headless-tree would bring: multi-selection, typeahead search,
drag and drop, renaming, `aria-setsize`/`aria-posinset`. XMLUI's Tree has none
of the first four. What it would not: the flat and nested formats with mapped
fields, `loadingState`, `spinnerDelay`, `autoLoadAfter`, tree state,
`preserve-state`, the edit API. Its state can be controlled (`state`,
`setState`), so our signals can own it.

1. **headless-tree** *(chosen)*: keys, focus, the tree's ARIA props and a path
   to typeahead and drag and drop; a rebuild per change (about 90 ms at 50,000
   visible rows); most of XMLUI's Tree still ours.
2. **Our own model** (recommended first): `tree-model.ts`, React-free, tested
   in tables, as steps 29–30 did for the List and the Table.

### B. TileGrid virtualization *(decided: rows of tiles)*

**Compared in a prototype** (`.tmp/vproto/tiles.html`, `src/tiles.tsx`,
`measure-tiles.mjs`): 10,000 tiles of 120 × 140 px, gap 8 px, in a
900 × 600 box (7 columns), TanStack Virtual in both, React 19 production
build, Chromium, three runs each (medians).

- **Rows:** the items chunked into rows of `cols` tiles; one virtual item per
  row (XMLUI's way, on virtua there).
- **Lanes:** one virtual item per tile, TanStack's `lanes = cols`.

| Case | Rows of tiles | Lanes |
|------|---------------|-------|
| Mount, 10,000 / 100,000 tiles | 17 / 13 ms | 19 / **27 ms** (TanStack measures every tile, not every row) |
| Fast scroll, 60 frames at 600 px: blank frames; frame p50 / p95 / max | 0; 16.6 / 17.5 / 17.9 ms | 0; 16.7 / 18.3 / 18.8 ms |
| Scroll to tile 5,003 | exact (top 0, left 640) | exact (top 0, left 640) |
| Narrowing the box 900 → 600 px at tile 5,003 (7 → 4 columns) | 1–2 ms, no blank frame; **the place is lost** (first tile 4,998 → 2,856) | 2 ms, no blank frame; **the place is lost** (the same) |
| DOM nodes in the box | 155 | 225 (a positioned wrapper per tile) |
| "ResizeObserver loop" errors (wheel, resize) | 0 | 0 |
| Accessibility tree | grid → rows → gridcells | **grid → gridcells with no rows** (invalid for `role="grid"`; rows would need extra wrappers that lanes can't place) |

- **Speed is the same.** Both need code to keep the first visible tile in view
  when the column count changes.
- **Lanes would allow tiles of different heights** (masonry); XMLUI's tiles
  have a fixed `itemHeight`.

1. **Rows of tiles on `useVirtualRows`** *(recommended)*: a row's key is its
   first tile's key; the render cache and anchoring work on rows; a valid grid.
2. **Lanes:** per-tile keys, a masonry path later; no row elements, and more
   work at 100,000.

### C. Where loaded children and API edits live *(decided: a copy that follows `data`)*

`loadChildren`'s results and `appendNode`, `removeNode`, `replaceNode`, …
change the tree's nodes. Our `data` is frozen and usually a variable or a
DataSource.

1. **XMLUI's internal copy:** the first edit forks `data`, and (by reading
   `TreeReact.tsx` 737–741) later changes of `data` no longer show.
2. **A working copy that follows `data`** *(recommended)*: the Tree keeps its
   own copy, replaced by every new `data` value. In `reset` mode, a new value
   starts over (default expansion, nothing loaded). In `preserve-state` mode
   (or after `preserveStateOnNextDataRefresh()`), expansion, selection,
   loading states and the loaded children of nodes whose ids survive are kept.
   The app's variable never changes behind its back.
3. **Write-back:** when `data` is a plain variable, the compiler also passes a
   setter (as `syncWithVar`'s) and edits are written to it. The app sees every
   edit, also lazily loaded children; a DataSource can't be written.

### D. `selectedValue` *(decided: the initial selection, following changes)*

1. **XMLUI's:** controlled only when a `selectionDidChange` handler exists;
   otherwise read once.
2. **The initial selection, and it follows later changes** *(recommended)*,
   handler or not, as step 30's `sortBy`: a click selects at once (and fires the
   event); a new `selectedValue` selects that node (and opens its path with
   `autoExpandToSelection`). The how-to guide's pattern
   (`selectedValue="{v}"` plus `onSelectionDidChange="e => v = e.newNode?.id"`)
   works the same, and a variable alone also drives it.

### E. How much of the Tree *(decided: all of it)*

1. **All of it** *(recommended, as step 30's decision 4)*: every prop, event
   and API above (also the thirteen the metadata hides), `initialTreeState`,
   `getTreeState`/`setTreeState`, `dataRefreshMode`,
   `preserveStateOnNextDataRefresh` with its scroll intents, `autoLoadAfter`,
   `spinnerDelay`, `scrollStyle`/`showScrollerFade`. Not `getDynamic` and
   `setDynamic` (undocumented).
2. **The core now:** data and mapping, expansion, selection, keys, templates,
   lazy loading with `loadingState`, the navigation and expansion API. Tree
   state, `preserve-state`, `autoLoadAfter` and the edit API later.

### F. How `Items` keys its instances *(decided: the id, else the index)*

The key decides whether a template instance (its variables, an input's text)
stays with its item.

1. **The index** (now): a prepended item takes over the first instance's state.
2. **XMLUI's `${id}:${index}`:** a new item at an index remounts; a move
   remounts too.
3. **The id when there is one** (`$id`, `id` or `key`, as XMLUI looks them up),
   else the index; a duplicate id falls back to the index *(recommended)*:
   state stays with its item through inserts and moves, and a new identity
   remounts (XMLUI's test passes).

## Design

- **A new dependency** (decision A): `@headless-tree/core` and
  `@headless-tree/react` 1.8.1 in `@gluefuil/components`, allowed in
  `tools/boundaries.ts` and listed in every fixture's `optimizeDeps.include`.
- **Files:** `components/src/tree-model.ts` (React-free: the index for both
  formats and the field mapping, the working copy and its edits, default
  expansion, paths, tree state, refresh reconciliation; it is headless-tree's
  data loader), `tree.tsx` (headless-tree's `useTree` with our state);
  `tilegrid.tsx` (the column count; the 2-D key targets in `selection.ts`
  beside `keyTarget`); `items.tsx` changes. Reused: `useVirtualRows`,
  `useRowSelection`, `selection.ts`, `matchesKeyBinding`, `DataUrl`, the
  ScrollViewer styles, `pointerData`.
- **headless-tree's part:** the item instances (`tree.getItems()`: the visible
  rows with level, set size and position), focus, the keys
  (`hotkeysCoreFeature`, mapped to XMLUI's: Right enters the first child, Enter
  selects and toggles, Space selects; the action keys through
  `matchesKeyBinding`), and the rows' ARIA props. Its state (`expandedItems`,
  `focusedItem`) is controlled: it lives in the component's store (as built:
  a plain object in a ref, not signals; see *Outcome*), so the API, tree state
  and refresh write it directly.
  The sync data loader reads the working copy (decision C); loading is ours
  (`loadingState`, `spinnerDelay`, `autoLoadAfter`), not its async loader. No
  multi-selection: its selection feature is left out.
- **Tree rows:** headless-tree's visible items' keys go to `useVirtualRows`
  (own scroll box with a height, else its container's); rows measured, the
  estimate `itemHeight`, `fixedItemSize` as List's. `role="tree"` with
  `treeitem` rows carrying `aria-level`, `aria-expanded`, `aria-selected`,
  `aria-setsize` and `aria-posinset` (XMLUI sets neither). Indentation is a
  theme variable per level. One tab stop (roving focus).
- **Cost to watch:** a change rebuilds the visible items (about 2 µs a row,
  measured): the playground gets a 50,000-node tree, and the E2E test records
  a toggle's time there.
- **The template** sees `$item` with XMLUI's fields; without one, an Icon (when
  `icon`) and the name (XMLUI's default template, `Tree.tsx` 572–593).
- **Expansion:** the gutter toggles; `itemClickExpands`; the keys as XMLUI's; `nodeDidExpand`/`nodeDidCollapse`;
  `defaultExpanded`; `autoExpandToSelection`; the icons, `iconSize`,
  `animateExpand`/`expandRotation`.
- **Lazy loading:** a node is dynamic by `dynamicField`, `dynamic`, or
  `loaded: false`; expanding it calls `loadChildren` (an async handler with a
  result), shows the Spinner after `spinnerDelay`, and puts the result in the
  working copy (decision C), keeping the ids' types (XMLUI makes them strings).
  `autoLoadAfter`, `markNodeUnloaded`/`markNodeLoaded`.
- **Selection** (decision D): one id, a signal; `selectedValue` sets it on
  mount and whenever it changes; mouse-down selects (XMLUI);
  `selectableField`; `selectionDidChange({ newNode, previousNode })`. Not
  `useRowSelection`: no multi-selection, ranges or checkboxes.
- **State and refresh** (decisions C, E): `getTreeState()` gives XMLUI's
  `TreeState`, `{ [id]: { expanded, collapsed, loaded, loadingState, selected,
  expandedTimestamp, collapsedTimestamp, autoLoadAfter }, scrollPosition }`
  (`components-core/abstractions/treeAbstractions.ts` 68–82), so saved states
  carry over;
  `initialTreeState` and `setTreeState` apply it as nodes appear.
- **TileGrid** (decision B): the column count from the measured width; rows of
  tiles on `useVirtualRows`, each a `role="row"` of `gridcell`s; a resize keeps
  the first visible tile in view (the prototype showed both ways lose it).
  `stretchItems` widens the tiles to fill a row. Selection is `useRowSelection`
  (`syncWithVar` with E039, `enableMultiSelection`, `toggleSelectionOnClick`,
  checkboxes at `checkboxPosition`), `$selected` in the template; the 2-D keys
  of `computeNextFocusIndex`; the action events with the focused item (XMLUI
  passes `null`); `itemDoubleClick(item, index)`; the five API methods XMLUI
  registers. The grid is focusable when tiles are selectable (XMLUI) or when
  it has action handlers.
- **Prerender:** the Tree's static window is its first `STATIC_ROWS` visible
  rows (with `defaultExpanded`) and the takeover reuses them, as List's. The
  TileGrid's static window is the first tiles in a CSS grid
  (`repeat(auto-fill, itemWidth)`), so the prerender is laid out without
  knowing the width; the takeover replaces these nodes with rows once (XMLUI
  prerenders nothing). To measure: the shift at takeover.
- **Items** (decision F): an object's values in `orderedKeys` order; the key.
- **Not in step 31:** `refreshOn` (ignored with a warning, as List's);
  `loading` shows a Spinner in place of the tiles.
- **Theme variables:** XMLUI's names (`TreeComponent.module.scss`,
  `TileGrid.module.scss`), our tokens as defaults.

## Steps

- [x] `tree-model.ts`: both formats, mapping, the working copy and edits,
      default expansion, paths, tree state, refresh; tables. headless-tree
      added (boundaries, fixtures).
- [x] The Tree: rows on `useVirtualRows`, the template, expansion, keys, focus,
      selection, lazy loading, events, the API, the prerender.
- [x] The TileGrid: columns, rows, keeping the place on resize, selection,
      keys, events, the API, the prerender.
- [x] Items: objects, keys.
- [x] Unit tests (jsdom); playground scenarios ("Trees", "Lazy trees", "Tile
      grids"); E2E.
- [x] Docs: `code-structure.md`, a new `tree.md` (Tree and TileGrid),
      `visibility-templates.md` (Items); *Decisions* in `AGENTS.md`.
- [x] `npm run check`; measure the bundle.

## Verification

- **jsdom:** tables for the model (both formats, mappings, visible rows per
  expansion, `defaultExpanded` forms, paths, every edit, tree state round trips,
  refresh in both modes), the 2-D key targets, the column count; the Tree,
  TileGrid and Items through markup (templates and context variables,
  selection both ways, `syncWithVar`, events, API, `loadChildren` with a
  result, the static window).
- **E2E:** a 10,000-node tree: expand all, scroll fast with no blank viewport,
  `scrollIntoView` exact; keys (arrows, Home/End, Enter, Space); lazy loading
  with the spinner delay and `autoLoadAfter`; tree state saved and restored; a
  refresh in `preserve-state`. A 10,000-tile grid: scroll, resize keeps the
  place (measured), 2-D keys, selection by mouse, keys and checkboxes,
  `syncWithVar` across two grids (the how-to guide). The prerendered Tree taken
  over without replacing nodes; the TileGrid's takeover measured.

## Outcome

- **The components:** `Tree` and `TileGrid` (new), `Items` (objects, keys by
  id) ([tree.md](../docs/tree.md), [visibility-templates.md](../docs/visibility-templates.md)).
  One new dependency: `@headless-tree/core` 1.8.1 (only the core:
  `@headless-tree/react`'s `useTree` mounts in an effect, see *Findings*).
- **Shared code:** `useVirtualRows` serves both (a new `pinned` row: the
  Tree's focused row); `useRowSelection` and the rules of `selection.ts` serve
  the TileGrid; `gridKeyTarget` is new in `selection.ts`.
- **The runtime:** `Bound` computes each binding apart (one computed per
  binding), so an unchanged value keeps its identity when another prop
  changes (*Findings*; `runtime/tests/render/elements.test.tsx`).
- **The Tree's state** lives in a `TreeStore`: a plain object in a ref whose
  changes re-render the component. The plan said "our signals"; a store that
  API calls read and write synchronously was simpler and avoids step 30's
  stale reads. `AGENTS.md` says "controlled by the component".
- **The playground:** "Trees", "Lazy trees", "Tile grids" (51 scenarios). The
  hello app has a Tree and a TileGrid, so the prerender and the takeover are
  checked on them.
- **Evidence:** `npm run check` passes and prints no warnings: 3,244 unit tests
  in 113 files, 274 E2E tests. New: `components/tests/tree-model.test.ts` (68),
  `tree.test.tsx` (30), a `Bound` test, `e2e/tree.spec.ts` (10; 30 of 30 with
  `--repeat-each=3 --workers=8`), three scenario tests, a Tree check and a
  TileGrid test in `ssg.spec.ts`.
- **Measured:** collapsing a node with 40,000 visible descendants (all 50,000
  expanded) takes 81–86 ms to the next frame (`e2e/tree.spec.ts` records it);
  the prerendered tiles are exactly where the virtual rows put them.
- **Size** (against a build of `master`): the hello app's eager JavaScript
  1,126 → 1,187 KiB (307 → 324 KiB gzipped), with a Tree and a TileGrid now in
  it; `gfui.js` 1,556 → 1,616 KiB (436 → 452 KiB gzipped).

### Findings

- **`Bound` re-evaluated every binding of an element when one changed** (one
  computed for all). A literal `data="{[…]}"` became a new array whenever
  `selectedValue` changed, and a Tree in `reset` mode started over. Each
  binding now has its own computed; the server view still evaluates them
  directly (nothing computed there is cached). This helps every component.
- **headless-tree builds its rows only after mount** (`useTree` calls
  `setMounted(true)` in an effect; `rebuildTree` waits for it), so a
  prerender would have no rows. The Tree calls `createTree` itself and mounts
  it at once; `@headless-tree/react` was dropped.
- **headless-tree's keys track pressed keys from `keydown` to `keyup`:** a
  test must send both (`press` in `tree.test.tsx`); a lost `keyup` (focus left
  the window) is cleared when the window gets focus again.
- **Its rebuild is linear, about 2 µs a visible row** (the plan's corrected
  measurement): 81–86 ms for 40,000 rows in Chromium, a few milliseconds for
  a few thousand.
- **With virtualization the focused tree item can scroll out and unmount,**
  leaving no tab stop: the focused row is now always rendered (`pinned`), and
  the E2E test presses keys after scrolling 200,000 px away.
- **A user component named `Tree` or `TileGrid` is now E016** (a built-in's
  name): one of our tests had one (renamed `Branch`).
- **A TileGrid prerendered as a CSS grid needs no width:** `auto-fill` gives
  the same columns as XMLUI's formula, so the takeover moves no tile (measured
  in `ssg.spec.ts`), though it replaces the nodes.
- **A one-off:** in the full run right after the fixtures' `optimizeDeps`
  changed (`@headless-tree/react` removed), four older scenario tests failed
  (Status, Select, AutoComplete, Dialogs: elements not shown in time). They
  passed in the playground project alone (136 of 136) and in the next full
  run (274 of 274), as step 30's one-off after new scenario files.
- **Not confirmed:** XMLUI's internal copy of the data never going back to
  `data` (`TreeReact.tsx` 737–741) is from reading; XMLUI was not run.

### Divergences from XMLUI

- **headless-tree under the Tree** (decision A); XMLUI's is its own on virtua.
  The tree items carry `aria-setsize` and `aria-posinset`; focus is on the
  tree item itself (roving `tabindex`), XMLUI focuses the container and marks
  a row.
- **A working copy that follows `data`** (decision C); loaded children keep
  the parent id's type (XMLUI makes it a string).
- **`selectedValue` follows its changes, with or without a handler**
  (decision D); its changes fire no `selectionDidChange`.
- **`expandAll` leaves nodes still to load closed** (XMLUI opens every key
  without loading them).
- **`scrollStyle` is a CSS scrollbar on the Tree's scroll box,** not the
  ScrollViewer's Mantine ScrollArea (the virtualizer needs the box).
- **The indentation is `width-indent-Tree` (`$space-3`)** (XMLUI: 10 px).
- **`contextMenu` handlers receive the pointer first** (as List's), then the
  node (Tree) or the item and its index (TileGrid); XMLUI injects `$item`.
- **TileGrid:** a CSS-grid prerender (XMLUI renders nothing until it knows the
  width); the action events pass the focused tile (XMLUI: `null`);
  `itemDoubleClick` gets the index too; keys and focus also work with only
  action handlers; the API XMLUI registers but doesn't declare is declared;
  `gap` defaults to `$space-2` and the checkbox offsets to `$space-1` (XMLUI:
  8px, 4px).
- **Items keys by id** (decision F; XMLUI: `${id}:${index}`).

### Open for later steps

- `dataRefreshMode` and `preserveStateOnNextDataRefresh` for List and Table
  (the Tree has both now); XMLUI's preserved bottom padding after a delete.
- headless-tree's typeahead search and drag and drop (XMLUI's Tree has
  neither); a faster rebuild for very large expanded trees if one is needed.
- TileGrid tiles of different heights (TanStack's `lanes`, measured in the plan).
- `getDynamic`/`setDynamic` (undocumented in XMLUI).
- Touch, iOS Safari and screen readers with the virtualized tree and grid.

## Open questions

None left for the plan; the answers are under *Decisions*. Accepted by the
user on 2026-11-26.

## Decisions (asked 2026-11-26)

1. **headless-tree for the Tree** (option A1), against the first
   recommendation: `@headless-tree/core` and `/react` 1.8.1, its state
   controlled by our signals, our own data index and loading. The measured
   cost (a rebuild per change, about 90 ms at 50,000 visible rows) is watched
   in the playground and E2E.
2. **TileGrid as rows of tiles on `useVirtualRows`** (option B1, after the
   comparison), keeping the first visible tile when the column count changes.
3. **A working copy that follows `data`** (option C2): edits and loaded
   children live in the Tree's copy; a new `data` value replaces it, keeping
   the view state in `preserve-state`.
4. **`selectedValue` is the initial selection and follows later changes**
   (option D2), with or without a handler.
5. **All of the Tree** (option E1): every prop, event and API method,
   including the thirteen XMLUI's metadata hides; not `getDynamic`/`setDynamic`.
6. **Items keys by id, else by index** (option F3).
7. **Proposed defaults, not asked:** TileGrid's undocumented API is implemented, the Tree adds
   `aria-setsize`/`aria-posinset`, `refreshOn` is ignored with a warning.
