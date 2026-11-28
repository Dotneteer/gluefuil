// Typed values (step 30, .ai/plan/poc-30-table.md decision 4): the `type` of a
// Table Column and of the Value component. React-free; tested in tables
// (tests/value-types.test.ts). A port of XMLUI's
// xmlui/src/components/Value/value-types.ts (the type syntax) and
// value-formatting.ts (the render model), without its locale profiles: numbers
// and dates use `typeOptions.locale` or the browser's locale until step 34.
//
//   "currency(EUR)" + typeOptions ─ normalizeValueType ─ { name, args, options }
//   value + normalized type ─ formatValue ─ a render model (text, number parts, link, …)

export const VALUE_TYPE_NAMES = [
  "text", "short-text", "long-text", "markdown", "code", "json", "email", "phone", "url", "uuid", "id", "name",
  "address", "color", "number", "integer", "decimal", "percent", "currency", "accounting", "scientific", "bytes",
  "duration", "rating", "date", "time", "datetime", "relative-time", "timestamp", "iso-date", "boolean", "checkbox",
  "switch", "yes-no", "status", "enum", "tag", "tags", "image", "avatar", "icon", "link", "object", "array", "list",
] as const;

export type ValueTypeName = (typeof VALUE_TYPE_NAMES)[number];

/** Where a type came from: written, inferred from the data (Table), or the fallback after a problem. */
export type ValueTypeSource = "explicit" | "inferred" | "fallback";

export interface NormalizedValueType {
  name: ValueTypeName;
  args?: unknown[];
  options?: Record<string, unknown>;
  source: ValueTypeSource;
}

export interface ValueTypeProblem {
  code: "empty-type" | "invalid-type-value" | "unknown-type" | "malformed-arguments" | "unsupported-arguments" | "invalid-argument" | "invalid-type-options";
  message: string;
}

/** Types the Table renders as controls (`willChange`, `didChange`). */
export const INTERACTIVE_TYPES: ReadonlySet<ValueTypeName> = new Set(["checkbox", "switch", "color"]);
/** Types aligned to the end of their cell (XMLUI TableReact.tsx 384–395). */
export const END_ALIGNED_TYPES: ReadonlySet<ValueTypeName> = new Set(["number", "integer", "decimal", "percent", "currency", "accounting", "scientific", "bytes", "duration", "rating"]);

const NAMES = new Set<string>(VALUE_TYPE_NAMES);
const DATE_STYLES = new Set(["short", "medium", "long", "full"]);

export const isValueTypeName = (value: string): value is ValueTypeName => NAMES.has(value);

type Argument = { kind: "positional"; value: unknown } | { kind: "named"; name: string; value: unknown };

/** A type string (`currency(EUR)`, `url(label:domain)`) and its `typeOptions` as one type; problems fall back to `text`. */
export function normalizeValueType(rawType: unknown, rawOptions?: unknown, source: Exclude<ValueTypeSource, "fallback"> = "explicit"): { type: NormalizedValueType; problems: ValueTypeProblem[] } {
  const problems: ValueTypeProblem[] = [];
  let typeOptions: Record<string, unknown> | undefined;
  if (rawOptions !== undefined && rawOptions !== null) {
    if (typeof rawOptions !== "object" || Array.isArray(rawOptions) || rawOptions instanceof Date) {
      problems.push({ code: "invalid-type-options", message: "typeOptions must be an object." });
    } else typeOptions = { ...(rawOptions as Record<string, unknown>) };
  }
  const fallback = (): NormalizedValueType => ({ name: "text", source: "fallback", ...(typeOptions ? { options: typeOptions } : {}) });
  if (rawType === undefined || rawType === null) return { type: fallback(), problems };
  if (typeof rawType !== "string") {
    problems.push({ code: "invalid-type-value", message: "A value type must be a string." });
    return { type: fallback(), problems };
  }
  const text = rawType.trim();
  if (text === "") {
    problems.push({ code: "empty-type", message: "A value type can't be empty." });
    return { type: fallback(), problems };
  }
  const parsed = parseTypeExpression(text);
  if (!parsed.ok) {
    problems.push({ code: "malformed-arguments", message: parsed.message });
    return { type: fallback(), problems };
  }
  const name = parsed.name.toLowerCase();
  if (!isValueTypeName(name)) {
    problems.push({ code: "unknown-type", message: `Unknown value type '${parsed.name}'.` });
    return { type: fallback(), problems };
  }
  const args = normalizeArguments(name, parsed.args);
  problems.push(...args.problems);
  if (args.fallback) return { type: fallback(), problems };
  const options = { ...args.options, ...typeOptions };
  return {
    type: { name, source, ...(args.args.length > 0 ? { args: args.args } : {}), ...(Object.keys(options).length > 0 ? { options } : {}) },
    problems,
  };
}

function parseTypeExpression(input: string): { ok: true; name: string; args: Argument[] } | { ok: false; message: string } {
  const match = /^([A-Za-z][A-Za-z0-9-]*)(?:\((.*)\))?$/.exec(input);
  if (!match) return { ok: false, message: "A value type has the form 'name' or 'name(arguments)'." };
  const [, name, raw] = match;
  if (raw === undefined) return { ok: true, name: name!, args: [] };
  if (raw.trim() === "") return { ok: false, message: "A value type's argument list can't be empty." };
  if (/[()]/.test(raw)) return { ok: false, message: "A value type's arguments can't contain parentheses." };
  const parts = raw.split(",");
  if (parts.some((part) => part.trim() === "")) return { ok: false, message: "A value type's arguments can't be empty." };
  const args: Argument[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const colon = trimmed.indexOf(":");
    if (colon >= 0) {
      const argName = trimmed.slice(0, colon).trim();
      const argValue = trimmed.slice(colon + 1).trim();
      if (!/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(argName) || !argValue) return { ok: false, message: `Invalid named argument '${trimmed}'.` };
      args.push({ kind: "named", name: argName, value: argumentValue(argValue) });
    } else args.push({ kind: "positional", value: argumentValue(trimmed) });
  }
  if (args.some((a) => a.kind === "named") && args.some((a) => a.kind === "positional")) {
    return { ok: false, message: "A value type's arguments can't mix positional and named ones." };
  }
  return { ok: true, name: name!, args };
}

function argumentValue(raw: string): unknown {
  const quoted = /^(['"])(.*)\1$/.exec(raw);
  if (quoted) return quoted[2];
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

const nonNegativeInteger = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined);

function normalizeArguments(name: ValueTypeName, args: Argument[]): { args: unknown[]; options: Record<string, unknown>; problems: ValueTypeProblem[]; fallback: boolean } {
  const problems: ValueTypeProblem[] = [];
  const options: Record<string, unknown> = {};
  if (args.length === 0) return { args: [], options, problems, fallback: false };
  if (args.every((a) => a.kind === "named")) {
    for (const arg of args) {
      if (arg.kind !== "named") continue;
      if (Object.hasOwn(options, arg.name)) problems.push({ code: "invalid-argument", message: `Duplicate value type argument '${arg.name}'.` });
      else options[arg.name] = arg.value;
    }
    return { args: [], options, problems, fallback: false };
  }
  const values = args.map((a) => a.value);
  const fail = (message: string) => ({ args: [], options: {}, problems: [...problems, { code: "invalid-argument" as const, message }], fallback: true });
  const count = `Invalid argument count for value type '${name}'.`;
  switch (name) {
    case "number": {
      if (values.length !== 2) return fail(count);
      const precision = nonNegativeInteger(values[0]);
      const scale = nonNegativeInteger(values[1]);
      if (!precision || scale === undefined || scale > precision) return fail("number(p,s) expects a positive integer precision and a non-negative integer scale no larger than it.");
      return { args: [precision, scale], options: { precision, scale }, problems, fallback: false };
    }
    case "decimal": {
      if (values.length !== 1) return fail(count);
      const scale = nonNegativeInteger(values[0]);
      if (scale === undefined) return fail("decimal(s) expects a non-negative integer scale.");
      return { args: [scale], options: { scale }, problems, fallback: false };
    }
    case "currency":
    case "accounting": {
      if (values.length !== 1 || typeof values[0] !== "string") return fail(count);
      const currency = values[0].toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return fail(`${name}(code) expects a three-letter currency code.`);
      return { args: [currency], options: { currency }, problems, fallback: false };
    }
    case "rating": {
      if (values.length !== 1) return fail(count);
      const max = values[0];
      if (typeof max !== "number" || !Number.isFinite(max) || max <= 0) return fail("rating(max) expects a positive number.");
      return { args: [max], options: { max }, problems, fallback: false };
    }
    case "date":
    case "time":
    case "datetime": {
      if (values.length !== 1 || typeof values[0] !== "string") return fail(count);
      const style = values[0].toLowerCase();
      if (!DATE_STYLES.has(style)) return fail(`${name}(style) expects one of: short, medium, long, full.`);
      return { args: [style], options: { style }, problems, fallback: false };
    }
    case "id": {
      if (values.length !== 1 || typeof values[0] !== "string") return fail(count);
      const mode = values[0].toLowerCase();
      if (mode !== "short" && mode !== "full") return fail("id(mode) expects 'short' or 'full'.");
      return { args: [mode], options: { mode }, problems, fallback: false };
    }
    default:
      return { args: [], options: {}, problems: [...problems, { code: "unsupported-arguments", message: `Value type '${name}' takes no positional arguments.` }], fallback: true };
  }
}

// --- Formatting ------------------------------------------------------------------------------

export type ValueRenderModel =
  | { kind: "empty"; text: "" }
  | {
      kind: "text" | "short-text" | "long-text" | "markdown" | "code" | "json" | "boolean" | "checkbox" | "switch" | "yes-no" | "date" | "tag" | "tags" | "id" | "uuid" | "name" | "address" | "duration" | "rating" | "status" | "enum" | "list";
      text: string;
    }
  | { kind: "color"; text: string; color: string }
  | { kind: "image" | "avatar"; text: string; src: string; alt: string }
  | { kind: "icon"; text: string; iconName: string }
  | { kind: "number"; text: string; integerPart: string; decimalSeparator?: string; fractionPart?: string; suffixPart?: string }
  | { kind: "link"; text: string; href: string };

const stringOption = (type: NormalizedValueType, key: string) => (typeof type.options?.[key] === "string" ? (type.options[key] as string) : undefined);
const numberOption = (type: NormalizedValueType, key: string) => {
  const value = type.options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/** A value as its render model for a type (XMLUI value-formatting.ts). `now` is for relative times (tests). */
export function formatValue(value: unknown, type: NormalizedValueType, options: { now?: Date; locale?: string } = {}): ValueRenderModel {
  // Step 34: typeOptions.locale, else the active (or nearest Locale's) locale.
  const locale = stringOption(type, "locale") ?? options.locale;
  if (value === null || value === undefined) return type.name === "json" ? { kind: "json", text: "null" } : { kind: "empty", text: "" };
  switch (type.name) {
    case "text":
    case "short-text":
    case "long-text":
    case "markdown":
    case "code":
    case "uuid":
    case "name":
    case "address":
      return { kind: type.name, text: String(value) };
    case "id": {
      const text = String(value);
      return { kind: "id", text: type.options?.mode === "full" || text.length <= 12 ? text : `${text.slice(0, 8)}...` };
    }
    case "number":
    case "integer":
    case "decimal":
    case "percent":
    case "currency":
    case "accounting":
    case "scientific":
      return formatNumber(value, type, locale);
    case "rating": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return { kind: "text", text: String(value) };
      return { kind: "rating", text: `${new Intl.NumberFormat(locale).format(n)} / ${numberOption(type, "max") ?? 5}` };
    }
    case "boolean":
      return { kind: "boolean", text: value ? "true" : "false" };
    case "checkbox":
      return { kind: "checkbox", text: value ? "✓" : "" };
    case "switch":
      return { kind: "switch", text: value ? "true" : "false" };
    case "yes-no":
      return { kind: "yes-no", text: value ? "Yes" : "No" };
    case "date":
    case "time":
    case "datetime":
    case "timestamp":
    case "iso-date":
      return formatDate(value, type, locale);
    case "relative-time":
      return formatRelative(value, locale, options.now ?? new Date());
    case "email":
      return { kind: "link", text: String(value), href: `mailto:${String(value)}` };
    case "phone":
      return { kind: "link", text: String(value), href: `tel:${String(value)}` };
    case "url":
    case "link": {
      const href = String(value);
      return { kind: "link", text: urlLabel(href, type), href };
    }
    case "enum":
    case "status":
      return { kind: type.name, text: mappedLabel(value, type) };
    case "json":
    case "object":
    case "array":
      return { kind: "json", text: safeJson(value) };
    case "tag":
      return { kind: "tag", text: String(value) };
    case "tags":
    case "list":
      return { kind: type.name, text: Array.isArray(value) ? value.map(String).join(", ") : String(value) };
    case "bytes":
      return formatBytes(value, locale);
    case "duration":
      return { kind: "duration", text: formatDuration(value) };
    case "color":
      return { kind: "color", text: String(value), color: String(value) };
    case "image":
    case "avatar": {
      const src = String(value);
      return { kind: type.name, text: src, src, alt: stringOption(type, "alt") ?? stringOption(type, "label") ?? src };
    }
    case "icon":
      return { kind: "icon", text: String(value), iconName: String(value) };
    default:
      return { kind: "text", text: String(value) };
  }
}

function formatNumber(value: unknown, type: NormalizedValueType, locale: string | undefined): ValueRenderModel {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return { kind: "text", text: String(value) };
  const intl: Intl.NumberFormatOptions = {};
  if (type.name === "integer") intl.maximumFractionDigits = 0;
  const scale = numberOption(type, "scale");
  if (type.name === "decimal" && scale !== undefined) {
    intl.minimumFractionDigits = scale;
    intl.maximumFractionDigits = scale;
  }
  if (type.name === "number" && scale !== undefined) intl.maximumFractionDigits = scale;
  if (type.name === "percent") intl.style = "percent";
  if (type.name === "currency" || type.name === "accounting") {
    intl.style = "currency";
    intl.currency = stringOption(type, "currency") ?? "USD";
    if (type.name === "accounting") intl.currencySign = "accounting";
  }
  if (type.name === "scientific") intl.notation = "scientific";
  const parts = new Intl.NumberFormat(locale, intl).formatToParts(n);
  return { kind: "number", text: parts.map((p) => p.value).join(""), ...numberParts(parts) };
}

/** The integer part, the decimal separator, the fraction and a suffix: the cell lines decimals up. */
function numberParts(parts: Intl.NumberFormatPart[]): { integerPart: string; decimalSeparator?: string; fractionPart?: string; suffixPart?: string } {
  const decimal = parts.findIndex((p) => p.type === "decimal");
  if (decimal < 0) return { integerPart: parts.map((p) => p.value).join("") };
  const lastFraction = parts.map((p) => p.type).lastIndexOf("fraction");
  const suffix = parts.slice(lastFraction + 1).map((p) => p.value).join("");
  return {
    integerPart: parts.slice(0, decimal).map((p) => p.value).join(""),
    decimalSeparator: parts[decimal]!.value,
    fractionPart: parts.filter((p) => p.type === "fraction").map((p) => p.value).join(""),
    ...(suffix ? { suffixPart: suffix } : {}),
  };
}

function toDate(value: unknown): Date | undefined {
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDate(value: unknown, type: NormalizedValueType, locale: string | undefined): ValueRenderModel {
  const date = toDate(value);
  if (!date) return { kind: "text", text: String(value) };
  if (type.name === "iso-date") return { kind: "date", text: date.toISOString().slice(0, 10) };
  if (type.name === "timestamp") return { kind: "date", text: String(date.getTime()) };
  const style = stringOption(type, "style") as Intl.DateTimeFormatOptions["dateStyle"];
  const intl: Intl.DateTimeFormatOptions =
    type.name === "time" ? { timeStyle: style || "short" } : type.name === "datetime" ? { dateStyle: style || "short", timeStyle: style || "short" } : { dateStyle: style || "medium" };
  return { kind: "date", text: new Intl.DateTimeFormat(locale, intl).format(date) };
}

function formatRelative(value: unknown, locale: string | undefined, now: Date): ValueRenderModel {
  const date = toDate(value);
  if (!date) return { kind: "text", text: String(value) };
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  const [unit, size] = units.find(([, s]) => Math.abs(seconds) >= s) ?? units[units.length - 1]!;
  return { kind: "date", text: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(seconds / size), unit) };
}

function formatBytes(value: unknown, locale: string | undefined): ValueRenderModel {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return { kind: "text", text: String(value) };
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  let scaled = n;
  while (Math.abs(scaled) >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit++;
  }
  const integerPart = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(scaled);
  return { kind: "number", text: `${integerPart} ${units[unit]}`, integerPart, suffixPart: ` ${units[unit]}` };
}

function formatDuration(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const total = Math.max(0, Math.round(n));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : "", s || (!h && !m) ? `${s}s` : ""].filter(Boolean).join(" ");
}

function mappedLabel(value: unknown, type: NormalizedValueType): string {
  const options = type.options ?? {};
  const map = (options.values ?? options.map ?? options) as unknown;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    const mapped = (map as Record<string, unknown>)[String(value)];
    if (typeof mapped === "string") return mapped;
    if (mapped && typeof mapped === "object" && typeof (mapped as { label?: unknown }).label === "string") return (mapped as { label: string }).label;
  }
  return String(value);
}

function urlLabel(href: string, type: NormalizedValueType): string {
  if (type.options?.label === "domain") {
    try {
      return new URL(href).hostname;
    } catch {
      return href;
    }
  }
  return typeof type.options?.label === "string" ? type.options.label : href;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** `maxLines` or `lines` of a long text (a positive integer), for the line clamp. */
export function clampLines(type: NormalizedValueType): number | undefined {
  for (const key of ["maxLines", "lines"]) {
    const v = type.options?.[key];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  }
  return undefined;
}

/** `**bold**` and `*italic*` of the `markdown` type, as parts (XMLUI ValueReact.tsx renderInlineMarkdown). */
export function inlineMarkdown(text: string): { text: string; style?: "strong" | "em" }[] {
  const parts: { text: string; style?: "strong" | "em" }[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push(match[2] !== undefined ? { text: match[2], style: "strong" } : { text: match[3]!, style: "em" });
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
