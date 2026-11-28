// What compiled modules render with (see compiler src/module/).
//
//   Bound     an element with bindings: evaluates them in one computed and
//             renders the component with the resolved props
//   TextNode  text content with bindings
//
// Components themselves are plain React components that receive values.

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { AppError, scheduleMicrotask } from "../errors";
import { useComputed } from "../reactivity/react";
import { isServerView } from "../reactivity/server-view";
import { computed, lastWrite, type ReadonlySignal } from "../reactivity/signals";
import { createScope, type ScopeEntry } from "../reactivity/scope";
import { variable } from "../reactivity/variable";
import { assertBindingValue } from "../script/binding-value";
import { emit, renderTracing, tracing } from "../trace/core";
import { renderGroup, uniqueCauses } from "../trace/emitters";
import type { Cause } from "../trace/entries";
import type { SourceLocation } from "../trace/location";
import { apiRegistrar } from "./component-api";
import { HandlerSlot, type HandlerFunction, type HandlerPolicy, type HandlerTraceInfo } from "./handlers";
import { templateRenderer, type TemplateFunction, type TemplateRenderer } from "./templates";

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
  /** `onMount` / `onUnmount` handlers (any element); step 33: `onError`, the element's own error handler. */
  lifecycle?: { mount?: HandlerFactory; unmount?: HandlerFactory; error?: HandlerFactory } | null;
  /** Handler props return a promise of the handler's result (APICall's beforeRequest, success; step 20). */
  results?: boolean;
  /** The scope the bindings read and the handlers write. */
  scope: object;
  /** Step 35: the element's markup position (trace entries name it). */
  at?: SourceLocation;
  /** Step 35: a password input: its handlers' arguments and writes are masked in the trace. */
  sensitive?: boolean;
  /** Step 35: the component receives a `$$trace` cell (its position and what caused its last change). */
  traced?: boolean;
  children?: ReactNode;
}

/**
 * Step 35: what a traced component (DataSource, APICall, List, …) knows of its
 * element: its position, and the causes of its bindings' latest change (the
 * writes they read). `takeCauses` hands them to one consumer (a fetch).
 */
export interface TraceCell {
  readonly at?: SourceLocation;
  readonly id?: string;
  causes: Cause[];
}

/** The causes a traced component's bindings changed by, once (a later poll has none). */
export function takeCauses(cell: TraceCell | undefined): Cause[] {
  if (!cell || cell.causes.length === 0) return [];
  const causes = cell.causes;
  cell.causes = [];
  return causes;
}

/**
 * Renders `type` with its constant props and the current values of its
 * bindings. It re-renders only when one of those values changes.
 */
export function Bound({ type, props, bindings, handlers, policies, timeouts, id, templates, lifecycle, results, scope, at, sensitive, traced, children }: BoundProps) {
  // One computed per binding (step 31): a binding runs again only when what it reads changes, so an
  // unchanged value keeps its identity when another prop changes (a literal `data="{[…]}"` is not
  // a new array each time). The server view evaluates them directly: nothing it computes is cached.
  const cells = useMemo(() => {
    const result: Record<string, ReadonlySignal<unknown>> = {};
    for (const name in bindings) result[name] = computed(() => assertBindingValue(bindings[name]!(scope)));
    return result;
  }, [bindings, scope]);
  // Step 35: the trace cell (traced components) and the newest write each binding has seen. One ref,
  // filled only when needed: with tracing off and no cell, a render does no trace work.
  const traceState = useRef<ElementTrace | null>(null);
  const cell = traced ? traceCell(traceState, at, id) : undefined;
  const values = useComputed(() => {
    const result: Record<string, unknown> = {};
    if (isServerView()) for (const name in bindings) result[name] = assertBindingValue(bindings[name]!(scope));
    else {
      for (const name in cells) result[name] = cells[name]!.get();
      if (tracing) traceChanges(cells, seenOf(traceState, cells), traceState.current?.cell, at);
    }
    return result;
  }, [cells, bindings, scope]);
  const { handlerProps, templateProps, registerApi } = useWiring({ handlers, policies, timeouts, id, templates, lifecycle, scope, at, sensitive }, results === true);
  const extra = registerApi ? { registerApi } : undefined;
  const traceProp = cell ? { $$trace: cell } : undefined;
  return createElement(type, { ...props, ...values, ...handlerProps, ...templateProps, ...extra, ...traceProp }, children);
}

/** Step 35: what an element keeps for the trace. */
interface ElementTrace {
  cell?: TraceCell;
  /** The newest write mark each binding has seen, for one set of binding cells. */
  seen?: { cells: object; first: boolean; marks: Record<string, number> };
}

/** The element's trace cell: made once, again only if its position or id changes. */
function traceCell(state: { current: ElementTrace | null }, at: SourceLocation | undefined, id: string | undefined): TraceCell {
  const kept = (state.current ??= {}).cell;
  if (kept && kept.at === at && kept.id === id) return kept;
  return (state.current.cell = { ...(at ? { at } : {}), ...(id !== undefined ? { id } : {}), causes: [] });
}

function seenOf(state: { current: ElementTrace | null }, cells: object): NonNullable<ElementTrace["seen"]> {
  const kept = (state.current ??= {}).seen;
  if (kept && kept.cells === cells) return kept;
  return (state.current.seen = { cells, first: true, marks: {} });
}

/**
 * Step 35: which bindings changed since the last evaluation, by the writes they
 * read (`lastWrite`: the newest write a computed read), and the causes. A traced
 * component's cell gets them; a re-render is a `render` entry when render tracing is on.
 */
function traceChanges(
  cells: Record<string, ReadonlySignal<unknown>>,
  seen: NonNullable<ElementTrace["seen"]>,
  cell: TraceCell | undefined,
  at: SourceLocation | undefined,
): void {
  const changed: string[] = [];
  const causes: Cause[] = [];
  for (const name in cells) {
    const mark = lastWrite(cells[name]!);
    if (mark !== undefined && mark.n > (seen.marks[name] ?? 0)) {
      seen.marks[name] = mark.n;
      changed.push(name);
      causes.push(mark.cause);
    }
  }
  const first = seen.first;
  seen.first = false;
  if (causes.length > 0 && cell) cell.causes = uniqueCauses([...cell.causes, ...causes]);
  if (renderTracing && !first && changed.length > 0) {
    emit({ kind: "render", ...(at ? { at } : {}), changed, causes: uniqueCauses(causes), group: renderGroup() });
  }
}

type Wiring = Pick<BoundProps, "handlers" | "policies" | "timeouts" | "id" | "templates" | "lifecycle" | "scope" | "at" | "sensitive">;

/** `onClick` → `click`. */
function eventOf(handlerProp: string): string {
  return handlerProp.startsWith("on") && handlerProp.length > 2 ? handlerProp[2]!.toLowerCase() + handlerProp.slice(3) : handlerProp;
}

/**
 * What every compiled element with behavior needs: one handler slot per
 * handler, the API registrar for its `id`, template renderers, lifecycle
 * handlers. `withResults`: handler props return a promise of the handler's
 * result (`HandlerSlot.call`, for `emitEvent`), instead of nothing.
 */
export function useWiring({ handlers, policies, timeouts, id, templates, lifecycle, scope, at, sensitive }: Wiring, withResults: boolean) {
  // One slot per handler: it applies the policy, the timeout, and batching
  // (one batch per synchronous segment of each call).
  // Step 33: the element's `onError` receives the errors of its other handlers ("action") and of its lifecycle.
  const errorSlot = useMemo(
    () => (lifecycle?.error ? new HandlerSlot(lifecycle.error(scope), undefined, undefined, undefined, traceInfo("error", at, id)) : undefined),
    [lifecycle, scope, at, id],
  );
  const slots = useMemo(() => {
    const result: Record<string, HandlerSlot> = {};
    const errors = errorSlot ? { onError: elementErrorHandler(errorSlot, "action") } : undefined;
    for (const name in handlers) {
      result[name] = new HandlerSlot(handlers[name]!(scope), policies?.[name], timeouts?.[name], errors, traceInfo(eventOf(name), at, id, sensitive));
    }
    return result;
  }, [handlers, policies, timeouts, scope, errorSlot, at, id, sensitive]);
  // Unmounting aborts running handlers ("unmount"). StrictMode re-mounts:
  // activate() undoes the simulated unmount.
  useEffect(() => {
    for (const name in slots) slots[name]!.activate();
    errorSlot?.activate();
    return () => {
      for (const name in slots) slots[name]!.dispose();
      errorSlot?.dispose();
    };
  }, [slots, errorSlot]);
  const handlerProps = useMemo(() => {
    const result: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name in slots) {
      result[name] = withResults ? (...args) => slots[name]!.call(args) : (...args) => slots[name]!.invoke(args);
    }
    return result;
  }, [slots, withResults]);
  const registerApi = useMemo(() => (id === undefined ? undefined : apiRegistrar(scope, id)), [id, scope]);
  const templateProps = useMemo(() => {
    const result: Record<string, TemplateRenderer> = {};
    for (const name in templates) result[name] = templateRenderer(scope, templates[name]!);
    return result;
  }, [templates, scope]);
  useLifecycle(lifecycle, scope, errorSlot, at, id);
  return { handlerProps, templateProps, registerApi };
}

/**
 * Runs `onMount` after the element is rendered and `onUnmount` when it goes
 * away (including through `when`). React StrictMode simulates an unmount and a
 * remount in development: the unmount is deferred by a microtask and cancelled
 * by an immediate remount, so each handler fires once per real transition.
 */
function useLifecycle(lifecycle: BoundProps["lifecycle"], scope: object, errorSlot: HandlerSlot | undefined, at: SourceLocation | undefined, id: string | undefined): void {
  const slots = useMemo(
    () => ({
      mount: lifecycle?.mount ? new HandlerSlot(lifecycle.mount(scope), undefined, undefined, lifecycleErrors(errorSlot, "mount"), traceInfo("mount", at, id)) : undefined,
      unmount: lifecycle?.unmount
        ? new HandlerSlot(lifecycle.unmount(scope), undefined, undefined, lifecycleErrors(errorSlot, "unmount"), traceInfo("unmount", at, id))
        : undefined,
    }),
    [lifecycle, scope, errorSlot, at, id],
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

/** Step 35: what a slot's trace entries say about the element. */
function traceInfo(event: string, at: SourceLocation | undefined, id: string | undefined, sensitive?: boolean): HandlerTraceInfo {
  return { event, ...(at ? { at } : {}), ...(id !== undefined ? { id } : {}), ...(sensitive ? { sensitive } : {}) };
}

/** Step 33: an element's `onError` as a handler slot's error sink: `(error: AppError, source)`. */
function elementErrorHandler(errorSlot: HandlerSlot, source: "action" | "mount" | "unmount"): (error: unknown) => void {
  return (error) => errorSlot.invoke([AppError.from(error), source]);
}

/** A lifecycle slot's errors: the element's `onError`, else the pipeline as "lifecycle". */
function lifecycleErrors(errorSlot: HandlerSlot | undefined, source: "mount" | "unmount") {
  return errorSlot ? { onError: elementErrorHandler(errorSlot, source) } : { source: "lifecycle" as const };
}

/**
 * How a container declares one name: a variable with an initializer binding or
 * a constant, or a code-behind function (`fn` builds it for the new scope).
 */
export type VariableDefinition = ({ init: BindingFunction } | { value: unknown } | { fn: (scope: object) => (...args: unknown[]) => unknown }) & {
  /** Step 35: the declaration's markup position. */
  at?: SourceLocation;
};

/**
 * Creates a container's variables once per component instance and returns its
 * scope (a child of `parent`). Initializers see the new scope, so variables can
 * refer to each other; they are evaluated lazily, so order does not matter.
 */
export function useScope(parent: object, definitions: Record<string, VariableDefinition>): object {
  const [scope] = useState(() => createVariableScope(parent, definitions));
  return scope;
}

/** The scope `useScope` creates: variables (lazy initializers) and functions, over `parent`. */
export function createVariableScope(parent: object, definitions: Record<string, VariableDefinition>): object {
  const entries: Record<string, ScopeEntry> = {};
  let created: object | undefined;
  const functions: [holder: { fn?: (...args: unknown[]) => unknown }, build: (scope: object) => (...args: unknown[]) => unknown][] = [];
  for (const [name, definition] of Object.entries(definitions)) {
    if ("fn" in definition) {
      // The function closes over the scope, which exists only after this loop.
      const holder: { fn?: (...args: unknown[]) => unknown } = {};
      functions.push([holder, definition.fn]);
      entries[name] = { value: (...args: unknown[]) => holder.fn!(...args) };
      continue;
    }
    const init = "init" in definition ? () => assertBindingValue(definition.init(created!)) : () => definition.value;
    entries[name] = { variable: variable(init, { name, ...(definition.at ? { at: definition.at } : {}) }) };
  }
  created = createScope(entries, parent);
  for (const [holder, build] of functions) holder.fn = build(created);
  return created;
}

/** Text content: `null` and `undefined` render nothing; other values as text. */
export function TextNode({ value }: { value?: unknown }) {
  return value === undefined || value === null ? null : String(value);
}
