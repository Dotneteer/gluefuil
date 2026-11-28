# Date and time inputs

> Subsystem reference: `DateInput`, `TimeInput`, `DatePicker` (step 26), on
> `@mantine/dates` in a lazy chunk. Describes the code as it is. Design and
> XMLUI comparison: [`../plan/poc-26-dates.md`](../plan/poc-26-dates.md).
> The other inputs: [inputs.md](inputs.md), [choice.md](choice.md); forms:
> [forms.md](forms.md).
>
> **Last updated:** step 26.

## In markup

```xml
<DateInput id="born" label="Born" dateFormat="dd/MM/yyyy" clearable="true" minValue="01/01/1900"/>
<TimeInput label="Alarm" hour24="false" seconds="true" minTime="06:00" onInvalidTime="(t) => …"/>
<DatePicker label="Trip" mode="range" showPresets="true"/>
<DatePicker inline="true" weekStartsOn="1" disabledDates="{[{ dayOfWeek: [0, 6] }]}" locale="de-DE"/>
```

| | Value (XMLUI's) | Empty | Extra API |
|-|-----------------|-------|-----------|
| `DateInput` | a string in `dateFormat` | `null` | `isoValue()` → `YYYY-MM-DD` |
| `TimeInput` | `HH:mm[:ss]`, or `hh:mm[:ss] am` (`hour24="false"`) | `null` | `isoValue()` → 24-hour `HH:mm:ss` |
| `DatePicker` | a string in `dateFormat`, or `{ from, to }` (`mode="range"`) | `undefined` | `getValue()` |

All three: their own `label`, `initialValue`, `enabled`, `readOnly`,
`autoFocus`, `validationStatus`, adornments (`startText`, `startIcon`,
`endText`, `endIcon`), `clearable`; `didChange`, `gotFocus`, `lostFocus`
(entering and leaving the fields, not moving between them); `value`,
`setValue` (no `didChange`), `focus` (the first field). An ISO
`initialValue` or `setValue` argument is written in `dateFormat` (XMLUI
normalizes it too).

- **DateInput:** `dateFormat` (the eight XMLUI formats; it sets the fields'
  order and separator), `minValue`/`maxValue` (dates; outside them the input
  is in error and the value `null`), `clearToInitialValue`,
  `emptyCharacter` (the fields' placeholders). `mode`, `weekStartsOn`,
  `showWeekNumber`, `inline`, `disabledDates` are accepted and ignored, as
  in XMLUI.
- **TimeInput:** `hour24`, `seconds`, `minTime`/`maxTime` (a typed time
  outside them fires `invalidTime` with it; Mantine clamps it on blur),
  `clearToInitialValue`, `emptyCharacter`.
- **DatePicker:** `mode`, `dateFormat`, `inline` (else typed fields, one or
  "From" and "To", with a calendar button and popup), `startDate`/`endDate`
  (Mantine's `minDate`/`maxDate`), `disabledDates`, `weekStartsOn`,
  `showWeekNumber(s)`, `numOfMonths` (default 1; 2 for a range in a popup),
  `locale`, `showPresets`/`presets` (range only). A range's value changes
  when both ends are set; the calendar shows the first click meanwhile.

## How it works

- **`date-format.ts`** (React-free, main chunk): the eight formats
  (`parseDate` also takes ISO and Dates; `formatDate`, `dateToIso`,
  `isoToDate`), `withinLimits`, `isDisabledDate` (XMLUI's matchers:
  dates, arrays, `true`, `{ from, to }`, `{ before }`, `{ after }`,
  `{ before, after }`, `{ dayOfWeek }`), the presets (`presetRange`, as
  zag.js computes them; `resolvePresets`: keys, `{ value, label }`,
  `{ label, from, to }`), times (`parseTime`, `formatTime`, `timeToIso`).
- **`dates-native.tsx`** (the lazy chunk, with `@mantine/dates` and
  `dayjs`): `DateInputNative` (`MaskedDateInput` without its dropdown),
  `TimeInputNative` (`TimePicker`), `DatePickerNative` (Mantine's
  `DatePicker`; in a `Popover` under `MaskedDateInput`s unless inline).
  - Values convert between XMLUI's strings and Mantine's ISO strings.
  - Calendar labels and day names come from `Intl` with `locale`: no dayjs
    locale files. No weekend colors (XMLUI has none). The calendar opens on
    the value's month.
  - Their own labels (Mantine's), with the `gfui-Label-text` class.
- **`dates.tsx`** (main chunk): each markup component is `wrapComponent`
  around a lazy native.
  - The native renders inside a Suspense boundary that reads the chunk with
    `use()` (step 23's `lazyResource`, `noteServerLoad`). It is memoized on
    its props' values; functions are read through a holder, so the
    takeover's new callbacks don't reach a dehydrated boundary.
  - An outer component normalizes `initialValue` and `setValue`'s argument,
    passes the initial value on for `clearToInitialValue`, and adds
    `isoValue()`/`getValue()` to the API (they need `dateFormat`).
  - A prerendered page with one of them starts loading the chunk at once;
    `preloadDates()` lets an app do it earlier.
- **`exclusive` props** (`metadata.ts`, `compile-module.ts`): DateInput's
  `minValue`/`maxValue` are dates; the validation behavior's numeric range
  would reject them, so they go to the component only.

### The locale (step 34)

Without a `locale` prop, the calendars' labels follow the nearest locale (the
App's, or a `<Locale>`'s), not `en-US` ([i18n.md](i18n.md)).

## Theme variables

The five text-input variables for each (`TEXT_INPUTS`), and
`backgroundColor-menu-DatePicker`, `borderColor-menu-DatePicker` for the
popup. Mantine's date CSS (`@mantine/dates/styles.layer.css`, 36 KB) is part
of `MANTINE_STYLESHEET`, eager: the prerender inlines it.

## Size

| Build (hello app) | Step 25 | Step 26 |
|-------------------|---------|---------|
| Eager JavaScript (entry, plus a chunk it shares with the dates chunk) | 811 KB (227 KB gzipped) | 858 KB (236 KB gzipped) |
| The lazy dates chunk | — | 117 KB (33 KB gzipped) |
| `gfui.js` (standalone, one file) | 1,050 KB (300 KB gzipped) | 1,231 KB (350 KB gzipped) |

Most of the eager growth is the date stylesheet.

## Files

| File | Contents |
|------|----------|
| `components/src/date-format.ts` | Formats, limits, matchers, presets, times |
| `components/src/dates-native.tsx` | The lazy chunk: the three natives |
| `components/src/dates.tsx` | `DateInput`, `TimeInput`, `DatePicker`, `preloadDates` |
| `components/src/metadata.ts` | `DATE_COMPONENTS`; `PropMetadata.exclusive` |
| `compiler/src/module/compile-module.ts` | An `exclusive` prop never goes to a behavior |

## Tests

| File | Covers |
|------|--------|
| `components/tests/dates.test.tsx` | The formats table (each format, ISO, invalid dates), limits and every matcher, the presets against a fixed day, times; DateInput (field order, typing, `isoValue`, normalized values, limits); TimeInput (both modes, `isoValue`, `invalidTime`); DatePicker (inline: the month, disabled days, the week's first day, a click; a range in two clicks; presets; the popup; the locale); a Form; the prerender |
| `compiler/tests/module/forms.test.ts` | An `exclusive` prop isn't the validation's; a shared one still is |
| `tools/build-output.test.ts` | The dates chunk is lazy; only its stylesheet is eager |
| `e2e/playground-scenarios.spec.ts` (Date and time inputs, DatePicker) | Typing across fields, formats, clearing (also to the initial value), limits, the empty character, read-only; 12-hour time, `invalidTime` and clamping; the API; the popup, typed fields, a range, presets, limits and disabled days, the locale and week numbers; a Form |
