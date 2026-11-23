// Signals in React: one useSyncExternalStore subscription per component.
//
// A compiled component evaluates all its bindings inside one `useComputed`.
// It re-renders only when one of its own values changes; parents and
// siblings are not involved. useSyncExternalStore gives tearing-free reads
// under concurrent rendering and a server snapshot for server rendering.
// Design: .ai/plan/poc-04-reactivity.md

import { useCallback, useMemo, useSyncExternalStore, type DependencyList } from "react";
import { computed, watch, type Equals, type ReadonlySignal } from "./signals";

/** Equal when both are the same, or arrays/plain objects with the same entries (Object.is). */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => Object.is(value, b[i]));
  }
  if (Array.isArray(b) || Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Reads a signal or computed, re-rendering when it changes. */
export function useSignal<T>(source: ReadonlySignal<T>): T {
  const subscribe = useCallback((onChange: () => void) => watch(source, onChange), [source]);
  const snapshot = useCallback(() => source.peek(), [source]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Evaluates `fn` as a computed value owned by the component and re-renders
 * only when the result changes (`equals`, shallow by default). `deps` are the
 * non-reactive inputs `fn` closes over (for example props); a change creates a
 * new computed.
 */
export function useComputed<T>(fn: () => T, deps: DependencyList, equals: Equals<T> = shallowEqual): T {
  // The caller lists fn's inputs in deps (like useMemo).
  const source = useMemo(() => computed(fn, { equals }), deps);
  return useSignal(source);
}
