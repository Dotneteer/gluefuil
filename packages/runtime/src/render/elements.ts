// What compiled modules render with (see compiler src/module/).
//
//   Bound     an element with bindings: evaluates them in one computed and
//             renders the component with the resolved props
//   TextNode  text content with bindings
//
// Components themselves are plain React components that receive values.

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { scheduleMicrotask } from "../errors";
import { useComputed } from "../reactivity/react";
import { createScope, type ScopeEntry } from "../reactivity/scope";
import { variable } from "../reactivity/variable";
import { assertBindingValue } from "../script/binding-value";
import { apiRegistrar } from "./component-api";
import { HandlerSlot, type HandlerFunction, type HandlerPolicy } from "./handlers";
import { templateRenderer, type TemplateFunction } from "./templates";

/** A compiled binding: `($$s) => value`. */
export type BindingFunction = (scope: object) => unknown;

/** A compiled handler: `($$s) => ($$x) => handler function` (see ./handlers.ts). */
export type HandlerFactory = (scope: object) => HandlerFunction;

export interface BoundProps {
  /** The component to render. */
  type: ComponentType<Record<string, unknown>>;
  /** Constant props (attribute values without `{…}`). */
  props?: Record<string, unknown> | null;
  /** Props computed from bindings. Hoisted by the compiler: the object is stable. */
  bindings: Record<string, BindingFunction>;
  /** Event handler props (`onClick`). Hoisted by the compiler: the object is stable. */
  handlers?: Record<string, HandlerFactory> | null;
  /** Handler policies by handler prop (`handlerPolicy`, `handlerPolicy:onClick`). Default: parallel. */
  policies?: Record<string, HandlerPolicy> | null;
  /** Handler timeouts in ms by handler prop (`handlerTimeoutMs`); 0 disables. Default: the runtime default. */
  timeouts?: Record<string, number> | null;
  /** The element's `id`: the component receives a `registerApi` prop to publish its API. */
  id?: string;
  /** Template props (`itemTemplate`): compiled templates, given to the component as renderers. */
  templates?: Record<string, TemplateFunction> | null;
  /** `onMount` / `onUnmount` handlers (any element). */
  lifecycle?: { mount?: HandlerFactory; unmount?: HandlerFactory } | null;
  /** The scope the bindings read and the handlers write. */
  scope: object;
  children?: ReactNode;
}

/**
 * Renders `type` with its constant props and the current values of its
 * bindings. It re-renders only when one of those values changes.
 */
export function Bound({ type, props, bindings, handlers, policies, timeouts, id, templates, lifecycle, scope, children }: BoundProps) {
  const values = useComputed(() => {
    const result: Record<string, unknown> = {};
    for (const name in bindings) result[name] = assertBindingValue(bindings[name]!(scope));
    return result;
  }, [bindings, scope]);
  // One slot per handler: it applies the policy, the timeout, and batching
  // (one batch per synchronous segment of each call).
  const slots = useMemo(() => {
    const result: Record<string, HandlerSlot> = {};
    for (const name in handlers) {
      result[name] = new HandlerSlot(handlers[name]!(scope), policies?.[name], timeouts?.[name]);
    }
    return result;
  }, [handlers, policies, timeouts, scope]);
  // Unmounting aborts running handlers ("unmount"). StrictMode re-mounts:
  // activate() undoes the simulated unmount.
  useEffect(() => {
    for (const name in slots) slots[name]!.activate();
    return () => {
      for (const name in slots) slots[name]!.dispose();
    };
  }, [slots]);
  const handlerProps = useMemo(() => {
    const result: Record<string, (...args: unknown[]) => void> = {};
    for (const name in slots) result[name] = (...args) => slots[name]!.invoke(args);
    return result;
  }, [slots]);
  const registerApi = useMemo(() => (id === undefined ? undefined : apiRegistrar(scope, id)), [id, scope]);
  const extra = registerApi ? { registerApi } : undefined;
  const templateProps = useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const name in templates) result[name] = templateRenderer(scope, templates[name]!);
    return result;
  }, [templates, scope]);
  useLifecycle(lifecycle, scope);
  return createElement(type, { ...props, ...values, ...handlerProps, ...templateProps, ...extra }, children);
}

/**
 * Runs `onMount` after the element is rendered and `onUnmount` when it goes
 * away (including through `when`). React StrictMode simulates an unmount and a
 * remount in development: the unmount is deferred by a microtask and cancelled
 * by an immediate remount, so each handler fires once per real transition.
 */
function useLifecycle(lifecycle: BoundProps["lifecycle"], scope: object): void {
  const slots = useMemo(
    () => ({
      mount: lifecycle?.mount ? new HandlerSlot(lifecycle.mount(scope)) : undefined,
      unmount: lifecycle?.unmount ? new HandlerSlot(lifecycle.unmount(scope)) : undefined,
    }),
    [lifecycle, scope],
  );
  const pendingUnmount = useRef(false);
  useEffect(() => {
    if (!slots.mount && !slots.unmount) return undefined;
    if (pendingUnmount.current) pendingUnmount.current = false; // StrictMode remount: not a new mount
    else slots.mount?.invoke([]);
    return () => {
      pendingUnmount.current = true;
      scheduleMicrotask(() => {
        if (!pendingUnmount.current) return;
        pendingUnmount.current = false;
        slots.unmount?.invoke([]);
      });
    };
  }, [slots]);
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
