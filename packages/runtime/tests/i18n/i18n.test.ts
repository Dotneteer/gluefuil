// Step 34: the locale core (resolution, bundles, messages on intl-messageformat,
// formatters, direction, bundle shapes, the server view). Tables where the
// behavior is a specification. Design: .ai/plan/poc-34-i18n.md
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setDiagnosticReporter } from "../../src/errors";
import { createAppApi, localeOfUrl, registerLocaleBundles } from "../../src/i18n/app-api";
import { compare, formatCurrency, formatDate, formatList, formatNumber, formatRelativeTime, pluralRules, profileOf, type LocaleProfile } from "../../src/i18n/format";
import {
  activeLocale,
  availableLocales,
  currentLocale,
  flattenMessages,
  isValidLocale,
  lookupMessage,
  normalizeLocale,
  PERSIST_KEY,
  registerBundle,
  registerLocaleLoader,
  resetI18nState,
  resolvedLocale,
  setLocale,
  setLocaleDefaults,
  textDirection,
} from "../../src/i18n/locale";
import { formatPattern, pairSelfClosingTags, resetMessageCache, translate } from "../../src/i18n/messages";
import { inServerView } from "../../src/reactivity/server-view";

let diagnostics: string[];
let restore: () => void;
beforeEach(() => {
  diagnostics = [];
  restore = setDiagnosticReporter((p) => diagnostics.push(String(p)));
  localStorage.clear();
});
afterEach(() => {
  restore();
  resetI18nState();
  resetMessageCache();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const languages = (list: string[]) => vi.stubGlobal("navigator", { languages: list, language: list[0] });

describe("locales", () => {
  test.each<[unknown, boolean, string | undefined]>([
    ["en", true, "en"],
    ["en-us", true, "en-US"],
    ["zh-hant-tw", true, "zh-Hant-TW"],
    ["", false, undefined],
    ["not a locale", false, undefined],
    [42, false, undefined],
  ])("%j: valid %s, canonical %s", (value, valid, canonical) => {
    expect(isValidLocale(value)).toBe(valid);
    if (canonical) expect(normalizeLocale(value as string)).toBe(canonical);
  });

  test.each<[string, "ltr" | "rtl"]>([
    ["en", "ltr"],
    ["de-AT", "ltr"],
    ["ar", "rtl"],
    ["he", "rtl"],
    ["fa-IR", "rtl"],
    ["ur", "rtl"],
    ["ckb", "rtl"],
    ["yi", "rtl"],
    ["ja", "ltr"],
  ])("direction of %s: %s", (locale, direction) => {
    expect(textDirection(locale)).toBe(direction);
  });
});

describe("resolution (XMLUI's order)", () => {
  test.each<[string, { app?: string; user?: string; stored?: string; nav: string[]; bundles: string[]; fallback?: string }, string, string]>([
    ["App locale wins over everything", { app: "fr", user: "de", stored: "it", nav: ["es"], bundles: ["en", "de"] }, "fr", "app"],
    ["then the user's choice", { user: "de", stored: "it", nav: ["es"], bundles: ["en"] }, "de", "user"],
    ["then the stored one", { stored: "it", nav: ["es"], bundles: ["en"] }, "it", "persisted"],
    ["then a navigator language with a bundle", { nav: ["es-MX", "de-AT"], bundles: ["en", "de"] }, "de-AT", "navigator"],
    ["a navigator language matches its language's bundle", { nav: ["en-GB"], bundles: ["en"] }, "en-GB", "navigator"],
    ["no bundles: the first navigator language", { nav: ["pt-BR"], bundles: [] }, "pt-BR", "navigator"],
    ["no match: defaultLocale", { nav: ["es"], bundles: ["de"], fallback: "de" }, "de", "default"],
    ["no match, no defaultLocale: en", { nav: ["es"], bundles: ["de"] }, "en", "default"],
  ])("%s", (_, input, locale, source) => {
    languages(input.nav);
    if (input.stored) localStorage.setItem(PERSIST_KEY, input.stored);
    resetI18nState(); // reads the stored choice again (as a page load does)
    for (const b of input.bundles) registerBundle(b, { x: "y" });
    setLocaleDefaults(input.app, input.fallback);
    if (input.user) void setLocale(input.user);
    expect(resolvedLocale.get()).toEqual({ locale, source });
  });

  test("setLocale stores the choice; an invalid one is a diagnostic and changes nothing", async () => {
    languages(["en"]);
    await setLocale("de-at");
    expect([localStorage.getItem(PERSIST_KEY), resolvedLocale.get().locale]).toEqual(["de-AT", "de-AT"]);
    await setLocale("??");
    expect(resolvedLocale.get().locale).toBe("de-AT");
    expect(diagnostics).toContain("i18n: setLocale('??'): not a valid locale");
  });

  test("the server view sees only the app's own locale (locale, else defaultLocale)", () => {
    languages(["de"]);
    localStorage.setItem(PERSIST_KEY, "fr");
    resetI18nState();
    setLocaleDefaults(undefined, "en");
    expect(currentLocale()).toBe("fr");
    expect(inServerView(() => currentLocale())).toBe("en");
    setLocaleDefaults("it", "en");
    expect(inServerView(() => currentLocale())).toBe("it");
  });

  test("a locale with a loader becomes active only when its messages are in; meanwhile the last ready one", async () => {
    languages(["en"]);
    registerBundle("en", { hi: "Hi" });
    let release: ((value: unknown) => void) | undefined;
    registerLocaleLoader("fr", () => new Promise((r) => (release = r)));
    expect(activeLocale.get()).toBe("en");
    const switching = setLocale("fr");
    expect([resolvedLocale.get().locale, activeLocale.get()]).toEqual(["fr", "en"]);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release!({ default: { hi: "Salut" } });
    await switching;
    expect(activeLocale.get()).toBe("fr");
    expect(translate("hi")).toBe("Salut");
  });

  test("a loader that fails: a diagnostic, and the locale becomes active with what it has", async () => {
    languages(["en"]);
    registerLocaleLoader("fr", () => Promise.reject(new Error("404")));
    await setLocale("fr");
    expect(activeLocale.get()).toBe("fr");
    expect(diagnostics).toContain("i18n: the messages of 'fr' failed to load: 404");
  });
});

describe("bundles", () => {
  test("lookup: the locale, its language, then the built-in gfui strings, then nothing", () => {
    registerBundle("de", { a: "de-a", b: "de-b" });
    registerBundle("de-AT", { a: "at-a" });
    expect([lookupMessage("de-AT", "a"), lookupMessage("de-AT", "b"), lookupMessage("de-AT", "gfui.form.save"), lookupMessage("de-AT", "c")]).toEqual(["at-a", "de-b", "Save", undefined]);
  });

  test("nested objects become dotted keys; later bundles win per key; invalid locales are ignored", () => {
    expect(flattenMessages({ form: { save: "S", nested: { deep: "D" } }, n: 1 })).toEqual({ "form.save": "S", "form.nested.deep": "D" });
    registerBundle("en", { a: "1", b: "2" });
    registerBundle("en", { b: "3" });
    registerBundle("??", { a: "x" });
    expect([lookupMessage("en", "a"), lookupMessage("en", "b")]).toEqual(["1", "3"]);
    expect(availableLocales()).toEqual(["en"]);
  });

  test.each<[string, string | undefined]>([
    ["/locales/de.json", "de"],
    ["https://x/i18n/de-AT.json?v=2", "de-AT"],
    ["/messages.fr.json", "fr"],
    ["/pt-BR.locale.json", "pt-BR"],
    ["/locales/messages.json", undefined],
  ])("the locale of the URL %s: %s", (url, locale) => {
    expect(localeOfUrl(url)).toBe(locale);
  });

  test("registerLocaleBundles: { locale, messages }, a locale map, and a URL named by its locale (lazy)", async () => {
    await registerLocaleBundles({ locale: "it", messages: { a: "ciao" } });
    await registerLocaleBundles({ es: { a: "hola" }, fr: { a: "salut" } });
    await registerLocaleBundles("/locales/nl.json");
    expect([lookupMessage("it", "a"), lookupMessage("es", "a"), lookupMessage("fr", "a")]).toEqual(["ciao", "hola", "salut"]);
    expect(availableLocales()).toContain("nl");
  });
});

describe("messages (intl-messageformat)", () => {
  const NOON = Date.UTC(2026, 0, 15, 12);
  test.each<[string, string, string, Record<string, unknown>, string]>([
    ["a variable", "en", "Hello, {name}!", { name: "Ada" }, "Hello, Ada!"],
    ["a missing variable renders as nothing", "en", "Hello, {name}!", {}, "Hello, !"],
    ["plural, grouping in #", "en", "{n, plural, one {# item} other {# items}}", { n: 1234 }, "1,234 items"],
    ["=0", "en", "{n, plural, =0 {none} other {#}}", { n: 0 }, "none"],
    ["offset", "en", "{n, plural, offset:1 =0 {nobody} =1 {{who}} other {{who} and # others}}", { n: 3, who: "Ada" }, "Ada and 2 others"],
    ["German grouping in #", "de", "{n, plural, one {# Datei} other {# Dateien}}", { n: 1234 }, "1.234 Dateien"],
    ["Polish few", "pl", "{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}", { n: 22 }, "22 pliki"],
    ["Polish many", "pl", "{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}", { n: 5 }, "5 plików"],
    ["Arabic two", "ar", "{n, plural, zero {z} one {o} two {t} few {f} many {m} other {x}}", { n: 2 }, "t"],
    ["Arabic many", "ar", "{n, plural, zero {z} one {o} two {t} few {f} many {m} other {x}}", { n: 11 }, "m"],
    ["selectordinal", "en", "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}", { n: 22 }, "22nd"],
    ["select", "en", "{g, select, female {She} other {They}}", { g: "x" }, "They"],
    ["the # of a nested plural is its own (XMLUI's is the outer)", "en", "{a, plural, other {# apples {b, plural, one {and # pear} other {and # pears}}}}", { a: 2, b: 1 }, "2 apples and 1 pear"],
    ["apostrophe quoting", "en", "It''s '{literal}'", {}, "It's {literal}"],
    ["a number skeleton", "de", "{v, number, ::currency/EUR}", { v: 1234.5 }, "1.234,50 €"],
    ["a date style", "en", "{d, date, medium}", { d: NOON }, "Jan 15, 2026"],
    ["a paired tag without a handler: its text", "en", "Read <b>this</b>.", {}, "Read this."],
    ["XMLUI's <link/> without a handler: nothing", "en", "Accept the <link/>.", {}, "Accept the ."],
  ])("%s", (_, locale, pattern, vars, expected) => {
    expect(formatPattern(pattern, locale, vars)).toBe(expected);
  });

  test("tag handlers receive the content and may return parts", () => {
    expect(formatPattern("Read <link>terms</link> now", "en", {}, { link: (c) => ({ link: c.join("") }) })).toEqual(["Read ", { link: "terms" }, " now"]);
    expect(pairSelfClosingTags("a <x/> b <y />")).toBe("a <x></x> b <y></y>");
  });

  test("a missing key: the key and one diagnostic; an invalid pattern: the key and a diagnostic", () => {
    registerBundle("en", { bad: "{n, plural, one {x}}" });
    expect([translate("nope", undefined, "en"), translate("nope", undefined, "en")]).toEqual(["nope", "nope"]);
    expect(translate("bad", { n: 1 }, "en")).toBe("bad");
    expect(diagnostics.filter((d) => d.includes("nope"))).toHaveLength(1);
    expect(diagnostics.some((d) => d.startsWith("i18n: the message 'bad' (en) is not valid ICU"))).toBe(true);
  });
});

describe("formatters", () => {
  const en: LocaleProfile = { locale: "en" };
  const de: LocaleProfile = { locale: "de" };
  test.each<[string, () => unknown, unknown]>([
    ["formatNumber en", () => formatNumber(en, 1234.5), "1,234.5"],
    ["formatNumber de", () => formatNumber(de, 1234.5), "1.234,5"],
    ["formatNumber with options", () => formatNumber(en, 0.256, { style: "percent" }), "26%"],
    ["formatCurrency", () => formatCurrency(de, 9.5, "EUR"), "9,50 €"],
    ["formatCurrency: the profile's currency", () => formatCurrency({ locale: "en", currency: "JPY" }, 1200), "¥1,200"],
    ["formatDate", () => formatDate(en, Date.UTC(2026, 0, 15, 12), { dateStyle: "long", timeZone: "UTC" }), "January 15, 2026"],
    ["formatDate: an invalid date is empty", () => formatDate(en, "nope"), ""],
    ["formatList en", () => formatList(en, ["a", "b", "c"]), "a, b, and c"],
    ["formatList de", () => formatList(de, ["a", "b", "c"]), "a, b und c"],
    ["formatRelativeTime", () => formatRelativeTime(de, -3, "day"), "vor 3 Tagen"],
    ["compare (German collation: ä with a)", () => ["z", "ä", "a"].sort((x, y) => compare(de, x, y)), ["a", "ä", "z"]],
    ["pluralRules", () => pluralRules({ locale: "pl" }, 5), "many"],
    ["traits: separators and minus sign", () => formatNumber(profileOf({ decimalSeparator: "·", groupSeparator: "'", minusSign: "−" }, en), -1234.5), "−1'234·5"],
    ["traits: a numbering system", () => formatNumber(profileOf({ numberingSystem: "arab" }, en), 12), "١٢"],
    ["profileOf: an invalid locale keeps the parent's", () => profileOf({ locale: "??" }, de).locale, "de"],
  ])("%s", (_, run, expected) => {
    expect(run()).toEqual(expected);
  });
});

describe("the App object", () => {
  test("a scoped App uses its profile; the root follows the current locale", () => {
    languages(["en"]);
    registerBundle("en", { hi: "Hi {n}" });
    registerBundle("de", { hi: "Hallo {n}" });
    const scoped = createAppApi(() => ({ locale: "de" }), true);
    expect([scoped.locale, scoped.translate("hi", { n: 1 }), scoped.formatNumber(1.5), scoped.localeSource, scoped.direction]).toEqual(["de", "Hallo 1", "1,5", "scope", "ltr"]);
    expect(Object.isFrozen(scoped)).toBe(true);
    expect(scoped.isRtlLocale("he")).toBe(true);
  });
});
