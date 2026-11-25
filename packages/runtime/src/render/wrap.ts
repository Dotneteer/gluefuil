// wrapComponent (step 16): makes an existing React component usable from
// markup with a small configuration. Design: .ai/plan/poc-16-mantine.md
// (after XMLUI's wrapComponent, .ai/xmlui/wrapcomponent.md).
//
// What a compiled element passes (through Bound): resolved prop values (markup
// literals are strings), `on*` handler functions, template renderers, and
// `registerApi` when the element has an `id`. The wrapper turns those into the
// native component's props:
//
//   forwarded by default   every prop not handled below, unchanged
//   typed                  literals coerced by the metadata valueType ("true" → true)
//   rename                 a gfui prop to a native prop, or to computed native props
//   events                 a gfui event to a native callback, with argument mapping;
//                          an `on*` handler without configuration is forwarded but
//                          called WITHOUT arguments: native arguments (DOM events)
//                          never reach script (the step 3 sandbox invariant)
//   value                  a controlled value in a signal: initialValue, didChange, API value/setValue;
//                          in a form (step 22, `bindTo`): the field's value instead, with focus,
//                          blur, the form's enabled state and the validation status
//   api                    more methods, with a ref to the native component
//   templates              gfui templates as native render props
//   fixed                  native props always passed (styling hooks)

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type Ref } from "react";
import { FieldBindingProvider, useFieldBinding } from "../forms/react";
import { useComputed, useSignal } from "../reactivity/react";
import { signal, type Signal } from "../reactivity/signals";
import { useComponentApi, type RegisterApi } from "./component-api";
import type { TemplateRenderer } from "./templates";

/** The part of a component's metadata the wrapper reads (structural: no dependency on the components package). */
export interface WrapMetadata {
  props: Record<string, { valueType?: string }>;
}

export interface WrapEvent {
  /** The native callback prop. */
  prop: string;
  /** Maps the native callback's arguments to the event's (`$param`, `$params`). Default: unchanged. */
  args?: (...nativeArgs: never[]) => unknown[];
}

export interface WrapValue<V = unknown> {
  /** The gfui prop with the initial value (read once, at mount). Default "initialValue". */
  initial?: string;
  /** Normalizes initial values and `setValue` arguments. */
  parse?: (raw: unknown) => V;
  /** The native value prop (controlled). */
  prop: string;
  /** The native change callback. */
  change: string;
  /** Reads the new value from the change callback's arguments. Default: the first argument. */
  read?: (...nativeArgs: never[]) => V;
  /** The gfui event fired with the new value. Default "didChange". */
  event?: string;
}

export interface WrapTemplate {
  /** The native render prop. */
  prop: string;
  /** The template's context variables from the render prop's arguments (`{ $item: … }`). */
  context: (...args: never[]) => Record<string, unknown>;
}

export interface WrapConfig {
  /** Prop metadata: literal values are coerced by `valueType`. */
  props?: WrapMetadata["props"];
  /** gfui prop → native prop name, or → native props computed from the value. */
  rename?: Record<string, string | ((value: unknown) => Record<string, unknown>)>;
  /**
   * gfui event name (`click`) → native callback, with argument mapping. An
   * unlisted `on<Event>` handler is forwarded under its own name and called
   * without arguments.
   */
  events?: Record<string, string | WrapEvent>;
  value?: WrapValue;
  /** API methods besides value/setValue; `ref` is the native component's ref. */
  api?: (context: { ref: { current: unknown }; value?: Signal<unknown> }) => Record<string, unknown>;
  templates?: Record<string, WrapTemplate>;
  /** Native props always passed (after the forwarded ones). */
  fixed?: Record<string, unknown>;
  /** gfui props never forwarded. */
  exclude?: readonly string[];
  /** The native component takes a ref (`api` uses it). */
  withRef?: boolean;
}

/** Coerces a markup literal (a string) to the declared type; other values pass unchanged. */
export function coerceLiteral(value: unknown, valueType: string | undefined): unknown {
  if (typeof value !== "string") return value;
  switch (valueType) {
    case "boolean":
      return value === "true" ? true : value === "false" ? false : value;
    case "number":
    case "integer": {
      const n = Number(value);
      return value.trim() !== "" && Number.isFinite(n) ? (valueType === "integer" ? Math.trunc(n) : n) : value;
    }
    default:
      return value;
  }
}

const eventProp = (event: string) => `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;

type Props = Record<string, unknown> & { registerApi?: RegisterApi; children?: ReactNode };

/** Wraps a React component for markup. The result is an ordinary component `Bound` can render. */
export function wrapComponent(Native: ComponentType<never>, config: WrapConfig = {}): ComponentType<Props> {
  const NativeAny = Native as unknown as ComponentType<Record<string, unknown>>;
  const value = config.value;
  const initialProp = value?.initial ?? "initialValue";
  const valueEvent = value?.event ?? "didChange";
  const handled = new Set<string>(["registerApi", "children", ...(config.exclude ?? [])]);
  if (value) handled.add(initialProp);
  for (const event of Object.keys(config.events ?? {})) handled.add(eventProp(event));
  if (value) handled.add(eventProp(valueEvent));
  for (const template of Object.keys(config.templates ?? {})) handled.add(template);

  function Wrapped(props: Props) {
    const ref = useRef<unknown>(null);
    // A form field (step 22): bound inputs read and write it instead of their own signal.
    const binding = value ? useFieldBinding() : null;
    const field = binding?.field;
    // The controlled value: created once from initialValue (in a form: the field's initial value).
    const [state] = useState(() => {
      if (!value) return undefined;
      const initial = value.parse ? value.parse(props[initialProp]) : props[initialProp];
      if (field) {
        if (props[initialProp] !== undefined) field.setInitial(initial);
        return undefined;
      }
      return signal(initial);
    });
    const current = useSignal(field?.value ?? state ?? NO_VALUE);
    const status = useComputed(
      () => (field ? { shown: field.shown.get(), severity: field.severity.get(), enabled: field.form.enabled.get() } : undefined),
      [field],
    );
    const latest = useRef(props);
    latest.current = props;
    useEffect(() => {
      if (!field) return undefined;
      field.focusTarget = () => (ref.current as { focus?: () => void } | null)?.focus?.();
      return () => {
        field.focusTarget = undefined;
      };
    }, [field]);
    // aria-describedby → the messages: set on the element, since Mantine's inputs set their own
    // (undefined unless they render a description), which would override a prop.
    const describedBy = binding && status?.shown ? binding.messagesId : undefined;
    useEffect(() => {
      const element = ref.current as Element | null;
      if (!field || !element || typeof element.setAttribute !== "function") return;
      if (describedBy) element.setAttribute("aria-describedby", describedBy);
      else element.removeAttribute("aria-describedby");
    }, [field, describedBy]);

    const api = useMemo(() => {
      const methods: Record<string, unknown> = {};
      if (field) {
        Object.defineProperty(methods, "value", { get: () => field.value.get(), enumerable: true });
        methods.setValue = (next: unknown) => field.change(value!.parse ? value!.parse(next) : next);
      } else if (state) {
        Object.defineProperty(methods, "value", { get: () => state.get(), enumerable: true });
        methods.setValue = (next: unknown) => state.set(value!.parse ? value!.parse(next) : next);
      }
      return Object.assign(methods, config.api?.({ ref, ...(state ? { value: state } : {}) }));
    }, [state, field]);
    useComponentApi(props.registerApi, api);

    const native: Record<string, unknown> = {};
    for (const [name, raw] of Object.entries(props)) {
      if (handled.has(name)) continue;
      if (/^on[A-Z]/.test(name) && typeof raw === "function") {
        // An event without configuration: forwarded, called without the native arguments.
        native[name] = () => (raw as () => unknown)();
        continue;
      }
      const typed = coerceLiteral(raw, config.props?.[name]?.valueType);
      const rename = config.rename?.[name];
      if (typeof rename === "function") Object.assign(native, rename(typed));
      else native[rename ?? name] = typed;
    }
    for (const [event, target] of Object.entries(config.events ?? {})) {
      const spec = typeof target === "string" ? { prop: target } : target;
      const handler = props[eventProp(event)] as ((...args: unknown[]) => unknown) | undefined;
      if (handler) native[spec.prop] = (...args: never[]) => handler(...(spec.args ? spec.args(...args) : args));
    }
    if (value && (state || field)) {
      native[value.prop] = field && value.parse ? value.parse(current) : current;
      native[value.change] = (...args: never[]) => {
        const next = value.read ? value.read(...args) : (args[0] as unknown);
        if (field) field.change(next);
        else state!.set(next);
        (latest.current[eventProp(valueEvent)] as ((v: unknown) => unknown) | undefined)?.(next);
      };
    }
    if (field && binding && status) {
      const onFocus = native.onFocus as ((...a: unknown[]) => unknown) | undefined;
      const onBlur = native.onBlur as ((...a: unknown[]) => unknown) | undefined;
      native.onFocus = (...args: unknown[]) => (field.focus(), onFocus?.(...args));
      native.onBlur = (...args: unknown[]) => (field.blur(), onBlur?.(...args));
      if (!status.enabled) Object.assign(native, typeof config.rename?.enabled === "function" ? config.rename.enabled(false) : { disabled: true });
      // Mantine's inputs: a red border and aria-invalid, without a message of their own.
      if (status.shown && status.severity === "error") native.error = true;
    }
    for (const [template, spec] of Object.entries(config.templates ?? {})) {
      const renderer = props[template] as TemplateRenderer | undefined;
      // Inputs inside a template (an option template) are not this field's.
      if (renderer) native[spec.prop] = (...args: never[]) => (field ? createElement(FieldBindingProvider, { binding: null }, renderer(spec.context(...args))) : renderer(spec.context(...args)));
    }
    Object.assign(native, config.fixed);
    if (config.withRef || field) native.ref = ref as Ref<unknown>;
    // Children only when given: a rename may have produced `children` (label → children).
    const children = field && props.children !== undefined ? createElement(FieldBindingProvider, { binding: null }, props.children) : props.children;
    return children === undefined ? createElement(NativeAny, native) : createElement(NativeAny, native, children);
  }
  Wrapped.displayName = `Wrapped(${Native.displayName ?? Native.name ?? "Component"})`;
  return Wrapped;
}

const NO_VALUE = signal<unknown>(undefined);
