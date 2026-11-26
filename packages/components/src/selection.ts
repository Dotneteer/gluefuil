// Row selection (step 29, .ai/plan/poc-29-list.md): a framework-free model for
// List now and Table in step 30. XMLUI shares one hook between them,
// xmlui/src/components/Table/useRowSelection.tsx 405–570; this follows its
// rules:
//
//   - a plain click (or a key) selects only the target row;
//   - Shift extends from the anchor (the last row clicked without Shift),
//     skipping unselectable rows, and keeps the rest of the selection;
//   - Ctrl/Cmd (and a row's checkbox) toggles the target;
//   - without `multi`, every interaction selects one row;
//   - an unselectable target is ignored.
//
// Rows are addressed by their position in `rows`: the keys of the item rows a
// user can reach, in display order.

export interface SelectionState {
  /** The selected keys, in the order they were selected. */
  readonly selected: readonly string[];
  /** Where a Shift-extension starts. */
  readonly anchor?: string;
  /** The focused row (keyboard), an index into the rows; -1 for none. */
  readonly focused: number;
}

export interface SelectionOptions {
  multi: boolean;
  /** The rows the user can't select (`rowUnselectablePredicate`). */
  unselectable?: (index: number) => boolean;
}

export interface Modifiers {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  /** A row's checkbox: toggles, as Ctrl/Cmd does. */
  toggle?: boolean;
}

export const EMPTY_SELECTION: SelectionState = Object.freeze({ selected: Object.freeze([]) as readonly string[], focused: -1 });

const unique = (keys: readonly string[]) => [...new Set(keys)];

/** The state after the user picks the row at `index` (a click, a key, a checkbox). */
export function pickRow(state: SelectionState, rows: readonly string[], index: number, modifiers: Modifiers, options: SelectionOptions): SelectionState {
  const key = rows[index];
  if (key === undefined) return state;
  // An unselectable row can be focused (the keys move past it), not selected.
  if (options.unselectable?.(index)) return state.focused === index ? state : { ...state, focused: index };
  const toggle = modifiers.toggle || modifiers.ctrl || modifiers.meta;
  if (!options.multi || (!modifiers.shift && !toggle)) {
    // A checkbox click on the only selected row clears it (it is a toggle).
    if (modifiers.toggle && state.selected.length === 1 && state.selected[0] === key) return { selected: [], anchor: key, focused: index };
    return { selected: [key], anchor: key, focused: index };
  }
  if (modifiers.shift) {
    let selected = [...state.selected];
    const anchor = state.anchor !== undefined && rows.includes(state.anchor) ? state.anchor : key;
    const from = rows.indexOf(anchor);
    // The previous extension from the same anchor is replaced, not added to.
    if (state.focused >= 0 && state.anchor === anchor) {
      const [a, b] = [Math.min(from, state.focused), Math.max(from, state.focused)];
      const old = new Set(rows.slice(a, b + 1));
      selected = selected.filter((k) => !old.has(k));
    }
    const [lo, hi] = [Math.min(from, index), Math.max(from, index)];
    for (let i = lo; i <= hi; i++) if (!options.unselectable?.(i)) selected.push(rows[i]!);
    return { selected: unique(selected), anchor, focused: index };
  }
  const selected = state.selected.includes(key) ? state.selected.filter((k) => k !== key) : [...state.selected, key];
  return { selected, anchor: key, focused: index };
}

/** Where a navigation key moves the focus (XMLUI: a page is 8 rows), or undefined for other keys. */
export function keyTarget(key: string, focused: number, count: number): number | undefined {
  if (count === 0) return undefined;
  const at = focused < 0 ? -1 : focused;
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, at + 1);
    case "ArrowUp":
      return Math.max(0, at < 0 ? 0 : at - 1);
    case "PageDown":
      return Math.min(count - 1, at + 8);
    case "PageUp":
      return Math.max(0, at - 8);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/** Every selectable row (only one without `multi`: then nothing changes). */
export function selectAllRows(state: SelectionState, rows: readonly string[], options: SelectionOptions): SelectionState {
  if (!options.multi) return state;
  return { ...state, selected: rows.filter((_, i) => !options.unselectable?.(i)) };
}

/** `selectId(id | ids)`: adds them (replaces with one id without `multi`); unknown or unselectable ids are skipped. */
export function selectKeys(state: SelectionState, rows: readonly string[], keys: readonly unknown[], options: SelectionOptions): SelectionState {
  const wanted = keys.map(String).filter((k) => {
    const i = rows.indexOf(k);
    return i >= 0 && !options.unselectable?.(i);
  });
  if (wanted.length === 0) return state;
  if (!options.multi) return { ...state, selected: [wanted[wanted.length - 1]!] };
  return { ...state, selected: unique([...state.selected, ...wanted]) };
}
