# Step 26: Date and time inputs

**Status:** Done

Part of [poc-steps.md](poc-steps.md), the fourth batch of Phase F:
`DateInput`, `DatePicker`, `TimeInput`.

## Goal

```xml
<DateInput id="born" label="Born" dateFormat="dd/MM/yyyy" clearable="true"/>
<DatePicker label="Trip" mode="range" showPresets="true" numOfMonths="2"/>
<DatePicker inline="true" weekStartsOn="1" disabledDates="{[{ dayOfWeek: [0, 6] }]}"/>
<TimeInput label="Alarm" hour24="false" seconds="true" minTime="06:00"/>
<Text>{born.value} = {born.isoValue()}</Text>
```

XMLUI's markup, bound to forms with `bindTo`, prerendered.

## Background

### XMLUI (`website/content/docs/reference/components/*.md`, `xmlui/src/components/*`)

- **DateInput** (`DateInput.md`, `DateInputReact.tsx`): day, month and year
  fields typed with the keyboard, no calendar.
  - `dateFormat` (default `MM/dd/yyyy`): `MM/dd/yyyy`, `MM-dd-yyyy`,
    `yyyy/MM/dd`, `yyyy-MM-dd`, `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyyMMdd`,
    `MMddyyyy`; it sets the fields' order and separator.
  - **The value is a string in `dateFormat`** (`format(date, dateFormat)`,
    `DateInputReact.tsx` 297), `null` when empty or incomplete;
    `isoValue()` gives `YYYY-MM-DD` (540–580).
  - `clearable`, `clearIcon`, `clearToInitialValue`, `emptyCharacter`
    (placeholder, default `-`), `minValue`/`maxValue` (passed to the fields
    only, 733–782), adornments, `gap`, `required`, `readOnly`,
    `validationStatus`, `autoFocus`; `didChange`, `gotFocus`, `lostFocus`;
    API `value`, `setValue`, `focus`, `isoValue`.
  - `mode="range"`, `weekStartsOn`, `showWeekNumber`, `inline`,
    `disabledDates` are declared "for compatibility with DatePicker"; range
    mode isn't implemented (no code reads it).
- **DatePicker** (`DatePicker.md`, `DatePickerReact.tsx`, on Ark UI):
  - typed fields with a calendar in a popup, or `inline` (the calendar in
    the layout);
  - `mode` `single` / `range`; the value is a string in `dateFormat`, or
    `{ from, to }` (`toPayload`, 1128–1145); `setValue` takes the same;
  - `startDate`/`endDate` (the navigable months), `disabledDates` (date
    strings, `{ from, to }`, `{ before }`, `{ after }`, `{ dayOfWeek }`,
    `true`), `weekStartsOn` (0–6), `showWeekNumber`, `numOfMonths`
    (default 2 for a range), `locale` (BCP 47, default `en-US`),
    `timeZone`;
  - range presets (`showPresets`, `presets`: keys such as `last7Days`, or
    `{ value, label }`, or `{ label, from, to }`; default: last 7 days, last
    30 days, this month, last month; 160–200, 585–640);
  - `confirmRangeSelection`, `placeholder`, `label`, `clearable`,
    adornments; `didChange`, `gotFocus`, `lostFocus`; API `value`,
    `getValue`, `setValue`, `focus`.
- **TimeInput** (`TimeInput.md`, `TimeInputReact.tsx`): hour, minute
  (second) fields, an AM/PM toggle.
  - The value is `HH:mm` (`HH:mm:ss` with `seconds`) in 24-hour mode,
    `hh:mm am` in 12-hour mode (`hour24="false"`) (214–260); `isoValue()`
    gives 24-hour `HH:mm:ss`.
  - `minTime`, `maxTime`, `clearable`, `clearToInitialValue`,
    `emptyCharacter`, adornments; `invalidTime` fires for an invalid typed
    field (262–275).

### Mantine (`@mantine/dates` 9.8.2)

`MaskedDateInput` (day/month/year fields, `fieldsOrder`, `dateSeparator`),
`TimePicker` (hour/minute/second fields, `12h` with an AM/PM select, `min`
and `max` clamped on blur), `DatePicker` (the calendar: `type`
`default`/`range`, `minDate`, `maxDate`, `excludeDate`, `firstDayOfWeek`,
`withWeekNumbers`, `numberOfColumns`, `presets`, label formats as
functions). Values are ISO strings (`YYYY-MM-DD`, `HH:mm:ss`). It needs
`dayjs`. `MaskedDateInput` imports the calendar (for its own dropdown).

## Decisions (asked 2026-11-25)

1. **The calendar is `@mantine/dates`** (with `dayjs`), styled through our
   theme variables.
2. **XMLUI's string values:** a date is a string in `dateFormat` (a range
   `{ from, to }`), a time `HH:mm[:ss]` or `hh:mm[:ss] am`; `isoValue()`.
3. **A lazy chunk.** The plan's first idea, DateInput and TimeInput in the
   main chunk, doesn't hold: `MaskedDateInput` imports the calendar. So
   **all three load in one lazy "dates" chunk**; the main chunk has thin
   wrappers and the format code (`date-format.ts`). The prerender renders
   again after the chunk loads (step 23), and a prerendered page keeps its
   HTML until the chunk arrives.

## Design

- **`date-format.ts`** (React-free): parse and format the eight
  `dateFormat`s (ISO accepted too), times in both modes, `disabledDates`
  matchers, range presets.
- **`dates-native.tsx`** (the lazy chunk): `DateInputNative` on
  `MaskedDateInput`, `TimeInputNative` on `TimePicker`, `DatePickerNative`
  on `DatePicker` (inline, or in a `Popover` under a typed input).
  Calendar labels come from `Intl` with `locale` (no dayjs locale files).
- **`dates.tsx`**: each markup component is a `wrapComponent` around a
  boundary that loads the chunk (Suspense; memoized so a hydrating
  boundary keeps the server HTML, callbacks read through a ref).
- **Their own labels** (the fields are several inputs; the calendar must
  not be inside a `<label>`), with the `gfui-Label-text` class (step 25).
- **`minValue`/`maxValue` of DateInput are dates**, not the validation's
  numeric range: a new prop flag, `exclusive`, keeps a prop the component
  declares from going to a behavior too. A date outside the limits is
  invalid (an error state, no value).
- `@mantine/dates`' stylesheet joins `MANTINE_STYLESHEET`.

## Steps

- [x] `date-format.ts` with tests.
- [x] The lazy chunk and the three components; metadata; the `exclusive`
      flag.
- [x] Unit tests (markup, values, formats, forms, prerender).
- [x] Playground scenarios and E2E tests.
- [x] Docs: `code-structure.md`, a `dates.md` subsystem doc, `forms.md`.
- [x] `npm run check`.

## Outcome

- **`DateInput`, `TimeInput`, `DatePicker`** with XMLUI's markup and
  values ([dates.md](../docs/dates.md)); new dependencies `@mantine/dates`
  9.8.2 and `dayjs` 1.11.23 (pinned).
- **A lazy "dates" chunk** (117 KB, 33 KB gzipped); the eager JavaScript of
  the hello app went from 811 KB to 858 KB (236 KB gzipped), mostly the
  date stylesheet. `gfui.js` (one file): 1,231 KB.
- **The compiler:** `PropMetadata.exclusive`.
- **The playground:** "Date and time inputs" and "DatePicker" (with a
  Form), each with an E2E test.
- **Evidence:** `npm run check` passes and prints no warnings: 2,814 unit
  tests in 99 files, 202 E2E tests. New: `components/tests/dates.test.tsx`
  (31), two compiler tests, two E2E tests; `tools/build-output.test.ts`
  checks the lazy chunks.

### Findings

- **`MaskedDateInput` imports the calendar,** so DateInput and TimeInput
  couldn't stay small in the main chunk: all three are in the lazy chunk.
- **The bundler now splits a shared chunk** (the modules the entry and the
  dates chunk both use, such as Mantine core) that the entry imports
  statically. `build-output.test.ts` counted every non-entry chunk as lazy;
  it now tells them apart by the entry's static imports.
- **A shared prop can be wrong for a behavior:** DateInput's `minValue` is
  a date, the validation's range rule is numeric (a literal date would be
  E022). `exclusive` keeps such a prop to the component.
- **Mantine's date fields handle read-only without the attribute** (the
  spin inputs ignore typing); they fire `onFocus`/`onBlur` once for the
  group.
- **Mantine colors weekends** and **opens the calendar on today's month**;
  both changed to XMLUI's look (no weekend colors, the value's month).
- **XMLUI's DateInput declares `mode="range"` but doesn't implement it**
  (`DateInputReact.tsx` reads `mode` nowhere); we accept and ignore it, as
  its other DatePicker-compatibility props.

### Divergences from XMLUI

- **DatePicker** has no single `placeholder` (each field shows its empty
  characters); a range has two typed fields, "From" and "To", and a
  calendar button.
- **DatePicker's `startDate`/`endDate` limit the days** that can be picked,
  not only the navigable months.
- **TimeInput's `invalidTime`** fires for a typed time outside
  `minTime`/`maxTime`, which Mantine then clamps on blur. Mantine's fields
  can't hold an invalid hour (25), so XMLUI's per-field invalid state has
  no counterpart.
- `timeZone` is accepted and ignored: values are calendar dates.
- `setValue` fires no `didChange` (our inputs' rule).

### Open for later steps

- `confirmRangeSelection`, `clearIcon`, `gap`, validation icons.
- DatePicker's typed range fields are labelled "From" and "To" in English,
  whatever `locale` is.
- The date stylesheet (36 KB) is eager; it could load with the chunk if the
  prerender handled lazy CSS.
- `disabledDates` as a script function (XMLUI calls it with a Date).
