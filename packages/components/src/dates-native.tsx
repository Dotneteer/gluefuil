import { useLocaleProfile } from "@gluefuil/runtime";
// The date and time inputs' Mantine parts (step 26; design: .ai/plan/poc-26-dates.md):
// a lazy chunk, loaded by dates.tsx when a DateInput, TimeInput or DatePicker
// first renders. Mantine (@mantine/dates) works with ISO strings; these
// components take and give XMLUI's values (date-format.ts).
import { CloseButton, Input, Popover } from "@mantine/core";
import { DatePicker as MantineDatePicker, MaskedDateInput, TimePicker } from "@mantine/dates";
import { createElement, useMemo, useState, type ComponentType, type FocusEvent, type ReactNode, type Ref } from "react";
import {
  dateToIso,
  formatShape,
  formatTime,
  isDisabledDate,
  isoToDate,
  parseTime,
  resolvePresets,
  timeSeconds,
  timeToIso,
  todayIso,
  withinLimits,
} from "./date-format";
import { section } from "./inputs";

/** `startText`, `startIcon`, `endText`, `endIcon` → Mantine's sections (step 24's adornments). */
function adornments(props: DatesCommon) {
  const start = section(props.startIcon, props.startText);
  const end = section(props.endIcon, props.endText);
  return {
    ...(start ? { leftSection: start.node, leftSectionWidth: start.width, leftSectionPointerEvents: "none" } : {}),
    ...(end ? { rightSection: end.node, rightSectionWidth: end.width, rightSectionPointerEvents: "none" } : {}),
  };
}

const loose = (component: unknown) => component as ComponentType<Record<string, unknown>>;
const isTrue = (value: unknown) => value === true || value === "true";
const text = (value: unknown) => (value === undefined || value === null || value === "" ? undefined : String(value));

/** What every date and time native gets from its markup wrapper (dates.tsx). */
export interface DatesCommon {
  value?: unknown;
  onChange?: (value: unknown) => void;
  $$initial?: unknown;
  label?: unknown;
  disabled?: boolean;
  readOnly?: unknown;
  autoFocus?: unknown;
  error?: unknown;
  wrapperProps?: Record<string, unknown>;
  clearable?: unknown;
  clearToInitialValue?: unknown;
  emptyCharacter?: unknown;
  startText?: unknown;
  startIcon?: unknown;
  endText?: unknown;
  endIcon?: unknown;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  style?: Record<string, unknown>;
  ref?: Ref<HTMLElement>;
}

/** Its own label looks like the label behavior's and gets the required mark in a form (step 25). */
const LABEL_PROPS = { className: "gfui-Label-text" };

/** The placeholder of a field: `emptyCharacter` (its first character, default "-") repeated. */
const empty = (character: unknown, width: number) => (typeof character === "string" && character !== "" ? character.charAt(0) : "-").repeat(width);

/**
 * gotFocus / lostFocus for a group of fields: only when the focus enters or
 * leaves the group, not while it moves between its fields.
 */
function groupFocus(props: DatesCommon) {
  return {
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onFocus?.();
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onBlur?.();
    },
  };
}

/** The value after a clear: the initial value with `clearToInitialValue`, else `empty`. */
const cleared = (props: DatesCommon, emptyValue: unknown) => (isTrue(props.clearToInitialValue) ? (props.$$initial ?? emptyValue) : emptyValue);

// --- DateInput -------------------------------------------------------------------------------------

export interface DateInputNativeProps extends DatesCommon {
  dateFormat?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
}

const FIELD = { yyyy: "year", MM: "month", dd: "day" } as const;

/** focus() goes to the first field of the format. */
const fieldRefs = (first: keyof typeof FIELD, ref: Ref<HTMLElement> | undefined) => (ref ? { [`${FIELD[first]}Ref`]: ref } : {});

/** DateInput: day, month and year fields (Mantine MaskedDateInput); the value is a string in `dateFormat`, or null. */
export function DateInputNative(props: DateInputNativeProps) {
  const format = props.dateFormat;
  const { order, separator } = formatShape(format);
  const [outOfRange, setOutOfRange] = useState(false);
  const autoFocus = isTrue(props.autoFocus) ? { autoFocus: true } : undefined;
  return createElement(loose(MaskedDateInput), {
    label: text(props.label),
    labelProps: LABEL_PROPS,
    className: props.className,
    style: props.style,
    value: dateToIso(props.value, format),
    onChange: (next: string | null) => {
      const date = next ? next.slice(0, 10) : null;
      if (date && !withinLimits(date, props.minValue, props.maxValue, format)) {
        setOutOfRange(true);
        props.onChange?.(null);
        return;
      }
      setOutOfRange(false);
      props.onChange?.(date ? isoToDate(date, format) : cleared(props, null));
    },
    fieldsOrder: order.map((t) => FIELD[t]),
    dateSeparator: separator,
    withDropdown: false,
    clearable: isTrue(props.clearable),
    readOnly: isTrue(props.readOnly),
    disabled: props.disabled,
    error: props.error || outOfRange,
    wrapperProps: props.wrapperProps,
    ...adornments(props),
    ...fieldRefs(order[0]!, props.ref),
    dayPlaceholder: empty(props.emptyCharacter, 2),
    monthPlaceholder: empty(props.emptyCharacter, 2),
    yearPlaceholder: empty(props.emptyCharacter, 4),
    [`${FIELD[order[0]!]}InputProps`]: autoFocus,
    // Mantine calls them when the focus enters or leaves the fields (not between them).
    onFocus: props.onFocus,
    onBlur: props.onBlur,
  });
}

// --- TimeInput -------------------------------------------------------------------------------------

export interface TimeInputNativeProps extends DatesCommon {
  hour24?: unknown;
  seconds?: unknown;
  minTime?: unknown;
  maxTime?: unknown;
  onInvalidTime?: (value: string) => void;
}

/** TimeInput: hour, minute (second) fields and AM/PM (Mantine TimePicker); XMLUI's time strings. */
export function TimeInputNative(props: TimeInputNativeProps) {
  const hour24 = props.hour24 === undefined || !(props.hour24 === false || props.hour24 === "false");
  const seconds = isTrue(props.seconds);
  const parsed = parseTime(props.value);
  const min = parseTime(props.minTime);
  const max = parseTime(props.maxTime);
  return createElement(loose(TimePicker), {
    label: text(props.label),
    labelProps: LABEL_PROPS,
    className: props.className,
    style: props.style,
    value: parsed ? timeToIso(parsed).slice(0, seconds ? 8 : 5) : "",
    onChange: (next: string) => {
      const time = parseTime(next);
      if (!time) {
        if (next === "") props.onChange?.(cleared(props, null));
        return;
      }
      const value = formatTime(time, hour24, seconds);
      // Mantine clamps to min/max on blur; a typed time outside them is invalid first (XMLUI invalidTime).
      if ((min && timeSeconds(time) < timeSeconds(min)) || (max && timeSeconds(time) > timeSeconds(max))) props.onInvalidTime?.(value);
      props.onChange?.(value);
    },
    format: hour24 ? "24h" : "12h",
    withSeconds: seconds,
    min: min ? timeToIso(min) : undefined,
    max: max ? timeToIso(max) : undefined,
    clearable: isTrue(props.clearable),
    readOnly: isTrue(props.readOnly),
    disabled: props.disabled,
    error: props.error,
    wrapperProps: props.wrapperProps,
    ...adornments(props),
    hoursRef: props.ref,
    hoursInputProps: isTrue(props.autoFocus) ? { autoFocus: true } : undefined,
    hoursPlaceholder: empty(props.emptyCharacter, 2),
    minutesPlaceholder: empty(props.emptyCharacter, 2),
    secondsPlaceholder: empty(props.emptyCharacter, 2),
    onFocus: props.onFocus,
    onBlur: props.onBlur,
  });
}

// --- DatePicker ------------------------------------------------------------------------------------

export interface DatePickerNativeProps extends DatesCommon {
  mode?: unknown;
  dateFormat?: unknown;
  inline?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  disabledDates?: unknown;
  weekStartsOn?: unknown;
  showWeekNumber?: unknown;
  showWeekNumbers?: unknown;
  numOfMonths?: unknown;
  locale?: unknown;
  presets?: unknown;
  showPresets?: unknown;
}

type Range = [string | null, string | null];

/** Calendar labels from Intl in `locale` (no dayjs locale files). */
function labelFormats(locale: string) {
  const make = (options: Intl.DateTimeFormatOptions) => {
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    } catch {
      formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    }
    return (iso: string) => formatter.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
  };
  return {
    monthLabelFormat: make({ month: "long", year: "numeric" }),
    yearLabelFormat: make({ year: "numeric" }),
    monthsListFormat: make({ month: "short" }),
    weekdayFormat: make({ weekday: "short" }),
    getDayAriaLabel: make({ day: "numeric", month: "long", year: "numeric" }),
  };
}

/** DatePicker: Mantine's calendar, inline or in a popup under typed date fields; XMLUI's values. */
export function DatePickerNative(props: DatePickerNativeProps) {
  const format = props.dateFormat;
  const range = props.mode === "range";
  const inline = isTrue(props.inline);
  const readOnly = isTrue(props.readOnly);
  // Step 34: the prop, else the active (or nearest Locale's) locale.
  const active = useLocaleProfile().locale;
  const locale = typeof props.locale === "string" && props.locale !== "" ? props.locale : active;
  const weekStartsOn = Number(props.weekStartsOn ?? 0) % 7;
  const [opened, setOpened] = useState(false);
  // A range shows its first click before it is a value (XMLUI publishes complete ranges only).
  const [pending, setPending] = useState<Range | null>(null);

  const committed: string | null | Range = range
    ? (() => {
        const v = props.value as { from?: unknown; to?: unknown } | undefined | null;
        return [dateToIso(v?.from, format), dateToIso(v?.to, format)] as Range;
      })()
    : dateToIso(props.value, format);
  const shown = range ? (pending ?? committed) : committed;
  const emptyValue = undefined;

  const publish = (next: string | null | Range) => {
    if (!range) {
      props.onChange?.(next ? isoToDate(next as string, format) : cleared(props, emptyValue));
      return;
    }
    const [from, to] = next as Range;
    if (from && to) {
      setPending(null);
      props.onChange?.({ from: isoToDate(from, format), to: isoToDate(to, format) });
    } else if (!from && !to) {
      setPending(null);
      props.onChange?.(cleared(props, emptyValue));
    } else setPending([from, to]);
  };

  const today = todayIso();
  const presets = useMemo(
    () => (range ? resolvePresets(props.presets, props.showPresets, today, format, weekStartsOn) : []),
    [range, props.presets, props.showPresets, today, format, weekStartsOn],
  );
  const calendar = createElement(loose(MantineDatePicker), {
    type: range ? "range" : "default",
    value: shown,
    onChange: (next: string | null | Range) => {
      if (readOnly) return;
      publish(next);
      if (!range || ((next as Range)[0] && (next as Range)[1])) setOpened(false);
    },
    minDate: dateToIso(props.startDate, format) ?? undefined,
    maxDate: dateToIso(props.endDate, format) ?? undefined,
    excludeDate: props.disabledDates === undefined ? undefined : (iso: string) => isDisabledDate(iso, props.disabledDates, format),
    firstDayOfWeek: weekStartsOn,
    withWeekNumbers: isTrue(props.showWeekNumber) || isTrue(props.showWeekNumbers),
    numberOfColumns: Math.max(1, Number(props.numOfMonths ?? (range && !inline ? 2 : 1)) || 1),
    allowSingleDateInRange: true,
    // The month the calendar opens on: the value's (Mantine: today's).
    defaultDate: (range ? (committed as Range)[0] : (committed as string | null)) ?? undefined,
    // No weekend colors (XMLUI has none).
    weekendDays: [],
    ...(presets.length > 0 ? { presets } : {}),
    ...labelFormats(locale),
    className: "gfui-DatePicker-calendar",
  });

  if (inline) {
    return createElement(
      loose(Input.Wrapper),
      { label: text(props.label), labelProps: LABEL_PROPS, className: props.className, style: props.style, error: undefined, wrapperProps: props.wrapperProps },
      <div className="gfui-DatePicker-inline" data-error={props.error ? "true" : undefined} data-readonly={readOnly || undefined} {...groupFocus(props)} tabIndex={-1} ref={props.ref as Ref<HTMLDivElement>}>
        {calendar}
      </div>,
    );
  }

  // The typed fields: one, or "from" and "to".
  const { order, separator } = formatShape(format);
  const field = (index: number, fieldLabel: string | undefined) => {
    const value = range ? (shown as Range)[index] : (shown as string | null);
    return createElement(loose(MaskedDateInput), {
      key: index,
      label: fieldLabel,
      labelProps: LABEL_PROPS,
      "aria-label": fieldLabel ? undefined : text(props.label),
      value,
      onChange: (next: string | null) => {
        const date = next ? next.slice(0, 10) : null;
        if (!range) return publish(date);
        const [from, to] = (shown as Range) ?? [null, null];
        publish(index === 0 ? [date, to] : [from, date]);
      },
      fieldsOrder: order.map((t) => FIELD[t]),
      dateSeparator: separator,
      withDropdown: false,
      readOnly,
      disabled: props.disabled,
      error: props.error,
      clearable: index === (range ? 1 : 0) && isTrue(props.clearable),
      ...(index === 0 ? fieldRefs(order[0]!, props.ref) : {}),
      dayPlaceholder: empty(props.emptyCharacter, 2),
      monthPlaceholder: empty(props.emptyCharacter, 2),
      yearPlaceholder: empty(props.emptyCharacter, 4),
      onClick: () => !readOnly && !props.disabled && setOpened(true),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpened(false);
        if (event.key === "ArrowDown" && event.altKey) setOpened(true);
      },
    });
  };
  return (
    <Popover opened={opened && !readOnly && !props.disabled} onChange={setOpened} withinPortal={false} position="bottom-start" trapFocus={false} returnFocus={false} closeOnEscape>
      <Popover.Target>
        {createElement(
          loose(Input.Wrapper),
          { label: text(props.label), labelProps: LABEL_PROPS, className: props.className, style: props.style, wrapperProps: props.wrapperProps },
          <div className="gfui-DatePicker-fields" data-range={range || undefined} {...groupFocus(props)}>
            {section(props.startIcon, props.startText)?.node}
            {range ? [field(0, "From"), <span key="dash" className="gfui-DatePicker-dash" aria-hidden="true">–</span>, field(1, "To")] : field(0, undefined)}
            {section(props.endIcon, props.endText)?.node}
            <CloseButton
              className="gfui-DatePicker-toggle"
              icon={<CalendarIcon />}
              aria-label={opened ? "Close the calendar" : "Open the calendar"}
              aria-expanded={opened}
              disabled={props.disabled || readOnly}
              onClick={() => setOpened((o) => !o)}
            />
          </div>,
        )}
      </Popover.Target>
      <Popover.Dropdown className="gfui-DatePicker-dropdown">{calendar}</Popover.Dropdown>
    </Popover>
  );
}

/** A small calendar glyph for the popup's toggle. */
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export const _testing = { labelFormats };
