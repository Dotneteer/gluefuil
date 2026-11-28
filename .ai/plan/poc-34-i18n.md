# Step 34: internationalization

**Status:** Done (accepted 2026-11-28)

Phase G's second step ([poc-steps.md](poc-steps.md) row 34): locale bundles,
ICU messages, formatters, RTL. Reference:
`website/content/docs/pages/managed-react/i18n-foundations.md`.

## Goal

```xml
<App defaultLocale="en" direction="auto"
     localeBundles="{{
       en: { greeting: 'Hello, {name}!', inbox: '{count, plural, =0 {No messages} one {# message} other {# messages}}' },
       de: { greeting: 'Hallo, {name}!', inbox: '{count, plural, =0 {Keine Nachrichten} one {# Nachricht} other {# Nachrichten}}' }
     }}">
  <I18n key="greeting" name="{user.name}"/>
  <Text>{App.translate('inbox', { count: messages.length })}</Text>
  <Text>{App.formatCurrency(order.total, 'EUR')} · {App.formatList(order.tags)}</Text>
  <Button label="Deutsch" onClick="App.setLocale('de')"/>
  <Locale locale="ar"><I18n key="greeting" name="Ada"/></Locale>
</App>
```

Apps write messages once per locale in ICU MessageFormat. They switch the
locale at runtime, and everything that reads a message or formats a value
follows: `I18n`, `App.translate`, the formatters, `Value`/`Table`, the date
inputs, and the framework's own strings. An RTL locale mirrors the layout.

## Background

### XMLUI

**The documented model** (`pages/managed-react/i18n-foundations.md`;
`.ai/xmlui/i18n.md`):

- Bundles are flat `{ key: ICU pattern }` maps per locale, given inline
  (`<App localeBundles>`) or as URLs (`App.registerLocaleBundles(url)`).
- **The active locale**, in priority order: `<App locale>`, then
  `App.setLocale()`, then the value persisted in
  `localStorage["xmlui.locale"]`, then the first match of
  `navigator.languages`, then `defaultLocale` ("en"). It is reactive
  (`App.locale`).
- **Lookup:** `App.translate(key, vars)` / `App.t`; `<I18n key="…" name="…"/>`
  with `<link/>` placeholders that named slots replace. A missing key is a
  diagnostic and renders the key.
- **Formatters on `App`:** `formatNumber`, `formatCurrency`, `formatList`,
  `formatRelativeTime`, `compare`, `pluralRules`.
- **`<Locale>`** scopes a locale (and separators, the minus sign, a currency,
  a numbering system) for its descendants.
- **Direction:** `<App direction="auto">` gives RTL for Arabic, Hebrew,
  Persian and Urdu. The components use CSS logical properties, and a lint
  script flags physical ones.
- **`strictI18n`** escalates the diagnostics. Framework strings use
  `xmlui.*` keys.

**The source** (`xmlui/src/components-core/i18n/`):

- **`icu.ts`** is a hand-rolled subset:
  - `{arg}`, plural (`=N`, categories), select, `number`
    (integer/percent), `date`/`time` styles.
  - **No apostrophe quoting, no `offset:`, no `selectordinal`, no number
    skeletons.**
  - It replaces every `#` in a plural branch with the outer count,
    including the `#` of a nested plural (line 79).
- **`locale-resolver.ts`:** the priority order above. `navigator.languages`
  match only a locale that has a bundle, or its language.
- **`bundle-store.ts`:** a lookup falls back from `de-AT` to `de`.
- **`translate.ts`:** missing keys fall back to the built-in English strings
  (`builtin-bundles/xmlui-en.ts`: Form buttons, Select, Drawer, Modal, 9
  validators), else to the key.
- **`formatters.ts`:** called without a locale, they use
  `navigator.language` (line 58), not the active locale. The `App.*`
  wrappers pass it.
- **`locale-profile.ts`:** the separator and minus-sign overrides replace
  parts of `Intl.NumberFormat`'s output.
- **The App's wiring** (`rendering/AppContent.tsx` lines 977–1137,
  `components/App/AppReact.tsx` lines 216–255):
  - `<App locale>`, the bundles and `document.documentElement.dir` are all
    applied **in effects after the first render**. The first render (and a
    prerender) uses the default locale, and nothing waits for a URL bundle;
    the docs say "the app waits for the resolved locale's bundle".
  - RTL detection is a regex, `/^(ar|fa|he|ps|ur)(-|$)/`, not the CLDR
    table the docs name.
- **`components/I18n/I18n.tsx`:**
  - Extra props are the variables (a leading `:` is stripped).
  - `<name/>` placeholders in the *translated* string are replaced by slots,
    found with a regex; paired tags aren't supported.
  - It renders a `<span>`.
- **`components/Locale/Locale.tsx`:** a scoped profile through React
  context. Inside it, `App.translate` and the formatters use the scope's
  locale, but `App.locale` stays the root's.

### Here

- **Nothing to select a locale yet.**
  - The date inputs take a `locale` prop (default `en-US`) and format their
    labels with `Intl` (`components/src/dates-native.tsx` line 216).
  - `Value` and `Table` format numbers and dates with `typeOptions.locale`
    or the **browser's** locale (`value-types.ts` lines 5–6: "until step
    34"), so a prerender (Node's locale) can differ from the browser's.
  - The Table sorts with `Intl.Collator(locale)`.
- **Script can use `Intl`** directly (`Intl.NumberFormat` and the others are
  constructible: `compiler/src/codegen/names.ts`).
- **Step 33 added the `App` app global** (`App.errors`;
  `runtime/src/render/app-errors.ts`): the place for `App.locale`,
  `App.translate` and the formatters.
- **The framework's English strings:**
  - Form's Save, Cancel, Saving... and its unsaved-changes dialog;
  - the validation messages (`runtime/src/forms/rules.ts`: email, URL,
    phone, length, range, "Invalid input");
  - the dialogs' Close label;
  - FileInput's Browse and the drop zone's "Drop files here";
  - step 33's "Something went wrong" panel;
  - about 20 `aria-label`s (Close, Select row, Pagination, Clear, Show the
    password, …).
- **RTL:**
  - `styles.ts` has 22 physical properties (`left:`, `padding-left`,
    `border-left`, `translateX`, …);
  - a few physical inline styles (the ContextMenu anchor is a pointer
    position: correct as it is);
  - Mantine has a `DirectionProvider`.
- **The prerender** already hydrates with a server value and switches
  afterwards (the breakpoint, step 13: `data-gfui-prerendered`, the server
  view).

## Options considered

Measured in `.tmp/vproto/i18n/` (Node 22; `measure.mjs`, `own.mjs`), with
`intl-messageformat` 12.1.5 and `@messageformat/core` 3.4.1 (both at least
two weeks old), and in Chromium 159.

### A. The ICU MessageFormat implementation

The 19 cases cover plurals in English, Polish (few/many) and Arabic (six
categories), `=N`, `offset:`, `selectordinal`, select, the `#` of a nested
plural, apostrophe quoting, percent, `::currency/EUR` in German, a medium
date, paired tags, XMLUI's self-closing `<link/>`, and two errors.

| | (1) our own (`own.mjs`, about 250 lines) | (2) `intl-messageformat` (FormatJS) | (3) `@messageformat/core` |
|---|---|---|---|
| Conformance | 19/19 (*the cases were written alongside it*) | 18/19 (no self-closing `<link/>`) | 17/19 (no tags) |
| Coverage beyond the cases | a few number skeletons only | the whole MF1, number and date skeletons; its own test corpus | MF1, skeletons |
| Size (minified / gzipped) | 4.0 / 1.8 KiB | 32.9 / 9.7 KiB | 69.7 / 19.9 KiB; precompiled messages need only its runtime, 10.8 / 2.8 KiB |
| Parse and compile one message | 2.3 µs | 6.6 µs | 12.0 µs |
| Format a compiled plural | 0.40 µs | 0.95 µs | 0.42 µs |
| `eval` | no | no | **`new Function`**: forbidden under our `script-src 'self'`; usable only precompiled at build time, so no bundles loaded at runtime |

1. **`intl-messageformat`** *(recommended)*. It is the complete MF1, with
   number and date skeletons. Correctness is FormatJS's, not ours. 9.7 KiB
   gzipped, no eval. XMLUI's `<link/>` placeholders are rewritten to
   `<link></link>` before parsing (one regex), so XMLUI's bundles still work.
2. **Our own.** A fifth of the size and twice as fast, but full MF1 (number
   and date skeletons, quoting edge cases) becomes ours to get right and to
   test. The 19/19 is not independent evidence.
3. **`@messageformat/core` precompiled at build time.** The smallest runtime,
   but runtime bundles (URLs) and standalone mode can't use it without
   `eval`.

### B. Where bundles come from

1. **Inline `localeBundles` and URLs (XMLUI's), plus locale files**
   *(recommended)*.
   - The Vite plugin discovers `src/locales/<locale>.json` (as it discovers
     `components/`) and turns each file into a lazy chunk.
   - The compiler checks the ICU syntax of inline literal bundles and of the
     files at build time, and reports errors with their position. A URL
     bundle is checked when it loads; an error there is a diagnostic.
2. **XMLUI's only:** inline and URL bundles, checked at runtime.

### C. The prerender, when the browser's locale differs

The prerender can't know `localStorage` or `navigator.languages`.

1. **Prerender the app's locale and switch after the takeover**
   *(recommended)*. The prerender renders `locale` or `defaultLocale` and
   writes it to the container (`data-gfui-locale`), plus `lang` and `dir`
   on `<html>`. Hydration renders that locale, then switches to the
   resolved one, waiting for its bundle. This is step 13's breakpoint
   mechanism: the takeover changes no node; the texts change afterwards. A
   visitor whose locale differs sees the default language until the switch.
2. **Skip hydration when the locales differ:** a fresh render that replaces
   the prerendered DOM. There's no wrong-language text in the DOM after
   start-up, but the takeover reuses nothing.
3. **One prerendered page per locale** (`/de/…`), with routes for locales.
   Later, with step 38's routing work.

### D. The framework's own strings

1. **`gfui.*` keys with a built-in English bundle** *(recommended)*:
   `gfui.form.save`, `gfui.validation.email`, `gfui.dialog.close`, … An app's
   bundle overrides any of them, and a prop that sets the text (`saveLabel`)
   still wins.
2. **XMLUI's `xmlui.*` keys,** so an XMLUI app's bundles translate our
   strings unchanged. Against our naming rule ("XMLUI" names only the
   original).

### E. `<Locale>` and script

1. **Inside `<Locale>`, `App` is bound to its locale** *(recommended)*.
   `App.translate`, `App.formatNumber` and the rest use the scope's locale,
   as in XMLUI. `Locale` gives its children a context variable `App` that
   shadows the global: the compiler already passes context variables
   (`childContextVars`). `App.locale` reads the scope's locale (XMLUI: the
   root's, which surprises).
2. **Only components follow `<Locale>`** (`I18n`, `Value`, `Table`, the
   date inputs); `App.*` in script always uses the app's locale.

## Design

### The locale

- **`runtime/src/i18n/`:**
  - `locale.ts`: validation and normalization through
    `Intl.getCanonicalLocales`, the resolver, the active-locale signal,
    persistence.
  - `bundles.ts`: the store, with lookup falling back from `de-AT` to `de`,
    then to the built-in strings, then to the key.
  - `messages.ts`: `intl-messageformat` behind a cache of compiled messages
    per locale and key.
  - `format.ts`: the formatters; `Intl` objects cached per locale and
    options.
  - `direction.ts`.
- **Resolution, in XMLUI's order:** `<App locale>`, then
  `App.setLocale()`, then `localStorage["gfui.locale"]`, then the first
  `navigator.languages` entry with a bundle (or its language), then
  `<App defaultLocale>` ("en").
  - `App.setLocale(locale)` waits for the locale's bundle when it is a URL
    or a lazy file, then switches, so no keys show in between.
  - It returns a promise.
- **Reactive:** the active locale is a signal. Bindings that call
  `App.translate` or a formatter read it, and re-run when it changes.

### Messages

- **`App.translate(key, vars?)` and `App.t`:** a missing key is a diagnostic
  (`reportDiagnostic`) and renders the key; an ICU error renders the key
  too.
  - There is no `strictI18n`: build-time checks cover the bundles that
    exist at build time.
- **`<I18n key="…" name="…">`:**
  - Its other props are the variables; it renders inline content (no
    `<span>`; a `Text` around it styles it).
  - Placeholders: `<link/>` (XMLUI's) and paired `<b>…</b>` tags. A slot
    `<property name="link">` replaces them, receiving the tag's text as
    `$content`. Without a slot, a tag renders its text.
  - The compiler accepts any prop name on `I18n` (XMLUI's
    `allowArbitraryProps`).
- **Bundles:**
  - `<App localeBundles="{…}">`, a literal or a binding. Literals are
    checked at compile time.
  - `App.registerLocaleBundles(urlOrBundle)` (XMLUI's shapes).
  - Locale files (option B1): `src/locales/de.json` (or `de-AT.json`).
    Flat maps, or nested objects flattened to dotted keys. Each locale is a
    lazy chunk; `en` (or `defaultLocale`) ships eagerly when the prerender
    needs it.
  - Standalone mode loads `locales/<locale>.json` beside `Main.gui` on
    demand.

### Formatters

- **On `App`:** `formatNumber(v, options?)`, `formatCurrency(v, currency?,
  options?)`, `formatDate(v, options?)` (added: XMLUI has none),
  `formatList(values, options?)`, `formatRelativeTime(v, unit, options?)`,
  `compare(a, b, options?)`, `pluralRules(n, options?)`. Each uses the
  active (or scoped) locale.
- **`<Locale>`:** `locale`, `decimalSeparator`, `groupSeparator`
  (`thousandSeparator`), `minusSign`, `currency`, `numberingSystem`, as in
  XMLUI (the parts of `formatToParts` replaced).
- **The components follow the locale:**
  - `Value`/`Table` without `typeOptions.locale`, and the Table's collator;
  - DateInput, DatePicker and TimeInput without `locale`;
  - NumberBox's display;
  - Markdown is left alone.

### Direction

- **`<App direction="auto|ltr|rtl">`** (default `auto`). `auto` uses
  `Intl.Locale(locale).getTextInfo().direction`, else its `textInfo`
  (Node), else a list. Chromium gets `ar`, `he`, `fa`, `ur`, `ps`, `ckb`,
  `dv` and `yi` right; XMLUI's regex misses the last three.
- **The attributes:** `dir` and `lang` go on `.gfui-App` (prerendered) and
  on `<html>`; the prerender writes `<html lang dir>`. `<Locale>` sets
  `dir`/`lang` on a `display: contents` wrapper when they differ.
- **Mantine's `DirectionProvider`** follows the App.
- **The CSS:** the physical properties in `styles.ts` become logical ones
  (`inset-inline-start`, `padding-inline-start`, `border-inline-start`;
  `translateX` flipped by a `[dir=rtl]` rule).
  - The Splitter's drag maths, the Table's pinned columns and resizer, the
    drawer, the List's check anchor and the ToneSwitch are checked in RTL.
  - A unit test fails on any new physical property in `styles.ts` (XMLUI's
    lint as a test), with an allowlist for the centred ones (`left: 50%`
    with `translateX(-50%)`).

### Framework strings (option D1)

- A built-in `en` bundle of `gfui.*` keys, used wherever a component or the
  runtime shows text of its own (the list in *Background*). A prop that sets
  the text still wins.

### Diagnostics

- **At compile time:** a literal bundle's ICU syntax error is reported with
  its position; a literal `I18n key` missing from every literal bundle is a
  warning. The diagnostic codes are the next free ones.
- **At runtime:** a missing key, an invalid locale, a bundle that fails to
  load, and an ICU error in a URL bundle go to `reportDiagnostic`, never to
  the error pipeline, so no toast.

### Divergences from XMLUI (proposed)

| XMLUI | Here |
|-------|------|
| A hand-rolled ICU subset (no quoting, `offset`, `selectordinal`, skeletons; nested `#` wrong) | `intl-messageformat` (option A) |
| `<App locale>` and bundles applied after the first render; nothing waits for a bundle | Applied before the first render; `setLocale` waits for the bundle; the prerender renders the app's locale |
| `dir` only on `<html>`, set in an effect | On the App root (prerendered) and on `<html>` |
| RTL by a five-language regex | `Intl.Locale` text info |
| `App.locale` inside `<Locale>` is the root's | The scope's |
| `xmlui.*` keys; nine validators | `gfui.*` keys; every framework string |
| `strictI18n` | Build-time checks; runtime problems are diagnostics |
| No `formatDate` | `App.formatDate` |
| Locale files: none | `src/locales/*.json`, lazy, checked at build time (option B) |

## Steps

- [x] The locale core (`runtime/src/i18n/`): resolution, persistence, the
      store, messages on `intl-messageformat`, the formatters; `App.*`.
- [x] `<App locale defaultLocale localeBundles direction>`, `I18n`,
      `Locale`; the prerender's locale and the takeover switch.
- [x] The compiler: `I18n`'s props, ICU checks of literal bundles, `Locale`'s
      `App`; the plugin's locale files.
- [x] The framework strings through `gfui.*` keys; Value, Table, dates
      following the locale.
- [x] RTL: logical CSS, Mantine's direction, the physical-property test,
      the interactive components checked in RTL.
- [x] Unit tests, a playground scenario, E2E.
- [x] Docs: `code-structure.md`, `i18n.md`, the docs of the components that
      changed; *Decisions* in `AGENTS.md`.
- [x] `npm run check`; the bundle size.

## Verification

- **Unit tables:**
  - the resolver's order;
  - bundle fallback (`de-AT` → `de` → built-in → key);
  - messages in en, de, pl and ar (plural categories, select, ordinal,
    `offset`, `#` nesting, quoting, tags, XMLUI's `<link/>`);
  - the formatters with `<Locale>` traits;
  - RTL detection;
  - the compile-time diagnostics.
- **jsdom:**
  - `I18n` with variables and slots;
  - `App.setLocale` re-rendering bindings, waiting for a URL bundle,
    persistence;
  - `<Locale>`'s `App`;
  - Form, validation and dialog strings translated, with a prop still
    winning;
  - Value and Table in the locale.
- **Prerender:**
  - the default locale prerendered, with `lang`/`dir` on `<html>`;
  - a takeover in a browser preferring `de` changes no node, then switches;
  - a locale file loaded lazily.
- **E2E:**
  - switching the locale in the playground (texts, numbers, dates, a plural);
  - persistence across a reload;
  - an RTL locale: the layout mirrored, measured (the nav panel's side, a
    Splitter drag, a pinned Table column, a drawer), no horizontal overflow.
- **Size:** the eager bundle with `intl-messageformat`, and the locale files
  as chunks.

## Outcome

- **The runtime** (`runtime/src/i18n/`):
  - the resolution (XMLUI's order, the stored choice, the server view);
  - bundles and lazy loaders;
  - messages on `intl-messageformat` 12.1.5, compiled once per locale and
    pattern;
  - the formatters with `<Locale>` traits;
  - the `App` global (`createAppApi`) with the locale API beside
    `App.errors`;
  - `useLocaleProfile`, `useFrameworkText`;
  - `BUILT_IN_MESSAGES` (the `gfui.*` strings).
- **The components:**
  - App's `locale`, `defaultLocale`, `localeBundles` and `direction`.
  - `I18n` (variables, slots with `$content`) and `Locale` (a profile, a
    scoped `App`, Suspense while its messages load).
  - Framework strings in Form, the validation rules, the dialogs, the files,
    the error panel and about 20 `aria-label`s.
  - `Value`, `Table` and the date inputs follow the locale.
  - RTL: logical CSS, mirrored Splitter drags and keys, Table resizing,
    pinned columns as `insetInline*`.
- **The compiler:**
  - E041 (literal bundles, on `@formatjs/icu-messageformat-parser`, now in
    `COMPILER_PACKAGES` in `tools/boundaries.ts`);
  - `arbitraryTemplates` (I18n's slots);
  - a built-in's `key`/`ref` prop as `$$propKey`/`$$propRef`.
- **The plugin:** locale files (`src/locales/*.json`, checked, the app's own
  eager and the rest lazy) and `<html lang dir>` in the prerender.
- **The playground:** "Languages and formats" (58 scenarios), with
  `src/locales/{en,de,pl,ar}.json`.
- **Evidence:** `npm run check` passes and prints no warnings: 3,579 unit
  tests in 130 files, 308 E2E tests. New:
  - `runtime/tests/i18n/i18n.test.ts` (71);
  - `compiler/tests/module/i18n.test.ts` (15);
  - `vite-plugin/tests/locales.test.ts` (10);
  - `components/tests/i18n.test.tsx` (11, with the prerender's takeover);
  - `components/tests/rtl-css.test.ts` (2);
  - `e2e/i18n.spec.ts` (6; 60 of 60 under `--repeat-each=10 --workers=8`).
- **Size** (against a build of `master`): the hello app's eager JavaScript
  1,268 → 1,314 KiB (351 → 365 KiB gzipped; `intl-messageformat` and its
  parser are most of it); `gfui.js` 1,737 → 1,789 KiB (493 → 510 KiB
  gzipped). The playground's `de`, `pl` and `ar` files are chunks of their
  own.

### Findings

- **A re-render after the takeover drops a dehydrated Suspense boundary's
  HTML.**
  - With no bundles, the browser's `en-US` replaces the prerendered `en`
    after the takeover. The App re-rendered (for `lang`), and
    `useFrameworkText` re-rendered every `Heading`. Markdown's lazy renderer
    was still dehydrated, so React dropped its prerendered HTML.
  - `e2e/ssg.spec.ts` caught it, and a probe confirmed it: the browser in
    `en` changed nothing, in `en-US` it replaced the Markdown.
  - Fix: the App re-renders only for a direction change and sets `lang`
    through a signal watch; framework strings re-render on
    `messagesSignature` (which bundles), not on the locale's name.
- **React's `use()` must be called on every render** once a component
  suspended with it. `LocaleGate` passes an already-fulfilled promise when
  nothing is pending.
- **A `<Locale>` with a lazy locale must load it itself.** The scenario's
  `de-CH` scope showed keys until the user chose German. Locale suspends on
  `localeLoad(locale)`, and the prerender notes the load and renders again.
- **The stored choice must be a signal.** Read directly, a resolution that
  returned it early was cached and never ran again.
- **React keeps `key` and `ref` for itself:** XMLUI's `<I18n key>` would have
  been swallowed. The compiler passes a built-in's `key`/`ref` as
  `$$propKey`/`$$propRef`.
- **`intl-messageformat` throws on a missing variable or tag.** The wrapper
  walks each message's AST once and fills them.
- **In jsdom `navigator.languages` is `["en-US"]`,** which matches an `en`
  bundle, so `App.locale` reads `en-US` in tests (XMLUI's order, as designed).
- **In RTL, Chromium scrolls sideways with a negative `scrollLeft`** and puts
  the vertical scrollbar on the left; the pinned-column test measures from
  both edges.

### Deviations from this plan

- `<I18n>` keys missing from every literal bundle are not warned about at
  compile time: keys in locale files would be false positives.
- `lang` is set on the App's root by an effect, not rendered (the finding
  above), so the prerendered App root has `dir` but not `lang`; `<html>` has
  both.
- Standalone mode has no locale files (it can't list a folder); it uses
  inline and URL bundles.
- NumberBox's display doesn't follow the locale yet (Mantine's separators).
- A user component's own script sees the global `App`, not an enclosing
  `<Locale>`'s (scope isolation); its built-in children follow the Locale.

### Open for later steps

- A prerendered page per locale (option C3), with locale routes (step 38).
- NumberBox in the locale; `<Locale>` in user components' script.
- Translating the playground's own chrome; a locale switcher component.

## Open questions

None: A–E are under *Decisions*. Proposed without asking (say if you want otherwise):

- XMLUI's resolution order and persistence in `localStorage["gfui.locale"]`.
- `setLocale` waits for the bundle.
- `App.formatDate` added.
- No `strictI18n`.
- `dir`/`lang` on the App root and `<html>`.
- A physical-CSS test.
- `I18n` renders inline content.
- Missing keys render the key and are diagnostics.

## Decisions (asked 2026-11-28)

1. **ICU messages on `intl-messageformat`** (option A1), version 12.1.5 or
   another at least two weeks old; XMLUI's `<link/>` placeholders rewritten
   to paired tags before parsing.
2. **Bundles** (option B1): inline `localeBundles`, URL bundles, and locale
   files `src/locales/<locale>.json` discovered by the Vite plugin (lazy
   chunks); literal bundles and the files checked at build time.
3. **The prerender** (option C1) renders the app's locale; hydration renders
   it too, then switches to the browser's resolved locale once its bundle is
   loaded.
4. **Framework strings** (option D1) use `gfui.*` keys in a built-in English
   bundle; a prop that sets the text wins.
5. **`<Locale>` and script** (option E1): inside `<Locale>`, `App` is bound to
   the scope's locale (`App.translate`, the formatters, `App.locale`).
