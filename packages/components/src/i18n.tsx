// I18n and Locale (step 34; design: .ai/plan/poc-34-i18n.md § Messages, § Formatters).
//
//   <I18n key="greeting" name="{user.name}"/>        a message; other props are its variables
//   <I18n key="terms"><property name="link"><Link to="/terms">{$content}</Link></property></I18n>
//                                                    a slot replaces <link/> or <link>…</link>
//   <Locale locale="de-DE" decimalSeparator=",">…</Locale>
//                                                    a scoped locale: components, and `App` in script
import {
  createAppApi,
  localeLoad,
  messagesVersion,
  profileOf,
  provideContext,
  signal,
  textDirection,
  translate,
  useComputed,
  useLocaleProfile,
  LocaleProfileContext,
  type LocaleProfile,
  type TemplateRenderer,
} from "@gluefuil/runtime";
import { DirectionContext } from "@mantine/core";
import { cloneElement, isValidElement, Suspense, use, useMemo, useState, type ReactNode } from "react";

/** Props that are not message variables. */
const NOT_VARIABLES = new Set(["$$propKey", "registerApi", "children", "$$layoutFrom"]);

export function I18n(props: Record<string, unknown>) {
  const key = props.$$propKey;
  const { locale } = useLocaleProfile();
  // A bundle that registers (or loads) later re-renders the message.
  useComputed(() => messagesVersion(), []);
  const vars: Record<string, unknown> = {};
  const slots: Record<string, TemplateRenderer> = {};
  for (const [name, value] of Object.entries(props)) {
    if (NOT_VARIABLES.has(name)) continue;
    if (name.startsWith("$$slot.")) slots[name.slice(7)] = value as TemplateRenderer;
    else vars[name.startsWith(":") ? name.slice(1) : name] = value;
  }
  let counter = 0;
  const tags = Object.fromEntries(
    Object.entries(slots).map(([name, render]) => [name, (content: unknown[]) => render({ $content: content.map(String).join("") }, `${name}-${counter++}`)]),
  );
  const result = translate(key, vars, locale, tags);
  if (!Array.isArray(result)) return <>{result}</>;
  return <>{result.map((part, index) => (isValidElement(part) ? cloneElement(part, { key: part.key ?? index }) : (part as ReactNode)))}</>;
}

export interface LocaleProps {
  locale?: unknown;
  decimalSeparator?: unknown;
  groupSeparator?: unknown;
  thousandSeparator?: unknown;
  minusSign?: unknown;
  currency?: unknown;
  numberingSystem?: unknown;
  /** The context scope the compiler gives it: its children's `App` (decision E1). */
  contextScope?: unknown;
  children?: ReactNode;
}

export function Locale({ locale, decimalSeparator, groupSeparator, thousandSeparator, minusSign, currency, numberingSystem, contextScope, children }: LocaleProps) {
  const parent = useLocaleProfile();
  const profile = useMemo(
    () => profileOf({ locale, decimalSeparator, groupSeparator, thousandSeparator, minusSign, currency, numberingSystem }, parent),
    [locale, decimalSeparator, groupSeparator, thousandSeparator, minusSign, currency, numberingSystem, parent],
  );
  // The scope's `App`, in a signal: bindings reading it run again when the profile changes.
  const [state] = useState(() => ({ profile: signal<LocaleProfile>(profile) }));
  if (state.profile.peek() !== profile) state.profile.set(profile);
  const api = useMemo(() => createAppApi(() => state.profile.get(), true), [state]);
  provideContext(contextScope, { App: () => api });
  // A lazy locale's messages (a locale file): suspend until they are in. Hydration keeps the
  // prerendered HTML meanwhile; the prerender renders again once they loaded.
  const pending = useComputed(() => localeLoad(profile.locale), [profile.locale]);
  const dir = textDirection(profile.locale);
  const mantineDirection = useMemo(() => ({ dir, setDirection: () => {}, toggleDirection: () => {} }), [dir]);
  return (
    <div className="gfui-Locale" lang={profile.locale} dir={dir} style={{ display: "contents" }}>
      <LocaleProfileContext.Provider value={profile}>
        <DirectionContext.Provider value={mantineDirection}>
          <Suspense fallback={null}>
            <LocaleGate pending={pending}>{children}</LocaleGate>
          </Suspense>
        </DirectionContext.Provider>
      </LocaleProfileContext.Provider>
    </div>
  );
}

/** A promise React's `use` reads as fulfilled at once (no suspension). */
const READY = Object.assign(Promise.resolve(), { status: "fulfilled" as const, value: undefined });

/** Suspends while a Locale's messages load. `use` runs on every render (React requires it). */
function LocaleGate({ pending, children }: { pending: Promise<void> | undefined; children?: ReactNode }) {
  use(pending ?? READY);
  return <>{children}</>;
}
