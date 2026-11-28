// User-defined components (step 14): `<Component name="X">` compiles to a
// function component `X(input)` whose body calls `useComponent`.
// Design: .ai/plan/poc-14-user-components.md
//
//   BoundUser     a use of a user component in markup: $props as a computed over
//                 the caller's bindings; events, templates, id, lifecycle as Bound
//   useComponent  the instance's scope: $props, $self, emitEvent, hasEventHandler,
//                 the caller's slot renderers, the component's IDs, its variables
//                 and code-behind functions; methods published as its API
//   Slot          renders the caller's template for a slot (or the fallback)

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useComputed, shallowEqual } from "../reactivity/react";
import { computed, type ReadonlySignal } from "../reactivity/signals";
import { assertBindingValue } from "../script/binding-value";
import { createFileScope, useComponentApi, type RegisterApi } from "./component-api";
import { createVariableScope, useWiring, type BindingFunction, type BoundProps, type HandlerFactory, type VariableDefinition } from "./elements";
import { useGlobalScope } from "./global-scope";
import { HandlerSlot } from "./handlers";
import type { TemplateRenderer } from "./templates";

/** Where a component instance keeps its caller's slot renderers (inherited by nested scopes). */
export const SLOTS: unique symbol = Symbol("gfui.slots");

/** The name of the default slot's template (the caller's children). */
export const DEFAULT_SLOT = "$$slot";

/** What a user component receives from `BoundUser`. */
export interface ComponentInput {
  /** `$props`: the caller's attribute values, recomputed when they change. */
  props: ReadonlySignal<Readonly<Record<string, unknown>>>;
  /** The caller's event handlers by prop (`onIncremented`); each returns a promise of the handler's result. */
  events: Readonly<Record<string, (...args: unknown[]) => Promise<unknown>>>;
  /** The caller's slot content by template name (`rowTemplate`, `$$slot`). */
  templates: Readonly<Record<string, TemplateRenderer>>;
  /** Present when the caller gave the element an `id`. */
  registerApi?: RegisterApi;
}

/**
 * A use of a user component. Unlike `Bound`, it does not evaluate the
 * bindings itself: it hands the component a computed over them, so a change
 * re-renders only what inside reads the changed `$props` member.
 */
export function BoundUser({ type, props, bindings, handlers, policies, timeouts, id, templates, lifecycle, scope, at }: Omit<BoundProps, "type" | "children"> & { type: ComponentType<{ input: ComponentInput }> }) {
  const propsSignal = useMemo(
    () =>
      computed(
        () => {
          const result: Record<string, unknown> = { ...props };
          for (const name in bindings) result[name] = assertBindingValue(bindings[name]!(scope));
          return Object.freeze(result);
        },
        { equals: shallowEqual },
      ),
    [props, bindings, scope],
  );
  const { handlerProps, templateProps, registerApi } = useWiring({ handlers, policies, timeouts, id, templates, lifecycle, scope, at }, true);
  const input = useMemo<ComponentInput>(
    () => ({
      props: propsSignal,
      events: handlerProps as ComponentInput["events"],
      templates: templateProps,
      ...(registerApi ? { registerApi } : {}),
    }),
    [propsSignal, handlerProps, templateProps, registerApi],
  );
  return createElement(type, { input });
}

/** `incremented` → `onIncremented`. */
const handlerProp = (event: string) => `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;

/**
 * The scope of one component instance, created once:
 *
 *   app scope
 *     └─ component scope: $props, $self, emitEvent, hasEventHandler (+ SLOTS)
 *          └─ ID scope (when the body has IDs)
 *               └─ variables and code-behind functions   ← returned
 *
 * Methods run as handlers in the returned scope, through one HandlerSlot each;
 * `$self` (and the caller, through the element's `id`) gets them as functions
 * returning a promise of the result.
 */
export function useComponent(
  input: ComponentInput,
  appScope: object,
  variables: Record<string, VariableDefinition>,
  methods: Record<string, HandlerFactory>,
  ids: readonly string[],
): object {
  // The input is stable in practice (BoundUser memoizes it); reading it through
  // a ref keeps emitEvent and the slots right even if it is not.
  const latest = useRef(input);
  latest.current = input;
  // The app's globals (step 21B) sit between this scope and the file's app scope.
  const globals = useGlobalScope();
  const [instance] = useState(() => {
    const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    const base = Object.create(globals ?? appScope) as Record<string | symbol, unknown>;
    Object.defineProperties(base, {
      $props: { get: () => latest.current.props.get(), enumerable: true },
      $self: { value: api, enumerable: true },
      emitEvent: {
        value: (event: unknown, ...args: unknown[]) => latest.current.events[handlerProp(String(event))]?.(...args),
        enumerable: true,
      },
      hasEventHandler: { value: (event: unknown) => handlerProp(String(event)) in latest.current.events, enumerable: true },
      [SLOTS]: { get: () => latest.current.templates },
    });
    Object.freeze(base);
    const withIds = ids.length > 0 ? createFileScope(base, ids) : base;
    const scope = createVariableScope(withIds, variables);
    const slots: Record<string, HandlerSlot> = {};
    for (const [name, factory] of Object.entries(methods)) {
      // Step 35: a method call is a span of the caller's trace.
      const slot = new HandlerSlot(factory(scope), undefined, undefined, undefined, { event: `method ${name}` });
      slots[name] = slot;
      api[name] = (...args) => slot.call(args);
    }
    Object.freeze(api);
    return { scope, api, slots };
  });
  useEffect(() => {
    for (const slot of Object.values(instance.slots)) slot.activate();
    return () => {
      for (const slot of Object.values(instance.slots)) slot.dispose();
    };
  }, [instance]);
  useComponentApi(input.registerApi, instance.api);
  return instance.scope;
}

export interface SlotProps {
  /** The template name: `rowTemplate`, or DEFAULT_SLOT for `<Slot/>`. */
  name: string;
  /** Slot props, named with their `$` (`$item`): bindings in the component's scope. */
  bindings: Record<string, BindingFunction>;
  scope: object;
  /** The fallback: rendered when the caller gave no content for this slot. */
  children?: ReactNode;
}

/** Renders the caller's content for a slot, with the slot props as its context variables. */
export function Slot({ name, bindings, scope, children }: SlotProps) {
  const context = useComputed(() => {
    const result: Record<string, unknown> = {};
    for (const key in bindings) result[key] = assertBindingValue(bindings[key]!(scope));
    return result;
  }, [bindings, scope]);
  const renderer = (scope as { [SLOTS]?: Record<string, TemplateRenderer> })[SLOTS]?.[name];
  return renderer ? renderer(context) : (children ?? null);
}
