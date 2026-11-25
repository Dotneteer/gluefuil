// Dates and times as XMLUI writes them (step 26; design: .ai/plan/poc-26-dates.md).
// React-free and in the main chunk: the markup components normalize values
// with it before the lazy "dates" chunk loads. Mantine works with ISO strings
// (YYYY-MM-DD, HH:mm:ss); XMLUI's values are strings in `dateFormat`
// (DateInputReact.tsx 297) and HH:mm[:ss] or hh:mm[:ss] am (TimeInputReact.tsx 214–260).

/** XMLUI's date formats (DateInput.md `dateFormat`). */
export const DATE_FORMATS = ["MM/dd/yyyy", "MM-dd-yyyy", "yyyy/MM/dd", "yyyy-MM-dd", "dd/MM/yyyy", "dd-MM-yyyy", "yyyyMMdd", "MMddyyyy"] as const;
export const DEFAULT_DATE_FORMAT = "MM/dd/yyyy";

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

type Token = "yyyy" | "MM" | "dd";

/** The format's tokens in order and its separator ("" for yyyyMMdd). */
export function formatShape(format: unknown): { order: Token[]; separator: string } {
  const text = typeof format === "string" && (DATE_FORMATS as readonly string[]).includes(format) ? format : DEFAULT_DATE_FORMAT;
  const order = text.match(/yyyy|MM|dd/g) as Token[];
  const separator = text.replace(/yyyy|MM|dd/g, "").charAt(0);
  return { order, separator };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** Whether the parts are a real calendar date (not Feb 30). */
export function isRealDate({ year, month, day }: DateParts): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO `YYYY-MM-DD`. */
export const toIso = (parts: DateParts) => `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/**
 * A date written in `format` (or ISO `YYYY-MM-DD`, or a Date) → its parts;
 * undefined when it isn't a real date.
 */
export function parseDate(value: unknown, format?: unknown): DateParts | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  const { order, separator } = formatShape(format);
  const width: Record<Token, string> = separator === "" ? { yyyy: "(\\d{4})", MM: "(\\d{2})", dd: "(\\d{2})" } : { yyyy: "(\\d{4})", MM: "(\\d{1,2})", dd: "(\\d{1,2})" };
  const escaped = separator.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  const match = new RegExp(`^${order.map((t) => width[t]).join(escaped)}$`).exec(text);
  let parts: DateParts | undefined;
  if (match) {
    const values = Object.fromEntries(order.map((t, i) => [t, Number(match[i + 1])])) as Record<Token, number>;
    parts = { year: values.yyyy, month: values.MM, day: values.dd };
  } else {
    const iso = ISO_DATE.exec(text);
    if (iso) parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  return parts && isRealDate(parts) ? parts : undefined;
}

/** The parts written in `format`. */
export function formatDate(parts: DateParts, format?: unknown): string {
  const { order, separator } = formatShape(format);
  const text: Record<Token, string> = { yyyy: pad(parts.year, 4), MM: pad(parts.month, 2), dd: pad(parts.day, 2) };
  return order.map((t) => text[t]).join(separator);
}

/** A date value (in `format` or ISO) → ISO, or null. */
export function dateToIso(value: unknown, format?: unknown): string | null {
  const parts = parseDate(value, format);
  return parts ? toIso(parts) : null;
}

/** ISO → the value in `format`, or null. */
export function isoToDate(iso: string | null | undefined, format?: unknown): string | null {
  const parts = iso ? parseDate(iso) : undefined;
  return parts ? formatDate(parts, format) : null;
}

/** A day's ordinal (days since the epoch, UTC), for comparisons. */
export const dayOrdinal = ({ year, month, day }: DateParts) => Date.UTC(year, month - 1, day) / 86_400_000;
const fromOrdinal = (ordinal: number): DateParts => {
  const date = new Date(ordinal * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

/** Whether `iso` is within the limits (each in `format` or ISO; absent: open). */
export function withinLimits(iso: string, min: unknown, max: unknown, format?: unknown): boolean {
  const day = dayOrdinal(parseDate(iso)!);
  const low = parseDate(min, format);
  const high = parseDate(max, format);
  return (!low || day >= dayOrdinal(low)) && (!high || day <= dayOrdinal(high));
}

/**
 * XMLUI's `disabledDates` (DatePickerReact.tsx 657–700): a date, an array (any
 * matches), `true`, `{ from, to }` (inclusive), `{ before }`, `{ after }`,
 * `{ before, after }` (strictly between), `{ dayOfWeek }` (0 is Sunday).
 */
export function isDisabledDate(iso: string, matcher: unknown, format?: unknown): boolean {
  if (matcher === undefined || matcher === null || matcher === false) return false;
  if (matcher === true) return true;
  const parts = parseDate(iso);
  if (!parts) return false;
  const day = dayOrdinal(parts);
  const ordinal = (value: unknown) => {
    const p = parseDate(value, format);
    return p ? dayOrdinal(p) : undefined;
  };
  if (Array.isArray(matcher)) return matcher.some((m) => isDisabledDate(iso, m, format));
  if (typeof matcher === "string" || matcher instanceof Date) return ordinal(matcher) === day;
  if (typeof matcher !== "object") return false;
  const m = matcher as Record<string, unknown>;
  if ("dayOfWeek" in m) {
    const days = Array.isArray(m.dayOfWeek) ? m.dayOfWeek : [m.dayOfWeek];
    return days.map(Number).includes(new Date(day * 86_400_000).getUTCDay());
  }
  const before = "before" in m ? ordinal(m.before) : undefined;
  const after = "after" in m ? ordinal(m.after) : undefined;
  if (before !== undefined && after !== undefined) return day > after && day < before;
  if (before !== undefined) return day < before;
  if (after !== undefined) return day > after;
  if ("from" in m) {
    const from = ordinal(m.from);
    const to = ordinal(m.to);
    if (from === undefined) return false;
    return to === undefined ? day === from : day >= from && day <= to;
  }
  return false;
}

// --- Range presets (XMLUI DatePickerReact.tsx 160–200, zag.js date-utils preset.ts) ------------

export const PRESET_LABELS = {
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisQuarter: "This quarter",
  lastQuarter: "Last quarter",
  thisYear: "This year",
  lastYear: "Last year",
  last3Days: "Last 3 days",
  last7Days: "Last 7 days",
  last14Days: "Last 14 days",
  last30Days: "Last 30 days",
  last90Days: "Last 90 days",
} as const;
export type PresetKey = keyof typeof PRESET_LABELS;
const DEFAULT_PRESETS: PresetKey[] = ["last7Days", "last30Days", "thisMonth", "lastMonth"];

/** A preset key, also written with spaces or dashes ("last 7 days"). */
function presetKey(raw: unknown): PresetKey | undefined {
  if (typeof raw !== "string") return undefined;
  const compact = raw.trim().replace(/[-_\s]+/g, "").toLowerCase();
  return (Object.keys(PRESET_LABELS) as PresetKey[]).find((key) => key.toLowerCase() === compact);
}

const startOfMonth = (p: DateParts): DateParts => ({ ...p, day: 1 });
const endOfMonth = (p: DateParts): DateParts => ({ ...p, day: new Date(Date.UTC(p.year, p.month, 0)).getUTCDate() });
const addMonths = (p: DateParts, months: number): DateParts => {
  const index = p.year * 12 + (p.month - 1) + months;
  const moved = { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
  return { ...moved, day: Math.min(p.day, endOfMonth(moved).day) };
};

/** A preset's [from, to] as ISO strings, relative to `today` (ISO). */
export function presetRange(key: PresetKey, today: string, weekStartsOn = 0): [string, string] {
  const t = parseDate(today)!;
  const day = dayOrdinal(t);
  const iso = (p: DateParts) => toIso(p);
  const back = (n: number): [string, string] => [iso(fromOrdinal(day - n)), today];
  const weekStart = day - ((new Date(day * 86_400_000).getUTCDay() - weekStartsOn + 7) % 7);
  const quarterStart = addMonths(startOfMonth(t), -((t.month - 1) % 3));
  switch (key) {
    case "thisWeek":
      return [iso(fromOrdinal(weekStart)), iso(fromOrdinal(weekStart + 6))];
    case "lastWeek":
      return [iso(fromOrdinal(weekStart - 7)), iso(fromOrdinal(weekStart - 1))];
    case "thisMonth":
      return [iso(startOfMonth(t)), today];
    case "lastMonth": {
      const last = addMonths(startOfMonth(t), -1);
      return [iso(last), iso(endOfMonth(last))];
    }
    case "thisQuarter":
      return [iso(quarterStart), today];
    case "lastQuarter":
      return [iso(addMonths(quarterStart, -3)), iso(endOfMonth(addMonths(quarterStart, -1)))];
    case "thisYear":
      return [iso({ year: t.year, month: 1, day: 1 }), today];
    case "lastYear":
      return [iso({ year: t.year - 1, month: 1, day: 1 }), iso({ year: t.year - 1, month: 12, day: 31 })];
    case "last3Days":
      return back(2);
    case "last7Days":
      return back(6);
    case "last14Days":
      return back(13);
    case "last30Days":
      return back(29);
    case "last90Days":
      return back(89);
  }
}

export interface ResolvedPreset {
  label: string;
  value: [string, string];
}

/**
 * XMLUI's `showPresets` / `presets` (range mode only): off by default; a list
 * turns them on. Items: preset keys (a comma-separated string or an array),
 * `{ value, label }` (relabels a key), `{ label, from, to }` (a custom range).
 */
export function resolvePresets(presets: unknown, showPresets: unknown, today: string, format?: unknown, weekStartsOn = 0): ResolvedPreset[] {
  const off = (v: unknown) => v === false || v === "false";
  if (off(showPresets) || off(presets)) return [];
  const list = Array.isArray(presets)
    ? presets
    : typeof presets === "string" && presets.trim() !== ""
      ? presets.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
  if (!list && !(showPresets === true || showPresets === "true")) return [];
  const resolved: ResolvedPreset[] = [];
  for (const item of list ?? DEFAULT_PRESETS) {
    if (item !== null && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (o.from !== undefined && o.to !== undefined) {
        const from = dateToIso(o.from, format);
        const to = dateToIso(o.to, format);
        if (from && to) resolved.push({ label: typeof o.label === "string" ? o.label : `${isoToDate(from, format)} – ${isoToDate(to, format)}`, value: [from, to] });
        continue;
      }
      const key = presetKey(o.value);
      if (key) resolved.push({ label: typeof o.label === "string" ? o.label : PRESET_LABELS[key], value: presetRange(key, today, weekStartsOn) });
      continue;
    }
    const key = presetKey(item);
    if (key) resolved.push({ label: PRESET_LABELS[key], value: presetRange(key, today, weekStartsOn) });
  }
  return resolved.length > 0 ? resolved : DEFAULT_PRESETS.map((key) => ({ label: PRESET_LABELS[key], value: presetRange(key, today, weekStartsOn) }));
}

/** Today as ISO, in the local time zone. */
export function todayIso(now = new Date()): string {
  return toIso({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

// --- Times ----------------------------------------------------------------------------------------

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([aApP])\.?[mM]\.?)?$/;

/** `HH:mm[:ss]` (24-hour) or `hh:mm[:ss] am|pm` → parts; undefined when invalid. */
export function parseTime(value: unknown): TimeParts | undefined {
  if (typeof value !== "string") return undefined;
  const match = TIME.exec(value.trim());
  if (!match) return undefined;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return undefined;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  return { hours, minutes, seconds };
}

/** Parts → 24-hour `HH:mm:ss` (Mantine's value, `isoValue()`). */
export const timeToIso = (t: TimeParts) => `${pad(t.hours, 2)}:${pad(t.minutes, 2)}:${pad(t.seconds, 2)}`;

/** Parts → XMLUI's value: `HH:mm[:ss]`, or `hh:mm[:ss] am|pm` when not 24-hour. */
export function formatTime(t: TimeParts, hour24: boolean, seconds: boolean): string {
  const tail = seconds ? `:${pad(t.seconds, 2)}` : "";
  if (hour24) return `${pad(t.hours, 2)}:${pad(t.minutes, 2)}${tail}`;
  const hour12 = t.hours % 12 === 0 ? 12 : t.hours % 12;
  return `${pad(hour12, 2)}:${pad(t.minutes, 2)}${tail} ${t.hours < 12 ? "am" : "pm"}`;
}

/** Seconds since midnight, for comparisons. */
export const timeSeconds = (t: TimeParts) => t.hours * 3600 + t.minutes * 60 + t.seconds;
