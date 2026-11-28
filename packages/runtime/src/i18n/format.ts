// Locale-aware formatters (step 34; XMLUI's components-core/i18n/formatters.ts and
// locale-profile.ts): the active or scoped locale, plus <Locale>'s traits
// (separators, the minus sign, a default currency, a numbering system). Intl
// objects are cached per locale and options.
import { isValidLocale, normalizeLocale } from "./locale";

/** A locale and the traits a <Locale> can override. */
export interface LocaleProfile {
  readonly locale: string;
  readonly decimalSeparator?: string;
  readonly groupSeparator?: string;
  readonly minusSign?: string;
  readonly currency?: string;
  readonly numberingSystem?: string;
}

export interface LocaleProfileInput {
  locale?: unknown;
  decimalSeparator?: unknown;
  groupSeparator?: unknown;
  thousandSeparator?: unknown;
  minusSign?: unknown;
  currency?: unknown;
  numberingSystem?: unknown;
}

const nonEmpty = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/** A <Locale>'s profile over its parent's: an invalid locale keeps the parent's. */
export function profileOf(input: LocaleProfileInput, parent: LocaleProfile): LocaleProfile {
  const locale = isValidLocale(input.locale) ? normalizeLocale(input.locale) : parent.locale;
  const traits = {
    decimalSeparator: nonEmpty(input.decimalSeparator),
    groupSeparator: nonEmpty(input.groupSeparator) ?? nonEmpty(input.thousandSeparator),
    minusSign: nonEmpty(input.minusSign),
    currency: nonEmpty(input.currency),
    numberingSystem: nonEmpty(input.numberingSystem),
  };
  const profile: Record<string, string> = { ...(parent as unknown as Record<string, string>), locale };
  for (const [key, value] of Object.entries(traits)) if (value !== undefined) profile[key] = value;
  return Object.freeze(profile) as unknown as LocaleProfile;
}

const formatters = new Map<string, unknown>();
function cached<T>(kind: string, locale: string, options: object | undefined, make: () => T): T {
  const key = `${kind}\u0000${locale}\u0000${options === undefined ? "" : JSON.stringify(options)}`;
  let value = formatters.get(key) as T | undefined;
  if (value === undefined) {
    value = make();
    formatters.set(key, value);
  }
  return value;
}

const asOptions = <T extends object>(value: unknown): T | undefined => (value !== null && typeof value === "object" ? (value as T) : undefined);

function numberFormat(profile: LocaleProfile, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const withSystem = profile.numberingSystem && !options?.numberingSystem ? { ...options, numberingSystem: profile.numberingSystem } : options;
  return cached("number", profile.locale, withSystem, () => new Intl.NumberFormat(profile.locale, withSystem));
}

function formatWithTraits(format: Intl.NumberFormat, value: number, profile: LocaleProfile): string {
  if (profile.decimalSeparator === undefined && profile.groupSeparator === undefined && profile.minusSign === undefined) return format.format(value);
  return format
    .formatToParts(value)
    .map((part) =>
      part.type === "decimal" ? (profile.decimalSeparator ?? part.value) : part.type === "group" ? (profile.groupSeparator ?? part.value) : part.type === "minusSign" ? (profile.minusSign ?? part.value) : part.value,
    )
    .join("");
}

export function formatNumber(profile: LocaleProfile, value: unknown, options?: unknown): string {
  return formatWithTraits(numberFormat(profile, asOptions(options)), Number(value), profile);
}

export function formatCurrency(profile: LocaleProfile, value: unknown, currency?: unknown, options?: unknown): string {
  const code = nonEmpty(currency) ?? profile.currency ?? "USD";
  return formatWithTraits(numberFormat(profile, { style: "currency", currency: code, ...asOptions<Intl.NumberFormatOptions>(options) }), Number(value), profile);
}

export function formatDate(profile: LocaleProfile, value: unknown, options?: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return "";
  const o = asOptions<Intl.DateTimeFormatOptions>(options);
  return cached("date", profile.locale, o, () => new Intl.DateTimeFormat(profile.locale, o)).format(date);
}

export function formatList(profile: LocaleProfile, values: unknown, options?: unknown): string {
  const list = Array.isArray(values) ? values.map(String) : [];
  const o = asOptions<Intl.ListFormatOptions>(options);
  return cached("list", profile.locale, o, () => new Intl.ListFormat(profile.locale, o)).format(list);
}

export function formatRelativeTime(profile: LocaleProfile, value: unknown, unit: unknown, options?: unknown): string {
  const o = asOptions<Intl.RelativeTimeFormatOptions>(options);
  return cached("relative", profile.locale, o, () => new Intl.RelativeTimeFormat(profile.locale, o)).format(Number(value), String(unit) as Intl.RelativeTimeFormatUnit);
}

export function compare(profile: LocaleProfile, a: unknown, b: unknown, options?: unknown): number {
  const o = asOptions<Intl.CollatorOptions>(options);
  return cached("collator", profile.locale, o, () => new Intl.Collator(profile.locale, o)).compare(String(a ?? ""), String(b ?? ""));
}

export function pluralRules(profile: LocaleProfile, value: unknown, options?: unknown): string {
  const o = asOptions<Intl.PluralRulesOptions>(options);
  return cached("plural", profile.locale, o, () => new Intl.PluralRules(profile.locale, o)).select(Number(value));
}
