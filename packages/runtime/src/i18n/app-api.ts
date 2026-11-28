// The `App` app global (steps 33–34): App.errors, and the locale API over a
// locale profile: the app's (the global) or a <Locale>'s (decision E1: the
// scope's `App` context variable). Frozen: script reads it, never changes it.
import { sendRequest } from "../data/http";
import { reportDiagnostic } from "../errors";
import { appErrors } from "../render/app-errors";
import { compare, formatCurrency, formatDate, formatList, formatNumber, formatRelativeTime, pluralRules, type LocaleProfile } from "./format";
import { availableLocales, currentLocale, currentLocaleSource, isValidLocale, registerBundle, registerLocaleLoader, setLocale, textDirection } from "./locale";
import { translate } from "./messages";

/** The locale of a bundle file's name: `de.json`, `de-AT.locale.json`, `messages.de.json`. */
export function localeOfUrl(url: string): string | undefined {
  const name = url.split(/[?#]/)[0]!.split("/").pop() ?? "";
  const parts = name.replace(/\.json$/i, "").replace(/\.locale$/i, "").split(".");
  const candidate = parts[parts.length - 1];
  return candidate && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(candidate) && isValidLocale(candidate) ? candidate : undefined;
}

async function fetchBundle(url: string): Promise<void> {
  const { data } = await sendRequest({ url });
  const json = (data ?? {}) as Record<string, unknown>;
  const locale = typeof json.locale === "string" ? json.locale : localeOfUrl(url);
  if (!locale) {
    reportDiagnostic(`i18n: the bundle '${url}' names no locale (a "locale" field, or a file name like de.json)`);
    return;
  }
  const { locale: _ignored, messages, ...rest } = json;
  registerBundle(locale, messages ?? rest);
}

/**
 * XMLUI's bundle shapes (AppContent.tsx L1059): a URL or an array of them; `{ locale,
 * messages }`; `{ "de-DE": { key: message } }`. A URL whose file name names its
 * locale loads on demand; others load now. Resolves when the immediate ones are in.
 */
export function registerLocaleBundles(input: unknown): Promise<void> {
  if (input === undefined || input === null) return Promise.resolve();
  if (typeof input === "string") {
    const locale = localeOfUrl(input);
    if (locale) {
      registerLocaleLoader(locale, async () => {
        const { data } = await sendRequest({ url: input });
        const json = (data ?? {}) as Record<string, unknown>;
        return json.messages ?? json;
      });
      return Promise.resolve();
    }
    return fetchBundle(input).catch((error: unknown) => reportDiagnostic(`i18n: the bundle '${input}' failed to load: ${error instanceof Error ? error.message : String(error)}`));
  }
  if (Array.isArray(input)) return Promise.all(input.map(registerLocaleBundles)).then(() => undefined);
  if (typeof input === "object") {
    const object = input as Record<string, unknown>;
    if (typeof object.locale === "string" && object.messages !== undefined) {
      registerBundle(object.locale, object.messages);
      return Promise.resolve();
    }
    for (const [locale, messages] of Object.entries(object)) {
      if (typeof messages === "string") void registerLocaleBundles(messages);
      else registerBundle(locale, messages);
    }
  }
  return Promise.resolve();
}

/** The `App` object over a locale profile (a getter: reactive in bindings). */
export function createAppApi(profile: () => LocaleProfile, scoped = false) {
  return Object.freeze({
    /** Step 33: the unhandled errors. */
    get errors() {
      return appErrors.get();
    },
    get locale() {
      return profile().locale;
    },
    get localeSource() {
      return scoped ? "scope" : currentLocaleSource();
    },
    get availableLocales() {
      return availableLocales();
    },
    get direction() {
      return textDirection(profile().locale);
    },
    setLocale: (locale: unknown) => setLocale(locale),
    registerLocaleBundles: (input: unknown) => registerLocaleBundles(input),
    translate: (key: unknown, vars?: unknown) => toText(translate(key, vars, profile().locale)),
    t: (key: unknown, vars?: unknown) => toText(translate(key, vars, profile().locale)),
    isRtlLocale: (locale?: unknown) => textDirection(typeof locale === "string" && locale !== "" ? locale : profile().locale) === "rtl",
    formatNumber: (value: unknown, options?: unknown) => formatNumber(profile(), value, options),
    formatCurrency: (value: unknown, currency?: unknown, options?: unknown) => formatCurrency(profile(), value, currency, options),
    formatDate: (value: unknown, options?: unknown) => formatDate(profile(), value, options),
    formatList: (values: unknown, options?: unknown) => formatList(profile(), values, options),
    formatRelativeTime: (value: unknown, unit: unknown, options?: unknown) => formatRelativeTime(profile(), value, unit, options),
    compare: (a: unknown, b: unknown, options?: unknown) => compare(profile(), a, b, options),
    pluralRules: (value: unknown, options?: unknown) => pluralRules(profile(), value, options),
  });
}

const toText = (result: string | unknown[]): string => (typeof result === "string" ? result : result.map(String).join(""));

/** The root profile: the current locale, no traits. */
export function rootProfile(): LocaleProfile {
  return { locale: currentLocale() };
}

/** The `App` app global. */
export const AppGlobal = createAppApi(rootProfile);
