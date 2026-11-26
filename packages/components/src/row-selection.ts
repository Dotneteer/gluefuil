// The selection state of List (step 29) and Table (step 30): the rules are in
// selection.ts; this hook keeps the state, `initiallySelected`, `syncWithVar`
// both ways (step 29 decision 3) and `selectionDidChange`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SELECTION, type SelectionOptions, type SelectionState } from "./selection";

type Handler = ((...args: unknown[]) => unknown) | undefined;

export interface RowSelectionInput {
  multi: boolean;
  /** The keys a user can reach, in display order. */
  walk: readonly string[];
  /** Every known item by key (also those not shown: a folded group, another page). */
  itemByKey: ReadonlyMap<string, unknown>;
  /** Predicates of the item: rows that can't be selected. */
  unselectable: readonly unknown[];
  initiallySelected?: unknown;
  /** The value of the variable `syncWithVar` names, and its setter (the compiler's `$$setSyncWithVar`). */
  syncWithVar?: unknown;
  setSyncWithVar?: Handler;
  onSelectionDidChange?: Handler;
}

export function useRowSelection(input: RowSelectionInput) {
  const latest = useRef(input);
  latest.current = input;
  const { walk, itemByKey, multi } = input;
  const syncIds = (() => {
    const ids = (input.syncWithVar as { selectedIds?: unknown } | undefined)?.selectedIds;
    return Array.isArray(ids) ? ids.map(String) : undefined;
  })();
  const [selection, setSelection] = useState<SelectionState>(() => {
    const initial = syncIds ?? (Array.isArray(input.initiallySelected) ? input.initiallySelected.map(String) : []);
    return initial.length > 0 ? { ...EMPTY_SELECTION, selected: initial } : EMPTY_SELECTION;
  });
  const predicates = input.unselectable.filter((p): p is (item: unknown) => unknown => typeof p === "function");
  const predicateKey = predicates.length;
  const unselectable = useCallback(
    (index: number) => {
      const key = walk[index];
      if (key === undefined) return false;
      const item = itemByKey.get(key);
      return predicates.some((p) => Boolean(p(item)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walk, itemByKey, predicateKey, ...predicates],
  );
  const options = useMemo<SelectionOptions>(() => ({ multi, unselectable }), [multi, unselectable]);
  const selectedKeys = useMemo(() => selection.selected.filter((k) => itemByKey.has(k)), [selection.selected, itemByKey]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedItems = useMemo(() => selectedKeys.map((k) => itemByKey.get(k)), [selectedKeys, itemByKey]);

  // syncWithVar: our changes go to the variable; its changes from elsewhere come back.
  const written = useRef<string | undefined>(undefined);
  const syncSignature = syncIds?.join("\u0000");
  useEffect(() => {
    if (syncIds === undefined || syncSignature === written.current) return;
    setSelection((state) => (state.selected.join("\u0000") === syncSignature ? state : { ...state, selected: syncIds }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSignature]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const l = latest.current;
    if (l.setSyncWithVar) {
      written.current = selection.selected.join("\u0000");
      const old = l.syncWithVar !== null && typeof l.syncWithVar === "object" ? l.syncWithVar : {};
      void l.setSyncWithVar({ ...old, selectedIds: [...selection.selected] });
    }
    void l.onSelectionDidChange?.(selection.selected.filter((k) => l.itemByKey.has(k)).map((k) => l.itemByKey.get(k)));
  }, [selection.selected]);
  return { selection, setSelection, options, unselectable, selectedKeys, selectedSet, selectedItems };
}
