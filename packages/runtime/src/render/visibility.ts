// `when` and the responsive `when-*` attributes (XMLUI visibility.md).
// Design: .ai/plan/poc-10-conditionals-templates.md

import type { ReactNode } from "react";
import { useComputed } from "../reactivity/react";
import { isServerView } from "../reactivity/server-view";
import { signal, type ReadonlySignal, type Signal } from "../reactivity/signals";
import { assertBindingValue } from "../script/binding-value";
import type { BindingFunction } from "./elements";

/** Breakpoints, mobile-first (min-width in px). */
export const BREAKPOINTS = [
  ["xs", 0],
  ["sm", 576],
  ["md", 768],
  ["lg", 992],
  ["xl", 1200],
  ["xxl", 1400],
] as const;

export type BreakpointName = (typeof BREAKPOINTS)[number][0];

export const BREAKPOINT_NAMES: readonly BreakpointName[] = BREAKPOINTS.map(([name]) => name);

/** The breakpoint index for a viewport width. */
export function breakpointIndex(width: number): number {
  let index = 0;
  BREAKPOINTS.forEach(([, min], i) => {
    if (width >= min) index = i;
  });
  return index;
}

let current: Signal<number> | undefined;

/**
 * The current breakpoint index (0 = xs … 5 = xxl), as a signal. Created on
 * first use; follows `window.innerWidth` on `resize`. Without a window
 * (server rendering) it stays at xs.
 */
export function breakpoint(): ReadonlySignal<number> {
  if (!current) {
    const view = (globalThis as { window?: { innerWidth: number; addEventListener(type: string, cb: () => void): void } }).window;
    const signalNode = signal(view ? breakpointIndex(view.innerWidth) : 0);
    view?.addEventListener("resize", () => signalNode.set(breakpointIndex(view.innerWidth)));
    current = signalNode;
  }
  return current;
}

/** The breakpoint index for a name (`"md"` → 2); undefined for an unknown name. */
export function breakpointFromName(name: string): number | undefined {
  const index = BREAKPOINT_NAMES.indexOf(name as BreakpointName);
  return index < 0 ? undefined : index;
}

let serverBreakpoint = 0;

/**
 * The breakpoint static HTML is rendered for (default 0 = xs). The prerender
 * sets it before rendering; `mountApp` sets it, from the HTML, before hydrating.
 */
export function setServerBreakpoint(index: number): void {
  serverBreakpoint = index;
}

/**
 * The breakpoint `When` evaluates against: the server breakpoint in the server
 * view (server rendering and hydration), else the live, tracked signal.
 */
export function currentBreakpoint(): number {
  return isServerView() ? serverBreakpoint : breakpoint().get();
}

/**
 * XMLUI's rule: walk down from the current breakpoint; the first defined rule
 * wins. With no rule at or below: `when` if it is set, else the opposite of the
 * lowest defined rule. With no rules at all: `when`, or visible.
 */
export function resolveVisibility(
  breakpointNow: number,
  base: boolean | undefined,
  rules: Partial<Record<BreakpointName, boolean>>,
): boolean {
  for (let i = breakpointNow; i >= 0; i--) {
    const rule = rules[BREAKPOINT_NAMES[i]!];
    if (rule !== undefined) return rule;
  }
  if (base !== undefined) return base;
  for (const name of BREAKPOINT_NAMES) {
    const rule = rules[name];
    if (rule !== undefined) return !rule;
  }
  return true;
}

/** A condition: a compiled binding or a constant. */
export type Condition = BindingFunction | boolean;

export interface WhenProps {
  /** `when`: absent means "not set". */
  test?: Condition;
  /** `when-xs` … `when-xxl`. */
  responsive?: Partial<Record<BreakpointName, Condition>> | null;
  scope: object;
  children?: ReactNode;
}

/** Renders its child only while visible; a hidden child's component never runs. */
export function When({ test, responsive, scope, children }: WhenProps) {
  const visible = useComputed(
    () => {
      const evaluate = (condition: Condition) => (typeof condition === "function" ? Boolean(assertBindingValue(condition(scope))) : condition);
      const base = test === undefined ? undefined : evaluate(test);
      if (!responsive) return base ?? true;
      const rules: Partial<Record<BreakpointName, boolean>> = {};
      for (const name of BREAKPOINT_NAMES) {
        const condition = responsive[name];
        if (condition !== undefined) rules[name] = evaluate(condition);
      }
      return resolveVisibility(currentBreakpoint(), base, rules);
    },
    [test, responsive, scope],
    Object.is,
  );
  return visible ? children : null;
}
