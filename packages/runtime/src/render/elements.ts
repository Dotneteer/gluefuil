// What compiled modules render with (see compiler src/module/).
//
//   Bound     an element with bindings: evaluates them in one computed and
//             renders the component with the resolved props
//   TextNode  text content with bindings
//
// Components themselves are plain React components that receive values.

import { createElement, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useComputed } from "../reactivity/react";
import { createScope, type ScopeEntry } from "../reactivity/scope";
import { batch } from "../reactivity/signals";
import { variable } from "../reactivity/variable";
import { assertBindingValue } from "../script/load";

/** A compiled binding: `($$s) => value`. */
export type BindingFunction = (scope: object) => unknown;

/** A compiled handler: `($$s) => handler function`. */
export type HandlerFactory = (scope: object) => (...args: unknown[]) => unknown;

export interface BoundProps {
  /** The component to render. */
  type: ComponentType<Record<string, unknown>>;
  /** Constant props (attribute values without `{…}`). */
  props?: Record<string, unknown> | null;
  /** Props computed from bindings. Hoisted by the compiler: the object is stable. */
  bindings: Record<string, BindingFunction>;
  /** Event handler props (`onClick`). Hoisted by the compiler: the object is stable. */
  handlers?: Record<string, HandlerFactory> | null;
  /** The scope the bindings read and the handlers write. */
  scope: object;
  children?: ReactNode;
}

/**
 * Renders `type` with its constant props and the current values of its
 * bindings. It re-renders only when one of those values changes.
 */
export function Bound({ type, props, bindings, handlers, scope, children }: BoundProps) {
  const values = useComputed(() => {
    const result: Record<string, unknown> = {};
    for (const name in bindings) result[name] = assertBindingValue(bindings[name]!(scope));
    return result;
  }, [bindings, scope]);
  // Each handler runs in a batch: the components it affects re-render once.
  const handlerProps = useMemo(() => {
    const result: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name in handlers) {
      const handler = handlers[name]!(scope);
      result[name] = (...args) => batch(() => handler(...args));
    }
    return result;
  }, [handlers, scope]);
  return createElement(type, { ...props, ...values, ...handlerProps }, children);
}

/** How a container declares one variable: an initializer binding or a constant. */
export type VariableDefinition = { init: BindingFunction } | { value: unknown };

/**
 * Creates a container's variables once per component instance and returns its
 * scope (a child of `parent`). Initializers see the new scope, so variables can
 * refer to each other; they are evaluated lazily, so order does not matter.
 */
export function useScope(parent: object, definitions: Record<string, VariableDefinition>): object {
  const [scope] = useState(() => {
    const entries: Record<string, ScopeEntry> = {};
    let created: object | undefined;
    for (const [name, definition] of Object.entries(definitions)) {
      const init = "init" in definition ? () => assertBindingValue(definition.init(created!)) : () => definition.value;
      entries[name] = { variable: variable(init) };
    }
    created = createScope(entries, parent);
    return created;
  });
  return scope;
}

/** Text content: `null` and `undefined` render nothing; other values as text. */
export function TextNode({ value }: { value?: unknown }) {
  return value === undefined || value === null ? null : String(value);
}
