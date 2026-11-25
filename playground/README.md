# gfui playground

Manual testing: a dashboard of scenarios, each on its own page.

```sh
npm run playground            # dev server (http://localhost:5190); edits reload the page
npm run playground:preview    # production build (prerendered dashboard) + preview (http://localhost:5191)
```

Routes use the hash (`/#/counter`), so any page can be bookmarked or reloaded.

The playground runs on the App shell (steps 19A–19C): a header with the
tone toggle and the nav's collapse button, a side nav listing every
scenario (built from `scenarios` with `Items`), and a footer. Below 992px
the nav is a drawer, opened from the header.

## The scenarios

One or more per concept of proof-of-concept steps 2–23
(`.ai/plan/poc-steps.md`):

| Step | Scenario | Shows |
|------|----------|-------|
| 2 | Markup | Entities, CDATA, comments, whitespace, escaped braces |
| 2–3 | Expressions | The script language in bindings; allowed globals |
| 4 | Reactivity | Derived values, the glitch-free diamond, batching |
| 5–6 | Counter | A first app |
| 6 | Variables | Follow until assigned, deep writes, array mutations, `<variable>` |
| 7 | Async handlers | Implicit await, the four policies, cancellation, timeouts |
| 8 | Component IDs | APIs through ids, in any order |
| 9 | Source maps | A handler error that points to its `.gui` line (use the devtools) |
| 10 | Conditionals | `when`, responsive `when-*`, `onMount`/`onUnmount` |
| 10 | Items and templates | Context variables, `reverse`, an `id` per row, `<property>` templates |
| 14 | User-defined components | Props, events, methods and `$self`, slots and slot props, code-behind (`Demo*.gui`) |
| 3, 15 | Live compiler | Type markup: diagnostics (sandbox, scoping, contracts), generated code, result |
| 16 | Inputs | Mantine TextBox, Select (with an option template), Checkbox, `enabled` |
| 16 | Text and headings | Every Text variant, Heading, H1–H6, `maxLines` |
| 17 | Theming | Tones, themes, scoped Theme, a dark region, a variant |
| 18 | Behaviors | Tooltip, label, variant, on built-ins and a user component |
| 19 | Routing | `navigate`, `Link`, `$routeParams`, `$queryParams`, replace, back and forward |
| 19A–C | App shell | Every XMLUI layout with the new settings, in a frame at desktop or phone width; collapsing this playground's own nav from script |
| 19D–F | Layout and spacing | A page with no gap or padding anywhere, in a frame at desktop or phone width: stacks, surfaces, a form, flows, star sizes, density, overrides; space-base 3/4/5 px; a spacing inspector that labels each stack with its level and gap |
| 20 | Data | People from a mock backend (`src/backend.ts`, a service worker in the page): search, details, rename. A network panel makes the backend slow, failing, offline, hanging or holding requests, and shows the requests it saw |
| 22, 22B | Forms | A member form loading from the mock backend (`/api/members/1`) and saving with PUT: inputs bound with `bindTo`, rules, a warning, an async check, server errors (422 on the inputs, a name with no input, a 500), Stop saving, a slow server. Unsaved changes block navigation (the `unsavedChanges` global) |
| 23 | Display | An overview: Icons (XMLUI's names, Lucide), images, avatars (a picture that fails shows initials), badges with a `colorMap`, a progress bar, a delayed spinner, separators, cards (surfaces, a clickable one, a horizontal one), links (external, disabled, active), text overflow, and Markdown: `@{…}` bound to the page's variables, GFM, the HTML allowlist, a `data` URL from the mock backend (`/api/docs/markdown`) |
| 23 | Icons | Every built-in icon name (code-behind holds the list): a filter, a size picker, a selected icon at every size and its markup, a fallback, icons taking the text color |
| 23 | Images and avatars | Image `fit`, `aspectRatio` and `grayscale` from controls, a click count, an inline picture, `lazyLoad`; Avatar initials from a name you type, every size, a picture, a picture that fails, no name, a click count |
| 23 | Status indicators | Badges of build checks with a `colorMap` (background, both colors, unmapped), fixing a check; a simulated download filling a ProgressBar; clamped values; spinners with delays 0, 400 and 1500 ms side by side; a full-screen spinner; separators (thickness, length, vertical) |
| 23 | Cards | Cards from data (click selects, double click opens), title rows (avatar, picture, a linked title, none), a horizontal and a centered card, a card in a card, cards themed by a `Theme` |
| 23 | Links and text | Every kind of link (route, query, URL in a new tab, e-mail, active, no indicator, click only, icons) with an enabled switch; every text-overflow mode at three widths; `hasOverflow()`; heading anchors and `scrollIntoView()` |
| 23 | Markdown | Samples from a variable (basics, GFM, links and images, untrusted input) shown as source and rendered, with `allowHtml`, `openLinkInNewTab` and `showHeadingAnchors` switches; `@{…}` bound to a text box and a counter (inline code, a fence and an escape keep it); `interpolateBindings="false"`; a `data` URL |
| 24 | Text inputs | TextBox types (search, email), adornments, read-only, disabled, focus events, `validationStatus` from a select; PasswordInput with and without its toggle; TextArea with rows, `insert()` and auto size; NumberBox limits and steps, whole numbers, no negatives, no spin box, its value and type |
| 24 | Choice inputs | Checkboxes (indeterminate, read-only, disabled); switches; a RadioGroup with Options from `Items` and a disabled one, a read-only group; a Slider with `didChange`/`didCommit`, a price range with a formatted tooltip; a ColorPicker with a preview |
| 24 | Input form | A Form binding every input: required fields, a minimum length, a warning, a submit showing the typed values, reset and dirty state; Enter in the TextArea submits, Escape resets |
| 24 | Input APIs and theming | A booking filled in and cleared through `setValue`, `focus()` on a text box, a radio group and a slider, a summary of every `value`; a Slider and a NumberBox that keep one value; a chat box where Enter sends (Shift+Enter is a new line) and a notes box where it doesn't (`enterSubmits="false"`, `resize`); custom password-toggle and adornment icons; the inputs' theme variables in a scoped `Theme` beside the defaults (`InputSampler.gui`) |
| 25 | Select | Option children, Items that grow, data with `valueField`/`labelField`, a number value; arrow keys over disabled options; search by keywords and clear; several values (pills, Backspace, a value template with a remove button); groups with header templates, the ungrouped first; an option template, an Option's own content; empty lists, `inProgress`, `dropdownHeight`; disabled, read-only, `validationStatus`; `setValue` and `focus` |
| 25 | AutoComplete | Keywords, Enter on the only match, clearing by emptying; several values; created options (`creatable`, `itemCreated`, `maxLength`); an AutoComplete, a multi Select and a searchable Select bound in a Form (required, submit) |
| 26 | Date and time inputs | DateInput in three formats, clearing (also to the initial value), date limits, an empty character, read-only; TimeInput in 24- and 12-hour mode with seconds, office hours with `invalidTime` and clamping; `isoValue()`; `setValue` and `focus` |
| 26 | DatePicker | Typed fields with a calendar popup; a range in two clicks with presets; inline calendars limited to June with disabled weekends and a holiday, Monday first; German labels and week numbers; a DateInput, a TimeInput and a range DatePicker bound in a Form |

Steps 11–13 (standalone mode, build-time compilation, prerendering) are how
the playground itself is delivered: `npm run playground:preview` serves the
prerendered build.

## Adding a scenario

1. **Create `src/components/<Name>Scenario.gui`.** Start with `ScenarioHeader`,
   then the scenario's own content:

   ```xml
   <Component name="ClockScenario">
     <VStack>
       <ScenarioHeader title="Clock" description="What this scenario checks."/>
       <VStack var.time="{new Date().toLocaleTimeString()}">
         <Button label="Refresh" onClick="time = new Date().toLocaleTimeString()"/>
         <Text>{time}</Text>
       </VStack>
     </VStack>
   </Component>
   ```

   - **No `gap` or `padding`:** the spacing is automatic (steps 19D–19F).
     Set one only when a section really needs another value.

   - **The `title` should match the dashboard entry.** The smoke test
     checks it.
   - **Code-behind** goes in `src/components/<Name>Scenario.gui.xs`: top-level
     `var` and `function` only.

2. **Add an entry to `scenarios` in `src/Main.gui`:**

   ```js
   { path: '/clock', title: 'Clock', description: 'What it checks.' },
   ```

   Then add its page to `<Pages>`, with its source below it:

   ```xml
   <Page url="/clock">
     <VStack><ClockScenario/><ScenarioSource file="ClockScenario"/></VStack>
   </Page>
   ```

   The side nav lists the new entry by itself.

3. **Update `e2e/playground.spec.ts`:** add the title to its list of
   expected dashboard buttons. It opens every scenario, checks that its
   source is shown, and fails on any page or console error.
   `e2e/playground-scenarios.spec.ts` checks that each scenario does what
   its page says. Add a test there too.

## Things to know

- **`LiveMarkup`** (`src/react/LiveMarkup.tsx`) compiles markup in the browser
  (the live compiler scenario), so the playground bundle includes the compiler.
- **The mock backend** (`src/backend.ts`) runs in a service worker, in dev
  and in the preview build (`gfuiMockBackend` in `vite.config.ts`). The app
  makes ordinary requests to `/api/people`; the Data scenario's network
  panel steers the backend through `/__mock` ([mock-backend.md](../.ai/docs/mock-backend.md)).
- **`SpacingInspector`** (`src/react/SpacingInspector.tsx`) outlines every
  stack and labels it with its level, orientation and computed gap (and a
  surface's padding). The spacing demo (`src/layouts/spacing.gui`) has it;
  `LayoutPreview group="spacing"` shows that demo in a frame.
- **`ScenarioSource`** (`src/react/ScenarioSource.tsx`) is the playground's own
  React component, used from markup. It is registered with the gfui Vite
  plugin's `extensions` option (`vite.config.ts`), with its metadata (its
  props are checked like a built-in's). It reads the sources with
  `import.meta.glob(…, { query: "?raw" })`.
- **IDs inside slot content** (or any template) belong to that content's
  instance: a scenario's content could also be wrapped in a component with a
  `<Slot/>`.
- **A page's state starts fresh on every visit:** only the active page is
  mounted.
- **The app's theme and tone are shared by every page:**
  `toggleThemeTone()` persists while you navigate.
- **Compile errors** show in Vite's overlay, with the file, line and
  column.
- **The App shell demos** are a second page, `layouts.html?layout=<name>`
  (`src/layouts.tsx`), one App per file in `src/layouts/`. Each layout is a
  whole App, and the shell's state is per page, so they can't be routes of
  the playground. They share `LayoutDemoLinks` and `LayoutDemoPages`
  (`src/components/`). `LayoutPreview` (`src/react/`) frames them;
  `e2e/app-shell.spec.ts` measures them. The production build has both
  pages; only `index.html` is prerendered.
