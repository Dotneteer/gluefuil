// What compiled modules render with (see compiler src/module/).
//
//   Bound     an element with bindings: evaluates them in one computed and
//             renders the component with the resolved props
//   TextNode  text content with bindings
//
// Components themselves are plain React components that receive values.

import { createElement, type ComponentType, type ReactNode } from "react";
import { useComputed } from "../reactivity/react";
import { assertBindingValue } from "../script/load";

/** A compiled binding: `($$s) => value`. */
export type BindingFunction = (scope: object) => unknown;

export interface BoundProps {
  /** The component to render. */
  type: ComponentType<Record<string, unknown>>;
  /** Constant props (attribute values without `{…}`). */
  props?: Record<string, unknown> | null;
  /** Props computed from bindings. Hoisted by the compiler: the object is stable. */
  bindings: Record<string, BindingFunction>;
  /** The scope the bindings read. */
  scope: object;
  children?: ReactNode;
}

/**
 * Renders `type` with its constant props and the current values of its
 * bindings. It re-renders only when one of those values changes.
 */
export function Bound({ type, props, bindings, scope, children }: BoundProps) {
  const values = useComputed(() => {
    const result: Record<string, unknown> = {};
    for (const name in bindings) result[name] = assertBindingValue(bindings[name]!(scope));
    return result;
  }, [bindings, scope]);
  return createElement(type, props ? { ...props, ...values } : values, children);
}

/** Text content: `null` and `undefined` render nothing; other values as text. */
export function TextNode({ value }: { value?: unknown }) {
  return value === undefined || value === null ? null : String(value);
}
