// DateInput, TimeInput, DatePicker (step 26; design: .ai/plan/poc-26-dates.md).
// The markup components are here, in the main chunk; their Mantine parts are a
// lazy chunk (dates-native.tsx, with @mantine/dates and dayjs), read with use()
// inside a Suspense boundary, as Markdown's renderer (step 23): the prerender
// renders again once it loaded, and a prerendered boundary keeps its HTML
// until the chunk arrives.
import { lazyResource, noteServerLoad, wrapComponent, type WrapConfig } from "@gluefuil/runtime";
import { createElement, memo, Suspense, use, useMemo, useRef, type ComponentType } from "react";
import { dateToIso, formatTime, isoToDate, parseTime, timeToIso } from "./date-format";

/** A date in `dateFormat` (from ISO, or as given when it isn't a date). */
const normalizeDate = (value: unknown, format: unknown) => (typeof value === "string" ? (isoToDate(dateToIso(value, format), format) ?? value) : value);
import { enabledToDisabled, FOCUS_EVENTS, focusApi, validationStatus } from "./inputs";
import { withLayout } from "./layout-wrap";
import { componentMetadata } from "./metadata";

const natives = lazyResource(() => import("./dates-native"));

/** Starts loading the date and time inputs' chunk (an app can call it early). */
export function preloadDates(): Promise<unknown> {
  return natives.load();
}

type NativeName = "DateInputNative" | "TimeInputNative" | "DatePickerNative";
type Props = Record<string, unknown>;

/**
 * Equal for the boundary: the same primitives, plain objects and arrays with
 * equal entries, React elements by identity. Functions always count as equal:
 * the body reads them through the holder (their identity changes every render).
 */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "function" && typeof b === "function") return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if ("$$typeof" in a || "$$typeof" in b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && same((a as Props)[k], (b as Props)[k]));
}

interface BodyProps {
  name: NativeName;
  props: Props;
  holder: { current: Props };
}

/** Renders the native once the chunk is loaded; suspends until then. Callbacks call the latest props. */
function DatesBody({ name, props, holder }: BodyProps) {
  const loading = natives.load();
  // For a server render (the prerender renders again once it loaded).
  if (natives.value === undefined) noteServerLoad(loading);
  const module = use(loading);
  const Native = module[name] as unknown as ComponentType<Props>;
  const live: Props = {};
  for (const [key, value] of Object.entries(props)) {
    live[key] = typeof value === "function" ? (...args: unknown[]) => (holder.current[key] as ((...a: unknown[]) => unknown) | undefined)?.(...args) : value;
  }
  return createElement(Native, live);
}

/**
 * The Suspense boundary, memoized: while a prerendered boundary waits for the
 * chunk (dehydrated), an update would make React drop the server HTML; the
 * takeover's own re-render (new callbacks, equal values) must not reach it.
 */
const DatesBoundary = memo(
  function DatesBoundary(props: BodyProps) {
    return (
      <Suspense fallback={<div className="gfui-Dates-loading" aria-hidden="true" />}>
        <DatesBody {...props} />
      </Suspense>
    );
  },
  (a, b) => a.name === b.name && a.holder === b.holder && same(a.props, b.props),
);

/** A native from the chunk, as a component wrapComponent can wrap. */
function lazyNative(name: NativeName) {
  function LazyNative(props: Props) {
    const holder = useRef(props);
    holder.current = props;
    return <DatesBoundary name={name} props={props} holder={holder} />;
  }
  LazyNative.displayName = name;
  return LazyNative;
}

// A prerendered page with a date or time input: start loading the chunk now, before the takeover needs it.
if (typeof document !== "undefined" && document.querySelector("[data-gfui-prerendered] :is(.gfui-DateInput, .gfui-TimeInput, .gfui-DatePicker)")) void natives.load();

/**
 * The markup component: passes `initialValue` on as `$$initial` (clearToInitialValue),
 * and adds methods that read the props to the API (isoValue needs `dateFormat`).
 */
type Methods = (value: () => unknown, props: () => Props) => Record<string, (...args: never[]) => unknown>;
/** A value as the component writes it (XMLUI normalizes the initial value and setValue's: an ISO date → dateFormat). */
type Normalize = (value: unknown, props: Props) => unknown;

function markup(Wrapped: ComponentType<Props>, extra: Methods, normalize: Normalize, displayName: string) {
  function Markup(props: Props) {
    const latest = useRef(props);
    latest.current = props;
    const register = props.registerApi as ((api: object | undefined) => void) | undefined;
    const registerApi = useMemo(
      () =>
        register &&
        ((api: object | undefined) => {
          if (!api) return register(undefined);
          const setValue = (api as { setValue?: (v: unknown) => void }).setValue;
          const methods = {
            ...extra(() => (api as { value?: unknown }).value, () => latest.current),
            ...(setValue ? { setValue: (next: unknown) => setValue(normalize(next, latest.current)) } : {}),
          };
          const descriptors = Object.fromEntries(Object.entries(methods).map(([k, method]) => [k, { value: method, enumerable: true }]));
          register(Object.freeze(Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(api), ...descriptors })));
        }),
      [register],
    );
    const initial = props.initialValue === undefined ? undefined : normalize(props.initialValue, props);
    return createElement(Wrapped, { ...props, initialValue: initial, $$initial: initial, ...(register ? { registerApi } : {}) });
  }
  Markup.displayName = displayName;
  return withLayout(Markup as ComponentType<Record<string, unknown>>);
}

/** A value as given: "" and undefined are empty (`empty`). */
const valueOr = (empty: unknown) => (raw: unknown) => (raw === undefined || raw === null || raw === "" ? empty : raw);

function config(name: string, nativeEmpty: unknown, events: WrapConfig["events"] = {}): WrapConfig {
  return {
    props: componentMetadata[name]!.props,
    rename: { enabled: enabledToDisabled, validationStatus },
    events: { ...FOCUS_EVENTS, ...events },
    value: { prop: "value", change: "onChange", parse: valueOr(nativeEmpty) },
    withRef: true,
    api: focusApi,
    fixed: { className: `gfui-${name}` },
  };
}

/** DateInput: a string in `dateFormat`, or null; `isoValue()` is YYYY-MM-DD. */
export const DateInput = markup(
  wrapComponent(lazyNative("DateInputNative") as never, config("DateInput", null)),
  (value, props) => ({ isoValue: () => dateToIso(value(), props().dateFormat) }),
  (value, props) => normalizeDate(value, props.dateFormat),
  "DateInput",
);

/** TimeInput: HH:mm[:ss] or hh:mm[:ss] am, or null; `isoValue()` is 24-hour HH:mm:ss. */
export const TimeInput = markup(
  wrapComponent(lazyNative("TimeInputNative") as never, config("TimeInput", null, { invalidTime: "onInvalidTime" })),
  (value) => ({
    isoValue: () => {
      const time = parseTime(value());
      return time ? timeToIso(time) : null;
    },
  }),
  (value, props) => {
    const time = parseTime(value);
    return time ? formatTime(time, !(props.hour24 === false || props.hour24 === "false"), props.seconds === true || props.seconds === "true") : value;
  },
  "TimeInput",
);

/** DatePicker: a string in `dateFormat`, or `{ from, to }` (range); undefined when empty. */
export const DatePicker = markup(
  wrapComponent(lazyNative("DatePickerNative") as never, config("DatePicker", undefined)),
  (value) => ({ getValue: () => value() }),
  (value, props) => {
    if (value !== null && typeof value === "object" && props.mode === "range") {
      const range = value as { from?: unknown; to?: unknown };
      return { from: normalizeDate(range.from, props.dateFormat), to: normalizeDate(range.to, props.dateFormat) };
    }
    return normalizeDate(value, props.dateFormat);
  },
  "DatePicker",
);
