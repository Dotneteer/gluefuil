// The active locale and the message bundles (step 34; design:
// .ai/plan/poc-34-i18n.md § The locale). One state per page, like the theme.
//
// Resolution, in XMLUI's order (components-core/i18n/locale-resolver.ts):
//   <App locale>  >  App.setLocale()  >  localStorage["gfui.locale"]
//   >  the first navigator.languages entry with a bundle (or its language)
//   >  <App defaultLocale> ("en")
//
// The server view (the prerender and hydration) sees only the app's locale
// (`locale`, else `defaultLocale`): storage and navigator exist only in the
// browser. After the takeover the client's locale applies (decision C1), once
// its bundle is loaded: the active locale stays on the last one that is ready.
import { reportDiagnostic } from "../errors";
import { computed, signal, type ReadonlySignal } from "../reactivity/signals";
import { isServerView } from "../reactivity/server-view";
import { noteServerLoad } from "../render/lazy";
import { staticRenderInfo } from "../render/static-render";
import { BUILT_IN_MESSAGES } from "./builtin-en";

export const PERSIST_KEY = "gfui.locale";

/** Whether `value` is a BCP 47 locale `Intl` accepts. */
export function isValidLocale(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    Intl.getCanonicalLocales(value);
    return true;
  } catch {
    return false;
  }
}

/** The canonical form (`en-us` → `en-US`); the input when it isn't valid. */
export function normalizeLocale(value: string): string {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? value;
  } catch {
    return value;
  }
}

/** The language part (`de-AT` → `de`). */
export const languageOf = (locale: string): string => locale.split("-")[0]!;

/** Right-to-left scripts when Intl has no text info (CLDR's RTL languages). */
const RTL_LANGUAGES = new Set(["ar", "arc", "ckb", "dv", "fa", "ha", "he", "khw", "ks", "ku", "ps", "sd", "syr", "ug", "ur", "yi"]);

/** The text direction of a locale: Intl.Locale's text info (getTextInfo, or textInfo in Node), else the list. */
export function textDirection(locale: string): "ltr" | "rtl" {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
    const direction = info.getTextInfo?.().direction ?? info.textInfo?.direction;
    if (direction === "rtl" || direction === "ltr") return direction;
  } catch {
    // not a valid locale: the list decides
  }
  return RTL_LANGUAGES.has(languageOf(locale).toLowerCase()) ? "rtl" : "ltr";
}

// --- Bundles --------------------------------------------------------------------------

type Messages = Record<string, string>;

const bundles = new Map<string, Messages>();
const loaders = new Map<string, () => Promise<unknown>>();
const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();
const version = signal(0);

/** A nested object as dotted keys (`{ form: { save: "x" } }` → `form.save`); strings only. */
export function flattenMessages(input: unknown, prefix = "", into: Messages = {}): Messages {
  if (input === null || typeof input !== "object") return into;
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") into[path] = value;
    else if (value !== null && typeof value === "object" && !Array.isArray(value)) flattenMessages(value, path, into);
  }
  return into;
}

/** Adds messages to a locale's bundle (later ones win). */
export function registerBundle(locale: string, messages: unknown): void {
  if (!isValidLocale(locale)) {
    reportDiagnostic(`i18n: a bundle for an invalid locale '${locale}' is ignored`);
    return;
  }
  const key = normalizeLocale(locale);
  bundles.set(key, { ...bundles.get(key), ...flattenMessages(messages) });
  version.set(version.peek() + 1);
}

/** A locale whose messages load on demand (a locale file's chunk, a URL); `load` resolves to the messages. */
export function registerLocaleLoader(locale: string, load: () => Promise<unknown>): void {
  if (!isValidLocale(locale)) return;
  const key = normalizeLocale(locale);
  if (loaders.has(key)) return;
  loaders.set(key, load);
  version.set(version.peek() + 1);
}

/** Changes whenever a bundle or a loader is added (reactive). */
export function messagesVersion(): number {
  return version.get();
}

/**
 * Which bundles a locale's messages come from, and their version (reactive):
 * two locales with the same signature show the same messages (`en` and
 * `en-US` without an `en-US` bundle). Components re-render on a change of it,
 * not of the locale's name: a takeover that switches `en` to `en-US` doesn't
 * touch a Suspense boundary that is still dehydrated.
 */
export function messagesSignature(locale: string): string {
  const v = version.get();
  const own = bundles.has(locale) || loaders.has(locale) ? locale : "";
  const language = languageOf(locale);
  const lang = language !== locale && (bundles.has(language) || loaders.has(language)) ? language : "";
  return `${own}|${lang}|${v}`;
}

/** The locales with messages or a loader (reactive). */
export function availableLocales(): readonly string[] {
  version.get();
  return [...new Set([...bundles.keys(), ...loaders.keys()])];
}

/** The pattern for `key`: the locale, its language, then (gfui.* keys) the built-in English strings. Reactive. */
export function lookupMessage(locale: string, key: string): string | undefined {
  version.get();
  return bundles.get(locale)?.[key] ?? bundles.get(languageOf(locale))?.[key] ?? (key.startsWith("gfui.") ? BUILT_IN_MESSAGES[key] : undefined);
}

/** The loaders a locale still waits for: its own and its language's. */
function pendingLoads(locale: string): string[] {
  return [locale, languageOf(locale)].filter((l, i, all) => all.indexOf(l) === i && loaders.has(l) && !loaded.has(l));
}

/** Loads a locale's (and its language's) messages; resolves when they are registered (or failed). */
export function loadLocale(locale: string): Promise<void> {
  const waits = pendingLoads(locale).map((l) => {
    let running = loading.get(l);
    if (!running) {
      running = Promise.resolve()
        .then(() => loaders.get(l)!())
        .then(
          (module) => {
            const messages = module !== null && typeof module === "object" && "default" in module ? (module as { default: unknown }).default : module;
            loaded.add(l);
            registerBundle(l, messages);
          },
          (error: unknown) => {
            loaded.add(l);
            version.set(version.peek() + 1);
            reportDiagnostic(`i18n: the messages of '${l}' failed to load: ${error instanceof Error ? error.message : String(error)}`);
          },
        );
      loading.set(l, running);
    }
    return running;
  });
  return Promise.all(waits).then(() => undefined);
}

const pendingPromises = new Map<string, Promise<void>>();

/**
 * Step 34 (<Locale>): undefined when a locale's messages are in; else the
 * promise of their load, started now (the same promise until it settles, for
 * React's `use`). In a static render the prerender waits for it and renders again.
 */
export function localeLoad(locale: string): Promise<void> | undefined {
  version.get();
  if (pendingLoads(locale).length === 0) return undefined;
  let promise = pendingPromises.get(locale);
  if (!promise) {
    promise = loadLocale(locale).finally(() => pendingPromises.delete(locale));
    pendingPromises.set(locale, promise);
  }
  if (staticRenderInfo()) noteServerLoad(promise);
  return promise;
}

// --- Resolution -----------------------------------------------------------------------

const appLocale = signal<string | undefined>(undefined);
const defaultLocale = signal("en");
const userLocale = signal<string | undefined>(undefined);

const storage = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } | undefined => {
  try {
    return (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }).localStorage;
  } catch {
    return undefined;
  }
};

function readStoredLocale(): string | undefined {
  try {
    const value = storage()?.getItem(PERSIST_KEY) ?? undefined;
    return isValidLocale(value) ? normalizeLocale(value) : undefined;
  } catch {
    return undefined;
  }
}

/** The stored choice, read once at start-up (a signal: the resolution depends on it). */
const storedLocale = signal<string | undefined>(readStoredLocale());

function navigatorLanguages(): readonly string[] {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
  return nav?.languages ?? (nav?.language ? [nav.language] : []);
}

export type LocaleSource = "app" | "user" | "persisted" | "navigator" | "default";

/** The app's own locale: `locale`, else `defaultLocale` (what the prerender renders). */
function appOwnLocale(): string {
  return appLocale.get() ?? defaultLocale.get();
}

/** The client's resolution (XMLUI's order). */
export const resolvedLocale: ReadonlySignal<{ locale: string; source: LocaleSource }> = computed(() => {
  const fromApp = appLocale.get();
  if (fromApp) return { locale: fromApp, source: "app" as const };
  const fromUser = userLocale.get();
  if (fromUser) return { locale: fromUser, source: "user" as const };
  const persisted = storedLocale.get();
  if (persisted) return { locale: persisted, source: "persisted" as const };
  const available = availableLocales();
  for (const candidate of navigatorLanguages()) {
    if (!isValidLocale(candidate)) continue;
    const locale = normalizeLocale(candidate);
    if (available.length === 0 || available.includes(locale) || available.includes(languageOf(locale))) return { locale, source: "navigator" as const };
  }
  return { locale: defaultLocale.get(), source: "default" as const };
});

let lastReady: string | undefined;

/** The client's locale once its messages are loaded; until then the last ready one (or the app's own). */
export const activeLocale: ReadonlySignal<string> = computed(() => {
  const { locale } = resolvedLocale.get();
  version.get();
  if (pendingLoads(locale).length === 0) {
    lastReady = locale;
    return locale;
  }
  // Load it (not inside this computation: the load sets signals).
  queueMicrotask(() => void loadLocale(locale));
  return lastReady ?? appOwnLocale();
});

/** The locale bindings and components use: the app's own in the server view (prerender, hydration), else the active one. */
export function currentLocale(): string {
  return isServerView() ? appOwnLocale() : activeLocale.get();
}

/** Where the current locale came from. */
export function currentLocaleSource(): LocaleSource {
  if (isServerView()) return appLocale.get() ? "app" : "default";
  return resolvedLocale.get().source;
}

/**
 * The App's `locale` and `defaultLocale`. Called while the App renders, so the
 * first render (and a server render) already uses them.
 */
export function setLocaleDefaults(locale: unknown, fallback: unknown): void {
  const app = isValidLocale(locale) ? normalizeLocale(locale) : undefined;
  if (locale !== undefined && locale !== null && locale !== "" && app === undefined) reportDiagnostic(`i18n: App locale '${String(locale)}' is not a valid locale`);
  if (appLocale.peek() !== app) appLocale.set(app);
  const def = isValidLocale(fallback) ? normalizeLocale(fallback) : "en";
  if (defaultLocale.peek() !== def) defaultLocale.set(def);
}

/** `App.setLocale(locale)`: the user's choice, kept in localStorage; resolves once its messages are loaded. */
export function setLocale(locale: unknown): Promise<void> {
  if (!isValidLocale(locale)) {
    reportDiagnostic(`i18n: setLocale('${String(locale)}'): not a valid locale`);
    return Promise.resolve();
  }
  const normalized = normalizeLocale(locale);
  try {
    storage()?.setItem(PERSIST_KEY, normalized);
  } catch {
    // storage refused (private mode): the choice lasts for this page
  }
  storedLocale.set(normalized);
  userLocale.set(normalized);
  return loadLocale(normalized);
}

/** Forgets bundles, loaders and choices (tests; a new server render). */
export function resetI18nState(): void {
  bundles.clear();
  loaders.clear();
  loading.clear();
  loaded.clear();
  pendingPromises.clear();
  lastReady = undefined;
  appLocale.set(undefined);
  defaultLocale.set("en");
  userLocale.set(undefined);
  storedLocale.set(readStoredLocale());
  version.set(version.peek() + 1);
}
