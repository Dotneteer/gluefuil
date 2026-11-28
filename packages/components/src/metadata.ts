// React-free entry point: component metadata (and the theme engine). The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @gluefuil/runtime. The boundary test in tools/ enforces this.

import { BEHAVIORS, type BehaviorMetadata } from "./behaviors-metadata";
import { ICON_NAMES } from "./icon-names";
import { LAYOUT_PROPS, type LayoutValueKind } from "./layout-metadata";
import { themeVariables, TONES } from "./theming/engine";
import { BUILT_IN_THEME_MAP, THEME_IDS } from "./theming/themes";

/**
 * The contract of a component: what markup may set, handle and call. One
 * format for built-ins, wrapped React components and user-defined components
 * (whose metadata the compiler derives). The compiler checks markup against
 * it (.ai/plan/poc-15-contracts.md).
 */
export interface ComponentMetadata {
  description: string;
  /** Props settable from markup attributes. */
  props: Record<string, PropMetadata>;
  /** Events, by name: `click` is handled by `onClick="…"` or `<event name="click">`. */
  events?: Record<string, EventMetadata>;
  /** What `id` exposes: values and methods (`textBox.value`, `textBox.setValue(v)`). */
  api?: Record<string, { description: string }>;
  /**
   * Template props (`<property name="itemTemplate">…</property>`) and the
   * context variables each template's content can read (`$item`).
   */
  templates?: Record<string, { description: string; contextVars: string[] }>;
  /** The template the element's children are, when given as plain children (`Items`: itemTemplate). */
  childrenTemplate?: string;
  /**
   * The children are data (step 25: Select, AutoComplete): `Option` and `Items`
   * (with `Option` inside) compile to one reactive options array, the hidden
   * binding `$$options`. Other children are E035; with `data` set, E036.
   */
  childrenAsOptions?: boolean;
  /**
   * Context variables the element's attributes and children see, without
   * being a template (step 22: Form's `$data`). The compiler gives the
   * component a `contextScope` to fill; IDs inside stay file-scoped.
   */
  childContextVars?: readonly string[];
  /**
   * The element's content is text kept as written (step 23: Markdown): no `{…}`
   * interpolation and no whitespace collapsing; `@{…}` are compiled bindings.
   * The component receives the parts as `$$parts` (strings and values) or, with
   * no binding, the text as `children`. Elements inside are E034.
   */
  rawText?: boolean;
  /** Any attribute is accepted as a prop (no unknown-prop check). */
  allowArbitraryProps?: boolean;
  /**
   * Step 34 (I18n): a `<property name="x">` with markup and no template of that
   * name is a template anyway, passed as the prop `$$slot.x`, with these context
   * variables.
   */
  arbitraryTemplates?: { contextVars: string[] };
  /** Any event is accepted (no unknown-event check). */
  allowArbitraryEvents?: boolean;
  /**
   * The theme variables the component reads, with their defaults
   * (`"backgroundColor-Button": "$color-primary-500"`). Every theme can
   * override them.
   */
  themeVars?: Record<string, string>;
  /** Attributes besides `props` are theme variables, checked against the known names (`Theme`). */
  themeVarAttributes?: boolean;
  /** Renders no visual element of its own: behaviors never attach (`Items`, `Theme`). */
  nonVisual?: boolean;
  /** A route of `Pages` (`Page`): it may not use `when` or variables, which would wrap it (E027). */
  isRoute?: boolean;
  /**
   * The App shell (step 19A): direct children of these component names are
   * regions, passed to the component as the given props (`AppHeader` →
   * `$$header`) instead of as children, with `$$shell` describing them.
   */
  regions?: Record<string, string>;
  /** A shell region (`AppHeader`, `NavPanel`, `Footer`): allowed only as a direct child of a component with `regions` (E028). */
  isRegion?: boolean;
  /**
   * Props that no longer exist, with what to use instead (E030). `byValue`
   * gives a more specific message for a literal value (`layout="vertical"`).
   */
  removedProps?: Record<string, { message: string; byValue?: Record<string, string> }>;
  /**
   * `when` is a prop of the component (a loader that stays mounted and doesn't
   * fetch), not the visibility of the element (step 20: DataSource).
   */
  whenIsProp?: boolean;
  /** Its event handlers return the handler's result (APICall: `beforeRequest` false skips the call). */
  eventResults?: boolean;
  /** The component no longer exists: using it is E032 with this message (`FlowLayout`). */
  removed?: string;
  /** Using the component is a warning with this message (E024; step 32: ToneChangerButton). */
  deprecationMessage?: string;
  /**
   * Step 32: XMLUI API members left out, with why (IFrame's `getContentWindow`):
   * using one is C015 with this message instead of "did you mean".
   */
  removedApi?: Record<string, string>;
  /** Step 32: the component receives its literal `id` as `$$id` (Bookmark: the anchor's DOM id). */
  receivesId?: boolean;
  /**
   * Step 32B: the component can be an `<event>`'s content (`<event name="click"><APICall …/></event>`):
   * the event runs it (its static `runAction`) with every prop deferred (`$param`, `$params`).
   * `"only"`: it can't be anywhere else (FileUpload, FileDownload: E037).
   */
  action?: true | "only";
  /**
   * The component is another one with fixed props (`HStack` is `Stack`
   * with `orientation="horizontal"`). The compiler renders `component`;
   * markup values win over `props`.
   */
  alias?: { component: string; props: Record<string, string> };
  /**
   * Step 28: the children's headers are data (Tabs: TabItem, Stepper: Step). The
   * `item` children (also inside an `Items`) compile to one reactive array, the
   * hidden binding `$$headers`, of `{ $$key, …fields }` (`fields`: the item's
   * props and `id`; its `headerTemplate` as `$$headerTemplate` with `$$scope`).
   * The children still compile in place, each item with the same `$$key`, so
   * their content keeps file-scoped IDs. Other children are E038.
   */
  childrenAsHeaders?: { item: string };
  /**
   * Step 30: the children are column definitions (Table: Column). Each `item`
   * child (also inside an `Items`) compiles to one entry of the hidden binding
   * `$$columns`: `{ $$key, …props, $$cell, $$scope, $$handlers }`. Its children
   * are the item's `cellTemplate`; nothing compiles in place. Other children: E040.
   */
  childrenAsColumns?: string;
  /**
   * Step 28: context variables each direct child gets in its own scope
   * (ResponsiveBar's `$overflow`); the component sets them per child
   * (`ChildContextValues`). IDs stay file-scoped.
   */
  perChildContextVars?: readonly string[];
  /**
   * The element opens when it mounts if it has `when` (step 27: a ModalDialog with
   * `when` is open while the condition holds). The compiler passes `$$whenOpen`.
   */
  openedByWhen?: boolean;
  /**
   * The components this one must be inside (step 27: a MenuItem in a DropdownMenu,
   * ContextMenu or SubMenuItem). `Items` and templates between them are fine, and
   * so is the root of a `<Component>` (its use site can't be checked). Else E037.
   */
  parents?: readonly string[];
  /** `false`: the layout props (LAYOUT_PROPS: width, padding, …) are not accepted. Non-visual components never accept them. */
  layoutProps?: false;
  /**
   * Theme variables the component reads that have no default (`gap-Stack`):
   * known names, so a theme can set them, but undefined until it does.
   */
  optionalThemeVars?: readonly string[];
}

/** The literal value types the compiler checks (an attribute without `{…}`). */
export type PropValueType = "string" | "boolean" | "number" | "integer" | "any";

export interface PropMetadata {
  description: string;
  /** Default "any": no check. `boolean` literals are `true` or `false`. */
  valueType?: PropValueType;
  /** The only values a literal may have (a closed enum). */
  availableValues?: readonly string[];
  /** The values a literal is expected to have; another one is a warning (E033), not an error (icon names: an app may register more). */
  knownValues?: readonly string[];
  /** Markup must set it. */
  isRequired?: boolean;
  /** Using it is a warning with this message. */
  deprecationMessage?: string;
  /** Only a literal value is accepted (no `{…}`): E026. Route patterns, for example. */
  isLiteral?: boolean;
  /**
   * Evaluated when the component asks, with these context variables, not as
   * a binding (APICall's `url` and `body` with `$param`, `$params`). The
   * component receives a function of the context (step 20).
   */
  deferred?: readonly string[];
  /** A literal without `{…}` is still an expression (`transformResult="(d) => d.items"`, as in XMLUI). */
  code?: boolean;
  /** An interpolation with a null or undefined part is undefined as a whole (a URL that can't be built yet). */
  nullishUnresolved?: boolean;
  /** A CSS value: literals are checked as one (E031), `$name` is a theme variable. */
  cssKind?: LayoutValueKind;
  /** With `cssKind: "size"`: star sizes (`*`, `2*`) are allowed. */
  star?: boolean;
  /**
   * Only the component's: an attached behavior that declares the same prop
   * doesn't get it (step 26: DateInput's `minValue` is a date, not the
   * validation's numeric range). Without it, a shared prop goes to both (step 24).
   */
  exclusive?: boolean;
  /**
   * Step 29 (List `syncWithVar`): the literal names a variable visible here (else
   * E039). The component receives the variable's value, and a hidden handler
   * `$$set<Prop>` (`$$setSyncWithVar`) that assigns its argument to it.
   */
  variableName?: boolean;
}

export interface EventMetadata {
  description: string;
  /**
   * What the handler receives (step 27). Default: arguments, so a statement
   * handler declares `$param` and `$params`. `"none"`: no arguments; `"pointer"`:
   * a frozen pointer snapshot (`{ clientX, clientY, button, … }`), which only a
   * function handler (`ev => …`) names. For both, a statement handler declares
   * no `$param`/`$params`, so an enclosing one (a ModalDialog's) stays visible.
   */
  args?: "none" | "pointer";
  /** Handling it is a warning with this message. */
  deprecationMessage?: string;
}

/** XMLUI's Text variants that gfui implements (text.tsx). */
const TEXT_VARIANTS = [
  "abbr", "caption", "cite", "code", "deleted", "em", "inserted", "keyboard", "marked", "mono", "paragraph",
  "placeholder", "sample", "secondary", "small", "strong", "sub", "subheading", "subtitle", "sup", "title", "var",
];

const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6", "H1", "H2", "H3", "H4", "H5", "H6", "1", "2", "3", "4", "5", "6"];

const HEADING_THEME_VARS: Record<string, string> = {
  "textColor-Heading": "$textColor",
  "fontWeight-Heading": "600",
  "lineHeight-Heading": "1.25",
  "color-anchor-Heading": "$color-surface-400",
  "fontSize-H1": "2em",
  "fontSize-H2": "1.5em",
  "fontSize-H3": "1.25em",
  "fontSize-H4": "1.1em",
  "fontSize-H5": "1em",
  "fontSize-H6": "0.9em",
};

/** The text-overflow props of Text, Heading and Link (text.tsx textOverflow; XMLUI Text.md). */
const TEXT_OVERFLOW_PROPS: Record<string, PropMetadata> = {
  maxLines: { description: "Truncates the text at this many lines: one line ends in an ellipsis, more are clamped.", valueType: "integer" },
  overflowMode: {
    description:
      "none: one line, clipped; ellipsis: truncated with an ellipsis (at maxLines, or one line); scroll: one line that scrolls sideways; flow: wraps, and scrolls vertically in a constrained height. none, scroll and flow ignore maxLines.",
    valueType: "string",
    availableValues: ["none", "ellipsis", "scroll", "flow"],
  },
  breakMode: {
    description: "normal (word boundaries), word (long words break), anywhere (any character), keep (no breaks inside words), hyphenate.",
    valueType: "string",
    availableValues: ["normal", "word", "anywhere", "keep", "hyphenate"],
  },
  ellipses: { description: "false: truncated text is clipped without an ellipsis (default true).", valueType: "boolean" },
  preserveLinebreaks: { description: "Keeps the line breaks of `value` (nested text has its line breaks collapsed by the markup).", valueType: "boolean" },
};

const HEADING_PROPS: Record<string, PropMetadata> = {
  value: { description: "The heading text. Nested text is used when it is absent.", valueType: "any" },
  ...TEXT_OVERFLOW_PROPS,
  showAnchor: { description: "Shows a # link to the heading (its anchor id comes from its text), on hover.", valueType: "boolean" },
  omitFromToc: { description: "Leaves the heading out of the TableOfContents.", valueType: "boolean" },
};

const HEADING_API = {
  hasOverflow: { description: "Whether the text is cut off (it overflows its box)." },
  scrollIntoView: { description: "Scrolls the heading into view." },
};

function headingShortcut(level: number): ComponentMetadata {
  return {
    description: `A level ${level} heading (Heading level="h${level}").`,
    props: HEADING_PROPS,
    api: HEADING_API,
  };
}

const ALIGNMENTS = ["start", "center", "end", "stretch"];

/** Step 24: what every input has. `required`, `minLength`, … are the validation behavior's (forms). */
const INPUT_COMMON: Record<string, PropMetadata> = {
  enabled: { description: "false: disabled.", valueType: "boolean" },
  readOnly: { description: "The value shows but can't be changed.", valueType: "boolean" },
  autoFocus: { description: "Takes the keyboard focus when it mounts.", valueType: "boolean" },
  validationStatus: {
    description: "A validation state to show without a form: none (default), valid, warning, error. In a form, the field's state wins.",
    valueType: "string",
    availableValues: ["none", "valid", "warning", "error"],
  },
};

const FOCUS_EVENTS: Record<string, EventMetadata> = {
  gotFocus: { description: "The input got the keyboard focus. No arguments.", args: "none" },
  lostFocus: { description: "The input lost the keyboard focus. No arguments.", args: "none" },
};

/** startText, endText, startIcon, endIcon: adornments inside the input's edges. */
const ADORNMENT_PROPS: Record<string, PropMetadata> = {
  startText: { description: "Text inside the input, before the value.", valueType: "string" },
  endText: { description: "Text inside the input, after the value.", valueType: "string" },
  startIcon: { description: "An icon inside the input, before the value.", valueType: "string", knownValues: ICON_NAMES },
  endIcon: { description: "An icon inside the input, after the value.", valueType: "string", knownValues: ICON_NAMES },
};

/** The native text-entry attributes, forwarded to the input element. */
const TEXT_ENTRY_PROPS: Record<string, PropMetadata> = {
  placeholder: { description: "Shown while the text is empty.", valueType: "string" },
  autoComplete: { description: "The browser's autocomplete hint (off, on, email, current-password, …).", valueType: "string" },
  autoCapitalize: { description: "Mobile keyboards: off, none, sentences, words, characters.", valueType: "string", availableValues: ["off", "none", "sentences", "words", "characters"] },
  autoCorrect: { description: "Mobile keyboards: on or off.", valueType: "string" },
  spellCheck: { description: "The browser's spell check.", valueType: "boolean" },
};

const TEXT_API = {
  value: { description: "The current text (reactive)." },
  setValue: { description: "Replaces the text (no didChange)." },
  focus: { description: "Moves the keyboard focus to the input." },
};

/** TextBox's theme variables, for one text input (step 16's names). */
function textInputTheme(name: string): Record<string, string> {
  return {
    [`backgroundColor-${name}`]: "$backgroundColor",
    [`textColor-${name}`]: "$textColor",
    [`borderColor-${name}`]: "$borderColor",
    [`borderColor-${name}--focus`]: "$color-primary-500",
    [`borderRadius-${name}`]: "$borderRadius",
  };
}

const PASSWORD_PROPS: Record<string, PropMetadata> = {
  showPasswordToggle: { description: "A button that shows and hides the password.", valueType: "boolean" },
  passwordVisibleIcon: { description: "The toggle's icon while the password is hidden (default eye).", valueType: "string", knownValues: ICON_NAMES },
  passwordHiddenIcon: { description: "The toggle's icon while the password shows (default eye-off).", valueType: "string", knownValues: ICON_NAMES },
};

/** Step 25: what Select and AutoComplete share (choice.tsx). */
const CHOICE_PROPS: Record<string, PropMetadata> = {
  // Its own label (Mantine's <label for>), not the label behavior's wrapper: the list must not be inside a <label>.
  label: { description: "The input's label.", valueType: "string" },
  initialValue: { description: "The selected value (or values) when the component mounts.", valueType: "any" },
  placeholder: { description: "Shown while nothing is selected.", valueType: "string" },
  ...INPUT_COMMON,
  data: { description: "The options as data: strings, or objects read through valueField and labelField. Instead of Option children.", valueType: "any" },
  valueField: { description: "The field of each data item that is the option's value (default value).", valueType: "string" },
  labelField: { description: "The field of each data item that is the option's label (default label).", valueType: "string" },
  dropdownHeight: { description: "The list's largest height (default 220px); it scrolls beyond.", valueType: "string" },
  groupBy: { description: "The option field that groups the list (an Option attribute such as category); the ungrouped come first.", valueType: "string" },
};

const CHOICE_TEMPLATES = {
  optionTemplate: { description: "An option in the list.", contextVars: ["$item", "$selectedValue", "$checked", "$inTrigger"] },
  emptyListTemplate: { description: "Shown when no option is left (default: \"List is empty\").", contextVars: [] },
  groupHeaderTemplate: { description: "A group's header (groupBy).", contextVars: ["$group"] },
  ungroupedHeaderTemplate: { description: "The header of the ungrouped options (default: none).", contextVars: [] },
};

function choiceTheme(name: string): Record<string, string> {
  return {
    ...textInputTheme(name),
    [`backgroundColor-menu-${name}`]: "$backgroundColor",
    [`borderColor-menu-${name}`]: "$borderColor",
    [`backgroundColor-item-${name}--hover`]: "$color-surface-100",
    [`backgroundColor-${name}-badge`]: "$color-primary-500",
    [`textColor-${name}-badge`]: "#ffffff",
  };
}

const CHOICE_API = {
  value: { description: "The selected value (\"\" when none), or the array of values (reactive)." },
  setValue: { description: "Selects a value, or values (no didChange)." },
  focus: { description: "Moves the keyboard focus to the input." },
};

const CHOICE_COMPONENTS: Record<string, ComponentMetadata> = {
  Select: {
    description: "Picks one value, or several, from a list: Option children (also from Items) or data (Mantine Combobox).",
    childrenAsOptions: true,
    props: {
      ...CHOICE_PROPS,
      searchable: { description: "Typing filters the options (value, label and keywords).", valueType: "boolean" },
      multiSelect: { description: "Several values: the value is an array, shown as pills.", valueType: "boolean" },
      clearable: { description: "A button that clears the selection.", valueType: "boolean" },
      inProgress: { description: "The list shows inProgressNotificationMessage instead of the options.", valueType: "boolean" },
      inProgressNotificationMessage: { description: "The message while inProgress.", valueType: "string" },
    },
    events: {
      didChange: { description: "The user changed the selection; `$param` is the new value (\"\" or [] when cleared)." },
      ...FOCUS_EVENTS,
    },
    templates: {
      ...CHOICE_TEMPLATES,
      valueTemplate: { description: "A selected value in the input (each pill with multiSelect); $itemContext.removeItem() removes it.", contextVars: ["$item", "$itemContext"] },
    },
    themeVars: choiceTheme("Select"),
    api: CHOICE_API,
  },
  AutoComplete: {
    description: "A searchable select: type to filter the options, pick one or several (multi), or create one (creatable) (Mantine Combobox).",
    childrenAsOptions: true,
    props: {
      ...CHOICE_PROPS,
      multi: { description: "Several values: the value is an array, shown as pills.", valueType: "boolean" },
      creatable: { description: "The user can create an option that isn't in the list (a \"Create …\" item).", valueType: "boolean" },
      initiallyOpen: { description: "The list is open when the component mounts.", valueType: "boolean" },
      maxLength: { description: "The most characters the input takes.", valueType: "integer" },
    },
    events: {
      didChange: { description: "The user changed the selection; `$param` is the new value (\"\" or [] when cleared)." },
      itemCreated: { description: "The user created an option (creatable); `$param` is its text." },
      ...FOCUS_EVENTS,
    },
    templates: {
      ...CHOICE_TEMPLATES,
      valueTemplate: { description: "A selected value's pill (multi); $itemContext.removeItem() removes it.", contextVars: ["$item", "$itemContext"] },
    },
    themeVars: choiceTheme("AutoComplete"),
    api: CHOICE_API,
  },
};

/** Step 26: the date and time inputs (dates.tsx; the Mantine parts are a lazy chunk). */
const DATE_FORMAT_PROP: PropMetadata = {
  description: "The date's format, and the value's: MM/dd/yyyy (default), MM-dd-yyyy, yyyy/MM/dd, yyyy-MM-dd, dd/MM/yyyy, dd-MM-yyyy, yyyyMMdd, MMddyyyy.",
  valueType: "string",
  availableValues: ["MM/dd/yyyy", "MM-dd-yyyy", "yyyy/MM/dd", "yyyy-MM-dd", "dd/MM/yyyy", "dd-MM-yyyy", "yyyyMMdd", "MMddyyyy"],
};
const DATES_COMMON: Record<string, PropMetadata> = {
  // Their own label (Mantine's), not the label behavior's wrapper: several fields, and a calendar popup.
  label: { description: "The input's label.", valueType: "string" },
  ...INPUT_COMMON,
  ...ADORNMENT_PROPS,
  clearable: { description: "A button that clears the value.", valueType: "boolean" },
};
const CLEAR_PROPS: Record<string, PropMetadata> = {
  clearToInitialValue: { description: "Clearing goes back to the initial value instead of empty.", valueType: "boolean" },
  emptyCharacter: { description: "The fields' placeholder character (default -).", valueType: "string" },
};
const WEEKDAYS = ["0", "1", "2", "3", "4", "5", "6"];
const DATES_EVENTS: Record<string, EventMetadata> = {
  didChange: { description: "The user changed the value; `$param` is the new value." },
  ...FOCUS_EVENTS,
};

const DATE_COMPONENTS: Record<string, ComponentMetadata> = {
  DateInput: {
    description: "A date typed into day, month and year fields (Mantine MaskedDateInput). The value is a string in dateFormat, or null.",
    props: {
      ...DATES_COMMON,
      ...CLEAR_PROPS,
      initialValue: { description: "The date when the component mounts (in dateFormat, or YYYY-MM-DD).", valueType: "string" },
      dateFormat: DATE_FORMAT_PROP,
      // The component's: dates, not the validation's numeric range.
      minValue: { description: "The earliest date (in dateFormat); an earlier one is invalid.", valueType: "string", exclusive: true },
      maxValue: { description: "The latest date (in dateFormat); a later one is invalid.", valueType: "string", exclusive: true },
      mode: { description: "Accepted for compatibility with DatePicker; only single dates (XMLUI doesn't implement range either).", valueType: "string", availableValues: ["single", "range"] },
      weekStartsOn: { description: "Accepted for compatibility with DatePicker; no effect.", valueType: "string", availableValues: WEEKDAYS },
      showWeekNumber: { description: "Accepted for compatibility with DatePicker; no effect.", valueType: "boolean" },
      inline: { description: "Accepted for compatibility with DatePicker; no effect.", valueType: "boolean" },
      disabledDates: { description: "Accepted for compatibility with DatePicker; no effect.", valueType: "any" },
    },
    events: DATES_EVENTS,
    themeVars: textInputTheme("DateInput"),
    api: {
      value: { description: "The date in dateFormat, or null (reactive)." },
      setValue: { description: "Sets the date (in dateFormat, or YYYY-MM-DD)." },
      focus: { description: "Moves the focus to the first field." },
      isoValue: { description: "The date as YYYY-MM-DD, or null." },
    },
  },
  TimeInput: {
    description: "A time typed into hour, minute (and second) fields, with AM/PM in 12-hour mode (Mantine TimePicker). The value is HH:mm[:ss] or hh:mm[:ss] am, or null.",
    props: {
      ...DATES_COMMON,
      ...CLEAR_PROPS,
      initialValue: { description: "The time when the component mounts (HH:mm[:ss], or hh:mm am).", valueType: "string" },
      hour24: { description: "24-hour fields (default true); false: 12-hour with AM/PM.", valueType: "boolean" },
      seconds: { description: "A seconds field.", valueType: "boolean" },
      minTime: { description: "The earliest time (HH:mm[:ss]); an earlier one is clamped on blur (invalidTime fires).", valueType: "string" },
      maxTime: { description: "The latest time (HH:mm[:ss]); a later one is clamped on blur (invalidTime fires).", valueType: "string" },
    },
    events: {
      ...DATES_EVENTS,
      invalidTime: { description: "A typed time is outside minTime/maxTime; `$param` is it." },
    },
    themeVars: textInputTheme("TimeInput"),
    api: {
      value: { description: "The time, or null (reactive)." },
      setValue: { description: "Sets the time." },
      focus: { description: "Moves the focus to the hour field." },
      isoValue: { description: "The time as 24-hour HH:mm:ss, or null." },
    },
  },
  DatePicker: {
    description: "Picks a date, or a range, in a calendar: inline, or in a popup under typed date fields (Mantine DatePicker). The value is a string in dateFormat, or { from, to }.",
    props: {
      ...DATES_COMMON,
      initialValue: { description: "The date (in dateFormat, or YYYY-MM-DD), or { from, to } in range mode.", valueType: "any" },
      placeholder: { description: "Accepted for compatibility; the fields show their empty characters.", valueType: "string" },
      mode: { description: "single (default) or range.", valueType: "string", availableValues: ["single", "range"] },
      dateFormat: DATE_FORMAT_PROP,
      inline: { description: "The calendar is part of the layout, not a popup.", valueType: "boolean" },
      startDate: { description: "The earliest date the calendar offers (in dateFormat, or YYYY-MM-DD).", valueType: "string" },
      endDate: { description: "The latest date the calendar offers.", valueType: "string" },
      disabledDates: { description: "Days that can't be picked: dates, { from, to }, { before }, { after }, { before, after }, { dayOfWeek }, true, or an array of them.", valueType: "any" },
      weekStartsOn: { description: "The first day of the week: 0 (Sunday, default) … 6.", valueType: "string", availableValues: WEEKDAYS },
      showWeekNumber: { description: "Week numbers in the calendar.", valueType: "boolean" },
      showWeekNumbers: { description: "The same as showWeekNumber.", valueType: "boolean" },
      numOfMonths: { description: "Months shown side by side (default 1; 2 for a range in a popup).", valueType: "integer" },
      locale: { description: "The calendar's language (BCP 47, default en-US).", valueType: "string" },
      timeZone: { description: "Accepted for compatibility; values are calendar dates.", valueType: "string" },
      showPresets: { description: "Range presets (last 7 days, last 30 days, this month, last month) beside the calendar.", valueType: "boolean" },
      presets: { description: "The range presets: keys (last7Days, thisMonth, …, a comma-separated string or an array), { value, label }, or { label, from, to }. Turns them on.", valueType: "any" },
    },
    events: DATES_EVENTS,
    themeVars: {
      ...textInputTheme("DatePicker"),
      "backgroundColor-menu-DatePicker": "$backgroundColor",
      "borderColor-menu-DatePicker": "$borderColor",
    },
    api: {
      value: { description: "The date, or { from, to }; undefined when empty (reactive)." },
      getValue: { description: "The same as value." },
      setValue: { description: "Sets the date, or { from, to }." },
      focus: { description: "Moves the focus to the (first) date field." },
    },
  },
};

/** Step 24 (with step 16's TextBox and Checkbox): the inputs of inputs.tsx. */
const INPUT_COMPONENTS: Record<string, ComponentMetadata> = {
  TextBox: {
    description: "A single-line text input (Mantine TextInput; PasswordInput for type=\"password\").",
    props: {
      initialValue: { description: "The text when the component mounts.", valueType: "any" },
      type: { description: "text (default), password, search or email.", valueType: "string", availableValues: ["text", "password", "search", "email"] },
      ...INPUT_COMMON,
      ...TEXT_ENTRY_PROPS,
      ...ADORNMENT_PROPS,
      ...PASSWORD_PROPS,
    },
    events: {
      didChange: { description: "The text changed by typing; `$param` is the new text." },
      ...FOCUS_EVENTS,
    },
    themeVars: {
      ...textInputTheme("TextBox"),
      // The validation states without a form (validationStatus), for every input.
      "borderColor-Input--error": "$color-danger-500",
      "borderColor-Input--warning": "$color-warn-500",
      "borderColor-Input--success": "$color-success-500",
      "textColor-adornment-Input": "$textColor-secondary",
    },
    api: TEXT_API,
  },
  PasswordInput: {
    description: "A text input whose text is masked (Mantine PasswordInput).",
    props: {
      initialValue: { description: "The text when the component mounts.", valueType: "any" },
      ...INPUT_COMMON,
      ...TEXT_ENTRY_PROPS,
      ...ADORNMENT_PROPS,
      ...PASSWORD_PROPS,
    },
    events: {
      didChange: { description: "The text changed by typing; `$param` is the new text." },
      ...FOCUS_EVENTS,
    },
    themeVars: textInputTheme("PasswordInput"),
    api: TEXT_API,
  },
  TextArea: {
    description: "A multi-line text input (Mantine Textarea).",
    props: {
      initialValue: { description: "The text when the component mounts.", valueType: "any" },
      ...INPUT_COMMON,
      ...TEXT_ENTRY_PROPS,
      rows: { description: "The number of lines shown (default 2).", valueType: "integer" },
      autoSize: { description: "Grows with the text, between minRows and maxRows.", valueType: "boolean" },
      minRows: { description: "With autoSize: the fewest lines.", valueType: "integer" },
      maxRows: { description: "With autoSize: the most lines; it scrolls after that.", valueType: "integer" },
      resize: { description: "Whether the user can resize it: horizontal, vertical, both (default: none).", valueType: "string", availableValues: ["horizontal", "vertical", "both"] },
      enterSubmits: { description: "In a Form: Enter submits it (default true); Shift+Enter is a new line. false: Enter is a new line.", valueType: "boolean" },
      escResets: { description: "In a Form: Escape resets the form.", valueType: "boolean" },
    },
    events: {
      didChange: { description: "The text changed by typing; `$param` is the new text." },
      ...FOCUS_EVENTS,
    },
    themeVars: textInputTheme("TextArea"),
    api: { ...TEXT_API, insert: { description: "Inserts text at the cursor (replacing the selection), as typing would; no didChange." } },
  },
  NumberBox: {
    description: "A number input with a spin box (Mantine NumberInput). Its value is a number, or undefined while empty.",
    props: {
      initialValue: { description: "The number when the component mounts.", valueType: "number" },
      placeholder: { description: "Shown while it is empty.", valueType: "string" },
      ...INPUT_COMMON,
      ...ADORNMENT_PROPS,
      minValue: { description: "The smallest value: a smaller one becomes it when the input loses the focus.", valueType: "number" },
      maxValue: { description: "The largest value: a larger one becomes it when the input loses the focus.", valueType: "number" },
      step: { description: "What the arrows (keys and spin box) add or take (default 1).", valueType: "number" },
      integersOnly: { description: "No decimal separator.", valueType: "boolean" },
      zeroOrPositive: { description: "No negative numbers.", valueType: "boolean" },
      hasSpinBox: { description: "The up and down buttons (default true).", valueType: "boolean" },
    },
    events: {
      didChange: { description: "The number changed; `$param` is the new value (undefined while empty or incomplete)." },
      ...FOCUS_EVENTS,
    },
    themeVars: textInputTheme("NumberBox"),
    api: { value: { description: "The current number, or undefined (reactive)." }, setValue: { description: "Sets the number (no didChange)." }, focus: TEXT_API.focus },
  },
  Checkbox: {
    description: "A checkbox with its own label (Mantine Checkbox).",
    props: {
      label: { description: "The checkbox's label.", valueType: "string" },
      initialValue: { description: "Checked when the component mounts.", valueType: "boolean" },
      indeterminate: { description: "Shows a dash: neither checked nor unchecked (the value doesn't change).", valueType: "boolean" },
      ...INPUT_COMMON,
    },
    events: {
      click: { description: "Clicked. The handler receives no arguments.", args: "none" },
      didChange: { description: "Checked or unchecked by the user; `$param` is the new state." },
      ...FOCUS_EVENTS,
    },
    themeVars: {
      "backgroundColor-Checkbox--checked": "$color-primary-500",
      "borderRadius-Checkbox": "$borderRadius",
    },
    api: {
      value: { description: "Whether it is checked (reactive)." },
      setValue: { description: "Checks or unchecks it." },
      focus: TEXT_API.focus,
    },
  },
  Switch: {
    description: "An on/off switch with its own label (Mantine Switch).",
    props: {
      label: { description: "The switch's label.", valueType: "string" },
      initialValue: { description: "On when the component mounts.", valueType: "boolean" },
      ...INPUT_COMMON,
    },
    events: {
      click: { description: "Clicked. The handler receives no arguments.", args: "none" },
      didChange: { description: "Turned on or off by the user; `$param` is the new state." },
      ...FOCUS_EVENTS,
    },
    themeVars: {
      "backgroundColor-checked-Switch": "$color-primary-500",
      "backgroundColor-Switch": "$color-surface-200",
      "backgroundColor-indicator-Switch": "#ffffff",
    },
    api: {
      value: { description: "Whether it is on (reactive)." },
      setValue: { description: "Turns it on or off." },
      focus: TEXT_API.focus,
    },
  },
  RadioGroup: {
    description: "One choice of several: Option children (anywhere inside, also from Items), shown as radio buttons (Mantine Radio.Group).",
    props: {
      label: { description: "The group's label.", valueType: "string" },
      initialValue: { description: "The selected option's value when the component mounts (values are strings).", valueType: "any" },
      orientation: { description: "vertical (default) or horizontal.", valueType: "string", availableValues: ["vertical", "horizontal"] },
      ...INPUT_COMMON,
    },
    events: {
      didChange: { description: "Another option was selected; `$param` is its value." },
      ...FOCUS_EVENTS,
    },
    themeVars: { "backgroundColor-checked-RadioGroupOption": "$color-primary-500" },
    api: {
      value: { description: "The selected value (reactive); \"\" when none." },
      setValue: { description: "Selects the option with this value." },
      focus: { description: "Moves the focus to the selected option (or the first)." },
    },
  },
  Option: {
    description: "One choice of a RadioGroup, a Select or an AutoComplete: a value and its label. In a Select or AutoComplete it is data: any other attribute is kept on the option (for groupBy), and element children are its content in the list.",
    props: {
      value: { description: "The value it stands for (a string; numbers and booleans are converted).", valueType: "any" },
      label: { description: "The text shown. Nested content is used when it is absent, then the value.", valueType: "string" },
      enabled: { description: "false: it can't be selected.", valueType: "boolean" },
      keywords: { description: "Select, AutoComplete: more words the search matches (not shown).", valueType: "any" },
    },
    layoutProps: false,
  },
  Slider: {
    description: "Picks a number, or a range of two, by dragging (Mantine Slider and RangeSlider).",
    props: {
      label: { description: "The slider's label (it also names the thumbs).", valueType: "string" },
      initialValue: { description: "A number, or [from, to] for a range with two thumbs.", valueType: "any" },
      minValue: { description: "The smallest value (default 0).", valueType: "number" },
      maxValue: { description: "The largest value (default 10).", valueType: "number" },
      step: { description: "The distance between values (default 1).", valueType: "number" },
      minStepsBetweenThumbs: { description: "A range: the fewest steps between its thumbs (default 1).", valueType: "integer" },
      showValues: { description: "The value in a tooltip while dragging (default true).", valueType: "boolean" },
      valueFormat: { description: "A function that formats the value for the tooltip: (value) => value + ' %'. A literal is code, as in XMLUI.", valueType: "any", code: true },
      ...INPUT_COMMON,
    },
    events: {
      didChange: { description: "The value changed (while dragging too); `$param` is the new value." },
      didCommit: { description: "The drag (or the key press) ended; `$param` is the final value." },
      ...FOCUS_EVENTS,
    },
    themeVars: {
      "backgroundColor-track-Slider": "$color-surface-200",
      "backgroundColor-range-Slider": "$color-primary-500",
      "backgroundColor-thumb-Slider": "#ffffff",
      "borderColor-thumb-Slider": "$color-primary-500",
    },
    api: {
      value: { description: "The number, or [from, to] (reactive)." },
      setValue: { description: "Moves the thumb (or thumbs)." },
      focus: { description: "Moves the focus to the (first) thumb." },
    },
  },
  ColorPicker: {
    description: "Picks a color: type it, or choose it in a popup (Mantine ColorInput). The value is a hex color.",
    props: {
      // Its own label (Mantine's <label for>), not the label behavior's wrapper: the popup must not be inside a <label>.
      label: { description: "The input's label.", valueType: "string" },
      initialValue: { description: "The color when the component mounts (default #000000).", valueType: "string" },
      placeholder: { description: "Shown while it is empty.", valueType: "string" },
      ...INPUT_COMMON,
    },
    events: {
      didChange: { description: "The color changed; `$param` is the new hex color." },
      ...FOCUS_EVENTS,
    },
    themeVars: textInputTheme("ColorPicker"),
    api: {
      value: { description: "The color (reactive)." },
      setValue: { description: "Sets the color." },
      focus: TEXT_API.focus,
    },
  },
};

/** A click handler's description: no DOM event reaches script. */
/** A pointer event's description: script receives a frozen snapshot, never the DOM event (step 27). */
const CLICK: EventMetadata = { description: "Clicked (or Enter or Space when focused). A function handler receives the pointer: (ev) with ev.clientX, ev.clientY.", args: "pointer" };
const CONTEXT_MENU: EventMetadata = {
  description: "Right-clicked: replaces the browser's menu. A function handler receives the pointer: (ev) => menu.openAt(ev).",
  args: "pointer",
};
const DOUBLE_CLICK: EventMetadata = { description: "Double-clicked. A function handler receives the pointer.", args: "pointer" };

/** XMLUI's named sizes of Icon (xs 12px, sm 16px, md 24px, lg 32px). */
const ICON_SIZES = ["xs", "sm", "md", "lg"];

/** Step 23: the display components (display.tsx, icons.tsx). */
const DISPLAY_COMPONENTS: Record<string, ComponentMetadata> = {
  Icon: {
    description: "An icon from the registry by name (XMLUI's names, drawn with Lucide; registerIcon adds more).",
    props: {
      name: { description: "The icon's name: home, search, trash, email, …", valueType: "string", knownValues: ICON_NAMES },
      fallback: { description: "The icon to show when `name` isn't registered.", valueType: "string", knownValues: ICON_NAMES },
      size: { description: "xs (12px), sm (16px), md (24px), lg (32px), or a CSS size. Default: the theme's size-Icon.", valueType: "string" },
    },
    events: { click: CLICK },
    themeVars: { "size-Icon": "1.2em" },
  },
  Image: {
    description: "A picture from a URL.",
    props: {
      src: { description: "The image's URL. Without one, nothing is shown.", valueType: "string" },
      data: { description: "Step 32B: the image as a File or Blob (a pasted or picked file), shown when there is no `src`. Not prerendered.", valueType: "any" },
      alt: { description: "The alternative text, for screen readers and when the image can't load.", valueType: "string" },
      fit: { description: "contain (default: the whole image fits) or cover (it fills the box, cropped).", valueType: "string", availableValues: ["contain", "cover"] },
      aspectRatio: { description: "A width/height ratio: 1.5 or 16/9.", valueType: "string" },
      lazyLoad: { description: "Loads the image only when it is about to scroll into view.", valueType: "boolean" },
      inline: { description: "An inline element (in a line of text) instead of a block.", valueType: "boolean" },
      grayscale: { description: "Shows the image in grayscale.", valueType: "boolean" },
    },
    events: { click: CLICK },
    themeVars: { "borderRadius-Image": "0" },
  },
  Avatar: {
    description: "A person's picture, or the initials of their name without one (or when it fails to load).",
    props: {
      name: { description: "The name: its initials (up to three) and the accessible label.", valueType: "string" },
      url: { description: "The picture's URL.", valueType: "string" },
      size: { description: "xs, sm (default), md, lg, xl, or a CSS size.", valueType: "string" },
    },
    events: { click: CLICK, contextMenu: CONTEXT_MENU },
    themeVars: {
      "backgroundColor-Avatar": "$color-surface-100",
      "textColor-Avatar": "$textColor-secondary",
      "borderRadius-Avatar": "4px",
      "border-Avatar": "0px solid $borderColor",
      "boxShadow-Avatar": "inset 0 0 0 1px rgba(4,32,69,0.1)",
      "fontWeight-Avatar": "700",
    },
  },
  Badge: {
    description: "A small label with a colored background (a status, a tag, a count).",
    props: {
      value: { description: "The text. The nested content is used when it is absent.", valueType: "any" },
      variant: { description: "badge (default: rounded corners) or pill (fully rounded).", valueType: "string", availableValues: ["badge", "pill"] },
      colorMap: {
        description: "Colors by value: { active: '$color-success-500' } (the background), or { active: { label: 'white', background: 'green' } }.",
        valueType: "any",
      },
    },
    events: { contextMenu: CONTEXT_MENU },
    themeVars: {
      "backgroundColor-Badge": "$color-secondary-500",
      "textColor-Badge": "#ffffff",
      "borderRadius-Badge": "4px",
      "border-Badge": "0px solid $borderColor",
      "padding-Badge": "$space-1 $space-2",
      "fontSize-Badge": "0.8em",
      "fontWeight-Badge": "600",
      "textTransform-Badge": "uppercase",
    },
  },
  ProgressBar: {
    description: "A horizontal bar filled by `value`, from 0 to 1.",
    props: {
      value: { description: "The progress, from 0 (empty) to 1 (complete); clamped. Default 0.", valueType: "number" },
    },
    themeVars: {
      "backgroundColor-ProgressBar": "$color-surface-200",
      "color-indicator-ProgressBar": "$color-primary-500",
      "color-indicator-ProgressBar--complete": "$color-success-500",
      "thickness-ProgressBar": "0.5em",
      "borderRadius-ProgressBar": "999em",
      "borderRadius-indicator-ProgressBar": "999em",
    },
  },
  Spinner: {
    description: "An animated ring: something is in progress.",
    props: {
      delay: { description: "Milliseconds before it shows (default 400), so a quick operation shows none.", valueType: "integer" },
      fullScreen: { description: "Centered over the whole viewport.", valueType: "boolean" },
    },
    themeVars: {
      "size-Spinner": "2.5em",
      "thickness-Spinner": "0.125em",
      "borderColor-Spinner": "$color-surface-400",
    },
  },
  ContentSeparator: {
    description: "A horizontal or vertical line between content.",
    props: {
      orientation: { description: "horizontal (default) or vertical.", valueType: "string", availableValues: ["horizontal", "vertical"] },
      thickness: { description: "The line's thickness (default: the theme's thickness-ContentSeparator, 1px).", valueType: "string", cssKind: "size" },
      length: { description: "The line's length (default: the full width; a vertical line stretches to its row).", valueType: "string", cssKind: "size" },
    },
    themeVars: {
      "backgroundColor-ContentSeparator": "$color-surface-200",
      "thickness-ContentSeparator": "1px",
      "length-ContentSeparator": "100%",
    },
  },
  Markdown: {
    description: "Renders Markdown (GFM: tables, task lists, strikethrough, autolinks): the nested text, `content` or `data`.",
    props: {
      content: { description: "The Markdown text (wins over the nested text). `@{…}` is not evaluated in it.", valueType: "string" },
      data: { description: "A URL to load the Markdown text from (used without `content` and nested text).", valueType: "string" },
      removeIndents: { description: "Removes the common leading indent of the lines (default true), so nested text can be indented with the markup.", valueType: "boolean" },
      allowHtml: { description: "Renders raw HTML of an allowlist (tables, details, formatting; no scripts, styles or event attributes). false: HTML shows as text. Default true.", valueType: "boolean" },
      interpolateBindings: {
        description: "false: `@{…}` in the nested text stays as written (default true: compiled as bindings).",
        valueType: "boolean",
        isLiteral: true,
      },
      openLinkInNewTab: { description: "Every link opens in a new tab.", valueType: "boolean" },
      showHeadingAnchors: { description: "Headings get ids and a # link, shown on hover.", valueType: "boolean" },
      grayscale: { description: "Shows the images in grayscale.", valueType: "boolean" },
      truncateLinks: { description: "Long link texts are cut off with an ellipsis.", valueType: "boolean" },
    },
    rawText: true,
    themeVars: {
      "backgroundColor-Markdown-code": "$color-surface-100",
      "borderColor-Markdown-blockquote": "$color-surface-300",
      "borderColor-Markdown-table": "$borderColor",
      "backgroundColor-Markdown-th": "$color-surface-50",
      "paddingCell-Markdown-table": "$space-2",
      "gap-Markdown": "$space-3",
    },
  },
  Card: {
    description: "A surface that groups content: a stack with a background, a border and automatic padding, and an optional title row.",
    props: {
      title: { description: "The title (an h2), above the content.", valueType: "string" },
      subtitle: { description: "The subtitle, under the title.", valueType: "string" },
      avatarUrl: { description: "An avatar picture next to the title (it turns showAvatar on).", valueType: "string" },
      showAvatar: { description: "Shows the avatar: the picture, or the title's initials.", valueType: "boolean" },
      avatarSize: { description: "The avatar's size (default sm).", valueType: "string", availableValues: ["xs", "sm", "md", "lg"] },
      linkTo: { description: "Makes the title a link to this route or URL.", valueType: "string" },
      orientation: { description: "vertical (default) or horizontal: the children in a row (the title row stays above).", valueType: "string", availableValues: ["vertical", "horizontal"] },
      horizontalAlignment: { description: "start (default), center, end or stretch.", valueType: "string", availableValues: ALIGNMENTS },
      verticalAlignment: { description: "start (default), center, end or stretch.", valueType: "string", availableValues: ALIGNMENTS },
    },
    events: {
      click: { ...CLICK, description: "Clicked (the second click of a double click is not one). A function handler receives the pointer." },
      doubleClick: DOUBLE_CLICK,
      contextMenu: CONTEXT_MENU,
    },
    api: {
      scrollToTop: { description: "Scrolls the card's content to the top (it needs a height and overflowY)." },
      scrollToBottom: { description: "Scrolls the card's content to the bottom." },
      scrollToStart: { description: "Scrolls to the start (left in a left-to-right page)." },
      scrollToEnd: { description: "Scrolls to the end." },
    },
    themeVars: {
      "backgroundColor-Card": "$backgroundColor",
      "backgroundColor-Card--hover": "$backgroundColor",
      "border-Card": "1px solid $borderColor",
      "borderRadius-Card": "$borderRadius",
      "boxShadow-Card": "none",
      "gap-avatar-Card": "$gap-normal",
      "gap-title-Card": "$gap-none",
    },
    // Default: the spacing ladder (a surface's padding, the level's gap).
    optionalThemeVars: ["gap-Card", "padding-Card"],
  },
};




// --- Structure (step 28; .ai/plan/poc-28-structure.md) ------------------------------

const ORIENTATIONS = ["horizontal", "vertical"];

const SPLITTER_PROPS: Record<string, PropMetadata> = {
  initialPrimarySize: { description: "The primary pane's first size: px or % (default 50%).", valueType: "string" },
  minPrimarySize: { description: "The primary pane's smallest size: px or % (default 0%); negative counts from the end.", valueType: "string" },
  maxPrimarySize: { description: "The primary pane's largest size: px or % (default 100%); negative counts from the end (-200px).", valueType: "string" },
  resizeMode: {
    description: "When the splitter itself resizes: keep the ratio (default), the primary pane's size, or the secondary pane's.",
    valueType: "string",
    availableValues: ["preserveRatio", "preservePrimary", "preserveSecondary"],
  },
  swapped: { description: "The secondary pane first.", valueType: "boolean" },
  floating: { description: "The bar shows only while hovered or dragged.", valueType: "boolean" },
};

const SPLITTER_BASE: Omit<ComponentMetadata, "description"> = {
  props: {
    orientation: { description: "vertical (default): the panes on top of each other; horizontal: side by side.", valueType: "string", availableValues: ORIENTATIONS },
    ...SPLITTER_PROPS,
  },
  events: { resize: { description: "A drag ended: (primarySize), the primary pane's size in px." } },
  templates: { splitterTemplate: { description: "The bar's content, as markup.", contextVars: [] } },
  themeVars: {
    "backgroundColor-resizer-Splitter": "$color-surface-200",
    "backgroundColor-resizer-Splitter--hover": "$color-primary-300",
    "thickness-resizer-Splitter": "6px",
  },
};

function splitterAlias(orientation: "horizontal" | "vertical"): ComponentMetadata {
  return {
    description: `A Splitter with its panes ${orientation === "horizontal" ? "side by side" : "on top of each other"}.`,
    props: SPLITTER_PROPS,
    events: SPLITTER_BASE.events,
    templates: SPLITTER_BASE.templates,
    alias: { component: "Splitter", props: { orientation } },
  };
}

const STRUCTURE_COMPONENTS: Record<string, ComponentMetadata> = {
  Tabs: {
    description: "Tab headers over panels: TabItem children (also from Items); the active one's content shows.",
    props: {
      activeTab: { description: "The active tab's index (default 0); a later change selects that tab.", valueType: "integer" },
      orientation: { description: "horizontal (default): headers above; vertical: beside.", valueType: "string", availableValues: ORIENTATIONS },
      tabAlignment: { description: "Horizontal headers: start (default), end, center, stretch.", valueType: "string", availableValues: ["start", "end", "center", "stretch"] },
      distributeEvenly: { description: "The headers share the width evenly (tabAlignment stretch).", valueType: "boolean" },
      accordionView: { description: "Stacked headers, one open, as an accordion (orientation is ignored).", valueType: "boolean" },
      keepMounted: { description: "Every panel stays mounted (hidden when inactive), keeping its state (default false).", valueType: "boolean" },
      gap: { description: "The space between the headers and the panel (a CSS size).", valueType: "string", cssKind: "spacing" },
    },
    events: {
      didChange: { description: "Another tab became active: (index, id, label)." },
      contextMenu: { description: "Right-clicked. A function handler receives the pointer.", args: "pointer" },
    },
    templates: { headerTemplate: { description: "Every header, as markup: $header is { id, index, label, isActive }.", contextVars: ["$header"] } },
    childrenAsHeaders: { item: "TabItem" },
    api: {
      next: { description: "Activates the next tab." },
      prev: { description: "Activates the previous tab." },
      setActiveTabIndex: { description: "Activates the tab at this index." },
      setActiveTabById: { description: "Activates the tab with this id." },
      activeTabIndex: { description: "The active tab's index (reactive)." },
    },
    themeVars: {
      "borderColor-Tabs": "$borderColor",
      "textColor-Tabs": "$textColor-secondary",
      "textColor-Tabs--active": "$color-primary-600",
      "borderColor-Tabs--active": "$color-primary-500",
      "backgroundColor-Tabs--hover": "$color-surface-50",
    },
  },
  TabItem: {
    description: "A tab of a Tabs: its header (label, or headerTemplate) and its content.",
    props: { label: { description: "The header's text.", valueType: "string" } },
    events: {
      activated: { description: "The tab became active.", args: "none" },
      deactivated: { description: "Another tab became active.", args: "none" },
    },
    templates: { headerTemplate: { description: "This tab's header, as markup: $header is { id, index, label, isActive }.", contextVars: ["$header"] } },
    parents: ["Tabs"],
    layoutProps: false,
  },
  ExpandableItem: {
    description: "A summary that shows or hides its content when clicked (as <details>).",
    props: {
      summary: { description: "The always visible summary: text (or a <property> template).", valueType: "string" },
      initiallyExpanded: { description: "Open at first (default false).", valueType: "boolean" },
      enabled: { description: "false: it can't be toggled.", valueType: "boolean" },
      iconExpanded: { description: 'The icon while open (default "chevrondown").', valueType: "string", knownValues: ICON_NAMES },
      iconCollapsed: { description: 'The icon while closed (default "chevronright").', valueType: "string", knownValues: ICON_NAMES },
      iconPosition: { description: "start, or end (default).", valueType: "string", availableValues: ["start", "end"] },
      withSwitch: { description: "A switch instead of the icon.", valueType: "boolean" },
      fullWidthSummary: { description: "The summary spans the full width (the icon at the far end).", valueType: "boolean" },
      contentWidth: { description: "The content's width (default 100%).", valueType: "string", cssKind: "size" },
    },
    events: { expandedChange: { description: "Opened or closed: (isExpanded)." } },
    templates: { summary: { description: "The summary, as markup.", contextVars: [] } },
    api: {
      expand: { description: "Opens it." },
      collapse: { description: "Closes it." },
      toggle: { description: "Opens or closes it." },
      isExpanded: { description: "Whether it is open (reactive)." },
    },
    themeVars: {
      "textColor-summary-ExpandableItem": "$textColor",
      "gap-ExpandableItem": "$space-2",
    },
  },
  Stepper: {
    description: "The steps of a workflow: Step children (also from Items); the active one's content shows.",
    props: {
      activeStep: { description: "The active step's index (default 0); a later change selects that step.", valueType: "integer" },
      orientation: { description: "horizontal (default) or vertical (each step's content under its header).", valueType: "string", availableValues: ORIENTATIONS },
      nonLinear: { description: "Any step's header can be clicked (default: only by the API).", valueType: "boolean" },
      stackedLabel: { description: "The labels under the step icons (horizontal).", valueType: "boolean" },
    },
    events: { didChange: { description: "Another step became active: (index)." } },
    childrenAsHeaders: { item: "Step" },
    api: {
      next: { description: "The next step." },
      prev: { description: "The previous step." },
      reset: { description: "Back to the first step." },
      setActiveStep: { description: "Activates the step at this index." },
      activeStep: { description: "The active step's index (reactive)." },
    },
    themeVars: {
      "color-Stepper--active": "$color-primary-500",
      "color-Stepper--completed": "$color-success",
      "color-Stepper--error": "$color-danger",
    },
  },
  Step: {
    description: "A step of a Stepper: its header (label, description, icon, state) and its content.",
    props: {
      label: { description: "The step's label.", valueType: "string" },
      description: { description: "Text under the label.", valueType: "string" },
      icon: { description: "An icon instead of the step's number.", valueType: "string", knownValues: ICON_NAMES },
      completed: { description: "Shown as completed (a check mark).", valueType: "boolean" },
      error: { description: "Shown in the error state (wins over completed).", valueType: "boolean" },
    },
    events: { activated: { description: "The step became active.", args: "none" } },
    parents: ["Stepper"],
    layoutProps: false,
  },
  Splitter: { description: "Two panes (the first two visible children) with a draggable bar between them.", ...SPLITTER_BASE },
  HSplitter: splitterAlias("horizontal"),
  VSplitter: splitterAlias("vertical"),
  ScrollViewer: {
    description: "Fills its parent and scrolls its content, with styled scrollbars and fades; a header and a footer stay put.",
    props: {
      scrollStyle: {
        description: "normal (the browser's), overlay (always shown), whenMouseOver, whenScrolling.",
        valueType: "string",
        availableValues: ["normal", "overlay", "whenMouseOver", "whenScrolling"],
      },
      showScrollerFade: { description: "Fades at the edges where there is more to scroll (not with normal; default true).", valueType: "boolean" },
    },
    templates: {
      headerTemplate: { description: "Above the scrolling content.", contextVars: [] },
      footerTemplate: { description: "Below the scrolling content.", contextVars: [] },
    },
    api: {
      scrollToTop: { description: "Scrolls to the top." },
      scrollToBottom: { description: "Scrolls to the bottom." },
    },
    themeVars: {
      "size-scrollbar-ScrollViewer": "8px",
      "backgroundColor-thumb-ScrollViewer": "$color-surface-400",
      "height-fade-ScrollViewer": "24px",
    },
  },
  StickyBox: {
    description: "Sticks to the top (under a sticky AppHeader) or the bottom of its scroll container while it scrolls.",
    props: { to: { description: "top (default) or bottom.", valueType: "string", availableValues: ["top", "bottom"] } },
    themeVars: { "backgroundColor-StickyBox": "$backgroundColor" },
  },
  StickySection: {
    description: "Stays at the top or bottom edge of its scroll container while it scrolls; a later section covers an earlier one.",
    props: { stickTo: { description: "top (default) or bottom.", valueType: "string", availableValues: ["top", "bottom"] } },
    themeVars: { "backgroundColor-StickySection": "$backgroundColor" },
  },
  ResponsiveBar: {
    description: "A row (or column) of children; those that don't fit move into a dropdown menu. Each child sees $overflow.",
    props: {
      orientation: { description: "horizontal (default) or vertical.", valueType: "string", availableValues: ORIENTATIONS },
      reverse: { description: "Children from the end; the menu at the start.", valueType: "boolean" },
      gap: { description: "The space between the children (a CSS size; default 0).", valueType: "string", cssKind: "spacing" },
      overflowIcon: { description: 'The menu button\'s icon (default "dotmenuhorizontal"; XMLUI\'s is a themed ellipsis).', valueType: "string", knownValues: ICON_NAMES },
      dropdownText: { description: 'The menu button\'s accessible label (default "More options").', valueType: "string" },
      dropdownAlignment: { description: "The menu's alignment to its button: start, end, center (default end; start when reversed).", valueType: "string", availableValues: ["start", "end", "center"] },
    },
    events: {
      click: { description: "Clicked. A function handler receives the pointer.", args: "pointer" },
      willOpen: { description: "Before the menu opens: false keeps it closed.", args: "none" },
    },
    eventResults: true,
    templates: { triggerTemplate: { description: "The menu's button, as markup.", contextVars: [] } },
    perChildContextVars: ["$overflow"],
    api: {
      open: { description: "Opens the menu." },
      close: { description: "Closes the menu." },
      hasOverflow: { description: "Whether some children are in the menu (reactive)." },
    },
  },
};

// --- Overlays and menus (step 27; .ai/plan/poc-27-overlays.md) -------------------------

const MENUS = ["DropdownMenu", "ContextMenu", "SubMenuItem"];
const ICON_POSITIONS = ["start", "end"];
const TOOLTIP_SIDES = ["top", "right", "bottom", "left"];

/** The Tooltip component's options; the tooltip behavior's `tooltipOptions` takes the same names. */
export const TOOLTIP_OPTION_PROPS: Record<string, PropMetadata> = {
  side: { description: "Where the tooltip shows: top (default), right, bottom, left.", valueType: "string", availableValues: TOOLTIP_SIDES },
  align: { description: "Its alignment along that side: start, center (default), end.", valueType: "string", availableValues: ["start", "center", "end"] },
  sideOffset: { description: "The distance from the component in pixels (default 4).", valueType: "number" },
  alignOffset: { description: "A shift along the side in pixels (default 0).", valueType: "number" },
  showArrow: { description: "Shows an arrow pointing at the component (default false).", valueType: "boolean" },
  avoidCollisions: { description: "Flips and shifts the tooltip to stay in the viewport (default true).", valueType: "boolean" },
  delayDuration: { description: "Milliseconds the pointer rests before it shows (default 700).", valueType: "integer" },
  skipDelayDuration: { description: "Accepted for compatibility (Radix's delay skipping); no effect.", valueType: "integer" },
  defaultOpen: { description: "Shown when it mounts, until the pointer leaves.", valueType: "boolean" },
};

const OVERLAY_COMPONENTS: Record<string, ComponentMetadata> = {
  ModalDialog: {
    description:
      "A dialog above the page: opened by open(...params) (the dialog sees $param and $params) or while its `when` holds; focus stays inside; Escape, the close button and a click outside close it.",
    props: {
      title: { description: "The title in the dialog's header.", valueType: "string" },
      closeButtonVisible: { description: "Shows the close button in the header (default true).", valueType: "boolean" },
      closeOnClickAway: { description: "A click outside the dialog closes it (default true).", valueType: "boolean" },
      fullScreen: { description: "Covers the whole window (default false).", valueType: "boolean" },
      skipDirtyConfirmation: { description: "Closes a dirty dialog without asking (default false).", valueType: "boolean" },
      confirmCloseTitle: { description: 'The title of the question before a dirty dialog closes (default "Unsaved changes").', valueType: "string" },
      canCloseMessage: { description: "The question before a dirty dialog closes.", valueType: "string" },
      confirmCloseLabel: { description: 'The button that closes the dirty dialog (default "Close").', valueType: "string" },
      cancelCloseLabel: { description: 'The button that keeps it open (default "Cancel").', valueType: "string" },
    },
    events: {
      open: { description: "The dialog opened: (...params), the arguments of open()." },
      close: { description: "The dialog closed (the close button, Escape, a click outside, close(), a Form inside).", args: "none" },
      willClose: { description: "Before it closes: returning false keeps it open (and skips the dirty question).", args: "none" },
      dirtyChanged: { description: "The dialog became dirty or clean (setDirty, or a Form inside): (dirty)." },
    },
    eventResults: true,
    templates: { titleTemplate: { description: "The title, as markup.", contextVars: [] } },
    childContextVars: ["$param", "$params"],
    openedByWhen: true,
    api: {
      open: { description: "Opens the dialog: open(...params); inside, $param is the first, $params all of them." },
      close: { description: "Closes the dialog (willClose and the dirty question apply)." },
      setDirty: { description: "Marks the dialog dirty (it asks before closing) or clean." },
      getDirty: { description: "Whether the dialog is dirty." },
      isOpen: { description: "Whether the dialog is open (reactive)." },
    },
    themeVars: {
      "backgroundColor-ModalDialog": "$backgroundColor",
      "backgroundColor-overlay-ModalDialog": "rgba(15, 23, 42, 0.5)",
      "textColor-ModalDialog": "$textColor",
      "borderRadius-ModalDialog": "$borderRadius",
      "fontSize-title-ModalDialog": "1.25em",
      "fontWeight-title-ModalDialog": "600",
      "textColor-title-ModalDialog": "$textColor",
      "minWidth-ModalDialog": "min(100%, 360px)",
      "maxWidth-ModalDialog": "min(100%, 560px)",
      "boxShadow-ModalDialog": "0 12px 32px rgba(15, 23, 42, 0.25)",
    },
    // Default: the spacing ladder's level 1 (a surface, like a Card on the page).
    optionalThemeVars: ["padding-ModalDialog", "gap-ModalDialog"],
  },
  Drawer: {
    description: "A panel that slides in from an edge of the window: open() and close(), a backdrop, a header template.",
    props: {
      position: { description: "The edge it slides in from: left (default), right, top, bottom.", valueType: "string", availableValues: ["left", "right", "top", "bottom"] },
      hasBackdrop: { description: "Dims the page behind it (default true).", valueType: "boolean" },
      closeOnClickAway: { description: "A click on the backdrop closes it (default true).", valueType: "boolean" },
      closeButtonVisible: { description: "Shows the close button in its header (default true).", valueType: "boolean" },
      initiallyOpen: { description: "Open when it mounts (default false).", valueType: "boolean" },
    },
    events: {
      open: { description: "The drawer opened.", args: "none" },
      close: { description: "The drawer closed.", args: "none" },
    },
    templates: { headerTemplate: { description: "The header's content, next to the close button.", contextVars: [] } },
    api: {
      open: { description: "Opens the drawer." },
      close: { description: "Closes the drawer." },
      isOpen: { description: "Whether the drawer is open (reactive)." },
    },
    themeVars: {
      "backgroundColor-Drawer": "$backgroundColor",
      "backgroundColor-backdrop-Drawer": "rgba(15, 23, 42, 0.5)",
      "boxShadow-Drawer": "0 12px 32px rgba(15, 23, 42, 0.25)",
      "width-Drawer": "320px",
      "height-Drawer": "320px",
    },
    optionalThemeVars: ["padding-Drawer", "gap-Drawer"],
  },
  DropdownMenu: {
    description: "A button that opens a menu of MenuItem, SubMenuItem and MenuSeparator children (or any content).",
    props: {
      label: { description: "The trigger button's text.", valueType: "string" },
      alignment: { description: "The menu's edge under the trigger: start (default), end, center.", valueType: "string", availableValues: ["start", "end", "center"] },
      enabled: { description: "false: the trigger is disabled.", valueType: "boolean" },
      triggerButtonIcon: { description: 'The trigger\'s icon (default "chevrondown").', valueType: "string", knownValues: ICON_NAMES },
      triggerButtonIconPosition: { description: "start, or end (default).", valueType: "string", availableValues: ICON_POSITIONS },
      triggerButtonThemeColor: { description: "Accepted for XMLUI compatibility; waits for Button theme colors.", valueType: "string", availableValues: ["primary", "secondary", "attention"] },
      triggerButtonVariant: { description: "Accepted for XMLUI compatibility; waits for Button variants.", valueType: "string", availableValues: ["solid", "outlined", "ghost"] },
    },
    events: { willOpen: { description: "Before the menu opens: returning false keeps it closed.", args: "none" } },
    eventResults: true,
    templates: { triggerTemplate: { description: "A trigger of your own instead of the button (it opens the menu when clicked).", contextVars: [] } },
    api: {
      open: { description: "Opens the menu." },
      close: { description: "Closes the menu." },
    },
    themeVars: {
      "backgroundColor-DropdownMenu": "$backgroundColor",
      "borderColor-DropdownMenu": "$borderColor",
      "borderRadius-DropdownMenu": "$borderRadius",
      "boxShadow-DropdownMenu": "0 8px 24px rgba(15, 23, 42, 0.18)",
      "minWidth-DropdownMenu": "160px",
    },
  },
  MenuItem: {
    description: "An item of a DropdownMenu, ContextMenu or SubMenuItem: `label` or the nested content, an icon; a click runs onClick or navigates to `to`, and closes the menu.",
    props: {
      label: { description: "The item's text. Nested content is used when it is absent.", valueType: "string" },
      icon: { description: "An icon by name.", valueType: "string", knownValues: ICON_NAMES },
      iconPosition: { description: "start (default) or end.", valueType: "string", availableValues: ICON_POSITIONS },
      active: { description: "Shows the item as the current one.", valueType: "boolean" },
      enabled: { description: "false: disabled.", valueType: "boolean" },
      to: { description: "Navigates to this route or URL when clicked.", valueType: "string" },
    },
    events: { click: { description: "Clicked (or chosen with the keyboard). A function handler receives the pointer.", args: "pointer" } },
    parents: MENUS,
    layoutProps: false,
    themeVars: {
      "backgroundColor-MenuItem": "transparent",
      "backgroundColor-MenuItem--hover": "$color-surface-100",
      "backgroundColor-MenuItem--active": "$color-primary-50",
      "color-MenuItem": "$textColor",
      "color-MenuItem--hover": "$textColor",
      "color-MenuItem--active": "$color-primary-600",
      "color-MenuItem--disabled": "$textColor-secondary",
      "fontSize-MenuItem": "0.95em",
      "gap-MenuItem": "$space-2",
      "paddingVertical-MenuItem": "$space-2",
      "paddingHorizontal-MenuItem": "$space-3",
    },
  },
  SubMenuItem: {
    description: "An item that opens a nested menu of its children (on hover, a click, or the right arrow key).",
    props: {
      label: { description: "The item's text.", valueType: "string" },
      icon: { description: "An icon by name.", valueType: "string", knownValues: ICON_NAMES },
      iconPosition: { description: "start (default) or end.", valueType: "string", availableValues: ICON_POSITIONS },
    },
    templates: { triggerTemplate: { description: "The item's content, as markup.", contextVars: [] } },
    parents: MENUS,
    layoutProps: false,
  },
  MenuSeparator: {
    description: "A line between menu items.",
    props: {},
    parents: MENUS,
    layoutProps: false,
  },
  ContextMenu: {
    description: "A menu without a trigger, opened at the pointer by openAt(ev, context) (usually from onContextMenu); its items see the context as $context.",
    props: {
      menuWidth: { description: "The menu's width (a CSS size).", valueType: "string" },
    },
    childContextVars: ["$context"],
    api: {
      openAt: { description: "Opens the menu at the pointer: openAt(ev, context) with the handler's ev (or { clientX, clientY }); without ev, at the last right click." },
      close: { description: "Closes the menu." },
    },
    layoutProps: false,
  },
  Tooltip: {
    description: "Shows `text`, `markdown` or `tooltipTemplate` while the pointer is over its children (or they have the focus).",
    props: {
      text: { description: "The tooltip's text.", valueType: "string" },
      markdown: { description: "The tooltip's content as Markdown.", valueType: "string" },
      ...TOOLTIP_OPTION_PROPS,
    },
    templates: { tooltipTemplate: { description: "The tooltip's content, as markup.", contextVars: [] } },
    layoutProps: false,
  },
};

/** Breakpoints a NavPanel can move into its drawer below (`drawerBelow`). */
export const DRAWER_BREAKPOINTS = ["sm", "md", "lg", "xl", "xxl", "never"] as const;

/** XMLUI's App `layout` values, each with the equivalent shell markup (E030). */
export const LAYOUT_EQUIVALENTS: Readonly<Record<string, string>> = {
  "condensed-sticky": "it is the default: remove 'layout'",
  condensed: `remove 'layout'; use <AppHeader sticky="false"> and <Footer sticky="false">`,
  "horizontal-sticky": `remove 'layout'; use <NavPanel placement="below-header">`,
  horizontal: `remove 'layout'; use <NavPanel placement="below-header" sticky="false">, <AppHeader sticky="false"> and <Footer sticky="false">`,
  "vertical-full-header": `remove 'layout'; use <NavPanel placement="side">`,
  "vertical-sticky": `remove 'layout'; use <NavPanel placement="side" fullHeight="true">`,
  vertical: `remove 'layout'; use <NavPanel placement="side" fullHeight="true" sticky="false">, <AppHeader sticky="false"> and <Footer sticky="false">`,
  desktop: `remove 'layout'; use <App scroll="content">, no NavPanel, and the theme variables maxWidth-content-App="none" and paddingHorizontal-content-App="0"`,
};

const STICKY_PROP: PropMetadata = {
  description: "Stays in view while the page scrolls (only with App scroll=\"page\"). Default true.",
  valueType: "boolean",
  isLiteral: true,
};

const SHELL_COMPONENTS: Record<string, ComponentMetadata> = {
  AppHeader: {
    layoutProps: false,
    description: "The App's header bar: the drawer toggle, the logo, the title, your content and the profile menu.",
    props: {
      sticky: STICKY_PROP,
      title: { description: "The app's title, next to the logo.", valueType: "string" },
      showLogo: { description: "Show the logo in the header (default true).", valueType: "boolean" },
    },
    templates: {
      logoTemplate: { description: "Replaces the logo in the header.", contextVars: [] },
      titleTemplate: { description: "Replaces the title.", contextVars: [] },
      profileMenuTemplate: { description: "Content at the end of the header (a profile menu).", contextVars: [] },
    },
    isRegion: true,
    themeVars: {
      "height-AppHeader": "$space-14",
      "backgroundColor-AppHeader": "$backgroundColor",
      "textColor-AppHeader": "$textColor",
      "borderColor-AppHeader": "$borderColor",
      "paddingHorizontal-AppHeader": "$space-4",
      "gap-AppHeader": "$space-4",
    },
  },
  NavPanel: {
    layoutProps: false,
    description: "The App's navigation: NavLink and NavGroup items, placed by `placement`.",
    props: {
      placement: {
        description: "header (inside the header bar; default), below-header (its own bar under the header) or side (a column).",
        valueType: "string",
        availableValues: ["header", "below-header", "side"],
        isLiteral: true,
      },
      fullHeight: {
        description: "A side nav that runs the full height, beside the header and the footer (placement=\"side\" only).",
        valueType: "boolean",
        isLiteral: true,
      },
      sticky: STICKY_PROP,
      drawerBelow: {
        description: "Below this breakpoint the nav moves into a drawer opened from the header (default lg); never: it stays in place.",
        valueType: "string",
        availableValues: DRAWER_BREAKPOINTS,
        isLiteral: true,
      },
      collapsible: {
        description: "The side nav can collapse to icons (NavPanelCollapseButton, setNavPanelCollapsed); placement=\"side\" only.",
        valueType: "boolean",
        isLiteral: true,
      },
    },
    templates: {
      logoTemplate: { description: "Replaces the logo when it shows in the nav (a full-height side nav).", contextVars: [] },
      footerTemplate: { description: "Content at the bottom of the nav.", contextVars: [] },
    },
    isRegion: true,
    themeVars: {
      "width-navPanel-App": "256px",
      "width-navPanel-collapsed-App": "48px",
      "backgroundColor-NavPanel": "$backgroundColor",
      "borderColor-NavPanel": "$borderColor",
      "padding-NavPanel": "$space-2",
      "backgroundColor-NavPanel-overlay": "rgb(0 0 0 / 0.4)",
    },
  },
  Footer: {
    layoutProps: false,
    description: "The App's footer.",
    props: { sticky: STICKY_PROP },
    isRegion: true,
    themeVars: {
      "height-Footer": "$space-12",
      "backgroundColor-Footer": "$backgroundColor",
      "textColor-Footer": "$textColor-secondary",
      "borderColor-Footer": "$borderColor",
      "paddingHorizontal-Footer": "$space-4",
    },
  },
  NavLink: {
    layoutProps: false,
    description: "A navigation item: a link to a route, highlighted while its route is active.",
    props: {
      label: { description: "The link's text. Nested content is used when it is absent.", valueType: "string" },
      to: { description: "The route to go to.", valueType: "string" },
      icon: { description: "An icon name (see Icon): home, list, settings, user, info, star, folder, chart, mail, search, …", valueType: "string", knownValues: ICON_NAMES },
      exact: { description: "Active only on exactly `to` (default: also on paths below it; \"/\" is always exact).", valueType: "boolean" },
      active: { description: "Forces the active look (true) or turns it off (false), whatever the route.", valueType: "boolean" },
    },
    themeVars: {
      "textColor-NavLink": "$textColor",
      "textColor-NavLink--active": "$color-primary-600",
      "backgroundColor-NavLink--hover": "$color-surface-100",
      "backgroundColor-NavLink--active": "$color-primary-50",
      "borderRadius-NavLink": "$borderRadius",
      "padding-NavLink": "$space-2",
    },
  },
  NavGroup: {
    layoutProps: false,
    description: "A group of navigation items under a label: expands in place in a side nav or a drawer, drops down in a bar.",
    props: {
      label: { description: "The group's text.", valueType: "string" },
      icon: { description: "An icon name (see Icon).", valueType: "string", knownValues: ICON_NAMES },
      initiallyExpanded: { description: "Expanded when it first renders (default false).", valueType: "boolean" },
    },
  },
  NavPanelCollapseButton: {
    layoutProps: false,
    description: "Collapses the side nav to icons and back (a collapsible side NavPanel only).",
    props: {
      "aria-label": { description: "The accessible name while expanded (default \"Collapse navigation\").", valueType: "string" },
      "aria-labelCollapsed": { description: "The accessible name while collapsed (default \"Expand navigation\").", valueType: "string" },
    },
  },
};


const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

/** The props of every stack (Stack and its aliases). The layout props (width, padding, …) come on top. */
const STACK_PROPS: Record<string, PropMetadata> = {
  gap: { description: "The space between the children. Default: automatic, by the nesting level (the spacing ladder).", valueType: "string", cssKind: "spacing" },
  horizontalAlignment: { description: "start (default), center, end, or stretch (the children fill the width; the default in a vertical stack).", valueType: "string", availableValues: ALIGNMENTS },
  verticalAlignment: { description: "start (default), center, end, or stretch (the children fill the height; the default in a horizontal stack).", valueType: "string", availableValues: ALIGNMENTS },
  wrapContent: { description: "The children wrap into new rows (columns in a vertical stack): a flow layout.", valueType: "boolean" },
  itemWidth: { description: "The width of the children of a wrapping stack, unless they set their own (25% for four per row).", valueType: "string", cssKind: "size" },
  reverse: { description: "Lays the children out in reverse order.", valueType: "boolean" },
  density: {
    description: "compact: this stack and everything inside it one spacing step tighter; comfortable: one step looser; normal: back to the default.",
    valueType: "string",
    availableValues: ["compact", "normal", "comfortable"],
  },
};

/** VStack, HStack, CVStack, CHStack: a Stack with a fixed orientation (and centered). */
function stackAlias(orientation: "vertical" | "horizontal", centered: boolean): ComponentMetadata {
  const props: Record<string, string> = { orientation };
  if (centered) Object.assign(props, { horizontalAlignment: "center", verticalAlignment: "center" });
  return {
    description: `A ${orientation} Stack${centered ? " with its content centered" : ""}.`,
    props: STACK_PROPS,
    alias: { component: "Stack", props },
  };
}


const TRANSFER_PROPS: Record<string, PropMetadata> = {
  url: { description: "The URL; may use $param (the event's argument).", valueType: "string", isRequired: true },
  method: { description: "The HTTP method.", valueType: "string", availableValues: ["get", "post", "put", "patch", "delete", "GET", "POST", "PUT", "PATCH", "DELETE"] },
  queryParams: { description: "Added to the URL.", valueType: "any" },
  headers: { description: "Request headers.", valueType: "any" },
  body: { description: "A request body.", valueType: "any" },
  payloadType: { description: "json, form or multipart-form (default: multipart when the body has a file).", valueType: "string", availableValues: ["json", "form", "multipart-form"] },
  timeoutMs: { description: "Per attempt, in ms. Default 30000.", valueType: "integer" },
};

const TRANSFER_EVENTS: Record<string, EventMetadata> = {
  success: { description: "It succeeded: (result)." },
  error: { description: "It failed: (error). With a handler, the event's handler doesn't fail." },
  cancel: { description: "The calling handler was cancelled: (reason)." },
};

/** Step 32B: files and uploads (.ai/plan/poc-32b-files.md). */
const FILE_COMPONENTS: Record<string, ComponentMetadata> = {
  FileInput: {
    description: "Picks files (a browse button, or files dropped on it): its value is File[]; with parseAs, { files, parsedData }. Binds to a Form with bindTo.",
    props: {
      initialValue: { description: "The files when it mounts.", valueType: "any" },
      acceptsFileType: { description: "Accepted types: extensions (.pdf) and MIME types (image/*), as an array or comma-separated.", valueType: "any" },
      multiple: { description: "Several files.", valueType: "boolean" },
      directory: { description: "Picks a folder (its files).", valueType: "boolean" },
      placeholder: { description: "Shown while no file is picked.", valueType: "string" },
      required: { description: "In a Form: a file must be picked.", valueType: "boolean" },
      parseAs: { description: "csv or json: the files are parsed; the value and didChange get { files, parsedData: [{ file, data, error }] }.", valueType: "string", availableValues: ["csv", "json"] },
      csvOptions: { description: "papaparse's config for parseAs=\"csv\" (default { header: true, skipEmptyLines: true }).", valueType: "any" },
      buttonLabel: { description: 'The button\'s text (default "Browse").', valueType: "string" },
      buttonIcon: { description: "An icon in the button.", valueType: "string", knownValues: ICON_NAMES },
      buttonIconPosition: { description: "start (default) or end.", valueType: "string", availableValues: ["start", "end"] },
      buttonPosition: { description: "The button after (end, default) or before (start) the names.", valueType: "string", availableValues: ["start", "end"] },
      buttonSize: { description: "XMLUI's button size; not used yet.", valueType: "string" },
      buttonThemeColor: { description: "XMLUI's button color; not used yet.", valueType: "string" },
      buttonVariant: { description: "XMLUI's button variant; not used yet.", valueType: "string" },
      ...INPUT_COMMON,
    },
    events: {
      didChange: { description: "Files were picked or dropped: (files), or with parseAs ({ files, parsedData })." },
      parseError: { description: "A file couldn't be parsed: (error, file)." },
      ...FOCUS_EVENTS,
    },
    api: {
      value: { description: "The files (reactive)." },
      setValue: { description: "Replaces the files (no didChange)." },
      focus: { description: "Moves the keyboard focus to it." },
      open: { description: "Opens the file dialog." },
      inProgress: { description: "Files are being parsed (parseAs)." },
      getFields: { description: "The header fields of the last parsed CSV." },
    },
    themeVars: textInputTheme("FileInput"),
  },
  FileUploadDropZone: {
    description: "Files dropped on its children (or pasted into it with allowPaste) fire upload(files); it doesn't upload.",
    props: {
      acceptedFileTypes: { description: "Accepted MIME types (and extensions), comma-separated: image/*,application/pdf.", valueType: "string" },
      maxFiles: { description: "At most this many files at once (more: nothing happens).", valueType: "integer" },
      allowPaste: { description: "Files pasted into it count too (not when pasting into a text input inside it).", valueType: "boolean" },
      enabled: { description: "false: no drops.", valueType: "boolean" },
      icon: { description: 'The icon without children and while dragging (default "upload").', valueType: "string", knownValues: ICON_NAMES },
      text: { description: 'The text without children and while dragging (default "Drop files here").', valueType: "string" },
    },
    events: { upload: { description: "Files were dropped or pasted: (files)." } },
    api: { open: { description: "Opens the file dialog." } },
    themeVars: {
      "backgroundColor-FileUploadDropZone": "$backgroundColor",
      "backgroundColor-dropping-FileUploadDropZone": "$color-primary-100",
      "borderColor-FileUploadDropZone": "$color-secondary-200",
      "borderRadius-FileUploadDropZone": "$borderRadius",
      "borderStyle-FileUploadDropZone": "dashed",
      "borderWidth-FileUploadDropZone": "2px",
      "opacity-dropping-FileUploadDropZone": "0.3",
      "textColor-dropping-FileUploadDropZone": "$color-primary-700",
      "textColor-FileUploadDropZone": "$textColor-secondary",
    },
  },
  FileUpload: {
    description: "An action inside <event>: sends `file` (the body, or with asForm a form field); `$param` is the event's argument.",
    props: {
      ...TRANSFER_PROPS,
      file: { description: "The File or Blob: file=\"{$param[0]}\" in an upload event.", valueType: "any" },
      asForm: { description: "Sends multipart/form-data with the file under fieldName and formParams.", valueType: "boolean" },
      fieldName: { description: 'The file\'s form field (default "file").', valueType: "string" },
      formParams: { description: "More form fields with asForm.", valueType: "any" },
      invalidates: { description: "URL paths whose DataSources refetch after success. Default: every DataSource.", valueType: "any" },
    },
    events: TRANSFER_EVENTS,
    action: "only",
    nonVisual: true,
  },
  FileDownload: {
    description: "An action inside <event>: fetches `url` and saves the response as a file.",
    props: {
      ...TRANSFER_PROPS,
      fileName: { description: "The name to save it under (default: the response's Content-Disposition, else the URL's last part).", valueType: "string" },
    },
    events: TRANSFER_EVENTS,
    action: "only",
    nonVisual: true,
  },
};

/** Step 32: the remaining components (.ai/plan/poc-32-remaining.md). */
const STEP32_COMPONENTS: Record<string, ComponentMetadata> = {
  QRCode: {
    description: "A QR code of `value` (up to 2,953 bytes at level L), drawn as one SVG path.",
    props: {
      value: { description: "The text to encode (UTF-8, emoji included).", valueType: "string" },
      size: { description: "The width and height in pixels. Default: the size-QRCode theme variable (256).", valueType: "number" },
      level: { description: "The error correction: L (default, 7%), M (15%), Q (25%), H (30%).", valueType: "string", availableValues: ["L", "M", "Q", "H"] },
      color: { description: "The dark modules' color. Default: color-QRCode (#000000).", valueType: "string" },
      backgroundColor: { description: "The background (and quiet zone) color. Default: backgroundColor-QRCode (#FFFFFF).", valueType: "string" },
      title: { description: "The accessible name of the code (an SVG title).", valueType: "string" },
    },
    events: { init: { description: "The QR code rendered for the first time.", args: "none" } },
    themeVars: {
      "backgroundColor-QRCode": "#FFFFFF",
      "color-QRCode": "#000000",
      "padding-QRCode": "$space-4",
      "size-QRCode": "256",
    },
  },
  IFrame: {
    description: "Embeds another document (`src` or `srcdoc`); `postMessage()` sends it a message (a MessageListener receives its replies).",
    props: {
      src: { description: "The URL of the document to embed.", valueType: "string" },
      srcdoc: { description: "The HTML to embed instead of a URL.", valueType: "string" },
      allow: { description: "The permissions policy (camera, microphone, fullscreen, …).", valueType: "string" },
      name: { description: "The frame's name (a target for links and forms; also its accessible title).", valueType: "string" },
      referrerPolicy: {
        description: "How much referrer information the request sends.",
        valueType: "string",
        availableValues: ["no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"],
      },
      sandbox: { description: "Restrictions, as space-separated flags (allow-scripts allow-same-origin …).", valueType: "string" },
    },
    events: { load: { description: "The embedded document finished loading.", args: "none" } },
    api: { postMessage: { description: "Sends a message to the embedded document: postMessage(message, targetOrigin = \"*\")." } },
    removedApi: {
      getContentWindow: "gfui gives script no window object (the sandbox); use postMessage() and a MessageListener",
      getContentDocument: "gfui gives script no document object (the sandbox); use postMessage() and a MessageListener",
    },
    themeVars: {
      "border-IFrame": "1px solid $borderColor",
      "borderRadius-IFrame": "$borderRadius",
      "width-IFrame": "100%",
      "height-IFrame": "300px",
    },
  },
  MediaPlayer: {
    description: "Plays video (default) or audio with the browser's player; events and API for the playback state.",
    props: {
      src: { description: "The media URL (the browser decides which formats play).", valueType: "string" },
      kind: { description: "video (default) or audio.", valueType: "string", availableValues: ["video", "audio"] },
      poster: { description: "An image shown before a video plays.", valueType: "string" },
      autoPlay: { description: "Starts playing when it can (browsers block it with sound unless muted).", valueType: "boolean" },
      controls: { description: "The browser's controls (default true).", valueType: "boolean" },
      loop: { description: "Starts over at the end.", valueType: "boolean" },
      muted: { description: "No sound.", valueType: "boolean" },
      playbackRate: { description: "The speed (default 1).", valueType: "number" },
      preload: { description: "How much to load before playing: none, metadata, auto.", valueType: "string", availableValues: ["none", "metadata", "auto"] },
      crossOrigin: { description: "The CORS mode of the request.", valueType: "string", availableValues: ["anonymous", "use-credentials"] },
    },
    events: {
      play: { description: "Playback started or resumed: ({ currentTime })." },
      pause: { description: "Playback paused: ({ currentTime })." },
      ended: { description: "Playback reached the end (not with loop): ({ currentTime })." },
      seeked: { description: "A seek finished: ({ currentTime })." },
      timeUpdate: { description: "The playhead moved (every 15–250 ms while playing): ({ currentTime })." },
      loadedMetadata: { description: "The duration is known: ({ duration }), plus videoWidth and videoHeight for a video." },
    },
    api: {
      play: { description: "Starts or resumes; rejects if the browser refuses (autoplay with sound)." },
      pause: { description: "Pauses." },
      seek: { description: "Moves the playhead: seek(seconds)." },
      getCurrentTime: { description: "The playhead position in seconds, when called (not reactive)." },
      duration: { description: "The length in seconds once known, else undefined (reactive)." },
      paused: { description: "True unless playing (reactive)." },
      ended: { description: "True after reaching the end (reactive)." },
    },
    themeVars: { "borderRadius-MediaPlayer": "$borderRadius" },
  },
  TableOfContents: {
    description: "Links to the page's headings and bookmarks; a click scrolls there and moves focus; the one at the top of the view is marked. Prerendered.",
    props: {
      maxHeadingLevel: { description: "The deepest level listed, 1–6 (default 6).", valueType: "integer" },
      omitH1: { description: "Leaves out level 1 (the page title).", valueType: "boolean" },
      smoothScrolling: { description: "Scrolls smoothly to a heading.", valueType: "boolean" },
      scrollStyle: { description: "normal (default), overlay, whenMouseOver, whenScrolling: how a long list's scrollbar shows.", valueType: "string", availableValues: ["normal", "overlay", "whenMouseOver", "whenScrolling"] },
      showScrollerFade: { description: "With a scroll style: fades where there is more (default true).", valueType: "boolean" },
    },
    events: { contextMenu: CONTEXT_MENU },
    themeVars: {
      "padding-TableOfContents": "$space-2",
      "height-TableOfContents": "auto",
      "width-indicator-TableOfContents": "2px",
      "color-indicator-TableOfContents": "$color-surface-100",
      "color-indicator-TableOfContents--active": "$color-surface-900",
      "fontSize-TableOfContentsItem": "0.875em",
      "fontWeight-TableOfContentsItem": "700",
      "fontWeight-TableOfContentsItem--active": "700",
      "fontWeight-TableOfContentsItem-level-2": "500",
      "fontWeight-TableOfContentsItem-level-3": "400",
      "fontWeight-TableOfContentsItem-level-4": "400",
      "fontWeight-TableOfContentsItem-level-5": "400",
      "fontWeight-TableOfContentsItem-level-6": "400",
      "fontStyle-TableOfContentsItem-level-6": "italic",
      "paddingVertical-TableOfContentsItem": "$space-1",
      "paddingLeft-TableOfContentsItem": "$space-1",
      "paddingLeft-TableOfContentsItem-level-2": "$space-3",
      "paddingLeft-TableOfContentsItem-level-3": "$space-5",
      "paddingLeft-TableOfContentsItem-level-4": "$space-6",
      "paddingLeft-TableOfContentsItem-level-5": "$space-6",
      "paddingLeft-TableOfContentsItem-level-6": "$space-6",
      "textColor-TableOfContentsItem": "$color-secondary-500",
      "textColor-TableOfContentsItem--active": "$color-primary-500",
      "textColor-TableOfContentsItem--hover": "$textColor",
      "wordWrap-TableOfContentsItem": "break-word",
    },
  },
  Bookmark: {
    description: "An anchor (`#id`) in the page, around its children if any, and an entry of the TableOfContents.",
    props: {
      title: { description: "The text in the TableOfContents (default: the text inside, else the id).", valueType: "string" },
      level: { description: "Its level in the TableOfContents, 1–6 (default 1).", valueType: "integer" },
      omitFromToc: { description: "Not in the TableOfContents.", valueType: "boolean" },
    },
    api: { scrollIntoView: { description: "Scrolls the bookmark into view." } },
    receivesId: true,
    layoutProps: false,
  },
  SkipLink: {
    description: "A link for keyboard users, hidden until it has focus (the first Tab), that moves focus to the main content.",
    props: {
      label: { description: 'The text (default "Skip to main content").', valueType: "string" },
      target: { description: 'The id to skip to (default "main": also the App\'s main region).', valueType: "string" },
    },
    layoutProps: false,
  },
  LiveRegion: {
    description: "Announces `message` to screen readers when it changes; visually hidden.",
    props: {
      message: { description: "The text announced.", valueType: "string" },
      politeness: { description: "polite (default: after what is being read) or assertive (at once).", valueType: "string", availableValues: ["polite", "assertive"] },
    },
    layoutProps: false,
  },
  FocusScope: {
    description: "Keeps keyboard focus inside its children (trap), returns it afterwards (restore), and can focus the first of them (autoFocus).",
    props: {
      trap: { description: "Tab and Shift+Tab cycle inside (default true).", valueType: "boolean" },
      restore: { description: "When it unmounts, focus returns where it was (default true).", valueType: "boolean" },
      autoFocus: { description: "Focuses the first focusable child when it mounts.", valueType: "boolean" },
    },
  },
  Logo: {
    description: "The App's logo (`logo`, `logo-light`, `logo-dark`) for the active tone; nothing without one.",
    props: {
      alt: { description: 'The image\'s alternative text (default "Logo").', valueType: "string" },
      inline: { description: "Displays inline (in a line of text).", valueType: "boolean" },
    },
  },
  NoResult: {
    description: "An icon and a label for an empty result.",
    props: {
      label: { description: "The text; none without it.", valueType: "string" },
      icon: { description: 'The icon (default "noresult").', valueType: "string", knownValues: ICON_NAMES },
      hideIcon: { description: "No icon.", valueType: "boolean" },
    },
    themeVars: {
      "backgroundColor-NoResult": "transparent",
      "border-NoResult": "0px solid $borderColor",
      "gap-icon-NoResult": "$space-2",
      "paddingVertical-NoResult": "$space-2",
      "size-icon-NoResult": "$space-8",
    },
  },
  ToneSwitch: {
    description: "A switch between the light and the dark tone.",
    props: {
      iconLight: { description: 'The icon in the light tone (default "sun").', valueType: "string", knownValues: ICON_NAMES },
      iconDark: { description: 'The icon in the dark tone (default "moon").', valueType: "string", knownValues: ICON_NAMES },
    },
    events: { didChange: { description: 'The user switched the tone: ("light" or "dark").' } },
    themeVars: {
      "backgroundColor-ToneSwitch-light": "$color-surface-200",
      "backgroundColor-ToneSwitch-dark": "$color-primary-500",
      "backgroundColor-indicator-ToneSwitch": "white",
      "borderColor-ToneSwitch": "$color-surface-300",
      "borderColor-ToneSwitch--hover": "$color-surface-400",
      "boxShadow-indicator-ToneSwitch": "0 2px 4px rgba(0, 0, 0, 0.1)",
      "color-ToneSwitch-light": "$color-surface-900",
      "color-ToneSwitch-dark": "$color-primary-600",
    },
  },
  ToneChangerButton: {
    description: "An icon button that switches between the light and the dark tone (XMLUI deprecated it for ToneSwitch).",
    props: {
      lightToDarkIcon: { description: 'The icon in the light tone (default "moon").', valueType: "string", knownValues: ICON_NAMES },
      darkToLightIcon: { description: 'The icon in the dark tone (default "sun").', valueType: "string", knownValues: ICON_NAMES },
    },
    events: { click: { description: 'The button switched the tone: ("light" or "dark").' } },
    deprecationMessage: "use ToneSwitch (XMLUI deprecated ToneChangerButton)",
  },
  PageMetaTitle: {
    description: 'Sets the browser tab\'s title: `value` (or the text inside) and " | " with the App\'s name. Prerendered into <title>.',
    props: {
      value: { description: "The title.", valueType: "string" },
      noSuffix: { description: "Without the App's name.", valueType: "boolean" },
    },
    nonVisual: true,
  },
  Redirect: {
    description: "Navigates to `to` when it mounts (use `when`), through the App's willNavigate.",
    props: {
      to: { description: "The route (with a query) to go to.", valueType: "string" },
      replace: { description: "Replaces the current history entry instead of adding one.", valueType: "boolean" },
    },
    nonVisual: true,
  },
  I18n: {
    description:
      "A message of the active (or nearest Locale's) locale, by `key`; its other props are the message's variables. A `<property name=\"link\">` replaces the message's <link/> or <link>…</link> ($content is the tag's text). A missing key shows the key.",
    props: { key: { description: "The message's key.", valueType: "string", isRequired: true } },
    allowArbitraryProps: true,
    arbitraryTemplates: { contextVars: ["$content"] },
    layoutProps: false,
    nonVisual: true,
  },
  Locale: {
    description:
      "A locale for its children: I18n, Value, Table, the date inputs and `App` in script (App.translate, the formatters, App.locale) use it. Also number traits for the formatters.",
    props: {
      locale: { description: "A BCP 47 locale (default: the enclosing one).", valueType: "string" },
      decimalSeparator: { description: "Replaces the decimal separator in formatted numbers.", valueType: "string" },
      groupSeparator: { description: "Replaces the grouping separator.", valueType: "string" },
      thousandSeparator: { description: "The same as groupSeparator.", valueType: "string" },
      minusSign: { description: "Replaces the minus sign.", valueType: "string" },
      currency: { description: "The default currency of App.formatCurrency.", valueType: "string" },
      numberingSystem: { description: "An Intl numbering system (arab, latn, …).", valueType: "string" },
    },
    childContextVars: ["App"],
    nonVisual: true,
  },
  Fallback: {
    description:
      "Shows `errorTemplate` instead of its children when a child throws while rendering or a DataSource inside fails without its own onError (step 33). `reset()` shows the children again (a DataSource fetches again). A child that fails in the prerender is rendered on the client.",
    props: {
      isLoading: { description: "While true (and no error), `loadingTemplate` is shown instead of the children.", valueType: "boolean" },
    },
    templates: {
      errorTemplate: { description: "Shown after an error; `$error` is the AppError.", contextVars: ["$error"] },
      loadingTemplate: { description: "Shown while `isLoading`.", contextVars: [] },
    },
    api: {
      reset: { description: "Clears the error and mounts the children again." },
      error: { description: "The error shown (an AppError), or undefined." },
    },
    nonVisual: true,
  },
  RetryPolicy: {
    description:
      "Retries the requests of the DataSources inside it (step 33): attempts, backoff, jitter, the categories retried, Retry-After, a circuit breaker. A DataSource's own retries, retryDelay and timeoutMs win.",
    props: {
      attempts: { description: "Total attempts, the first included (default 3).", valueType: "integer" },
      backoff: { description: "The delay between attempts: fixed, linear (× the retry number) or exponential (default; doubles).", valueType: "string", availableValues: ["fixed", "linear", "exponential"] },
      delayMs: { description: "The base delay in ms (default 500).", valueType: "integer" },
      jitter: { description: "Adds ±25% to each delay (default true).", valueType: "boolean" },
      onlyCategories: { description: "The error categories retried, as a comma list or an array (default: the errors whose `retryable` is true).", valueType: "any" },
      timeoutMs: { description: "Per attempt, for DataSources without timeoutMs.", valueType: "integer" },
      honourRetryAfter: { description: "A Retry-After header sets the next delay, up to 60 s (default true).", valueType: "boolean" },
      circuitBreaker: { description: "{ failureThreshold, resetMs }: after that many failed attempts in a row, requests fail at once (code circuit-open) for resetMs; then one probe.", valueType: "any" },
    },
    nonVisual: true,
  },
  ChangeListener: {
    description: "Fires didChange when a value changes (structurally), optionally debounced or throttled.",
    props: {
      listenTo: { description: "The value to watch.", valueType: "any" },
      listenToSources: { description: "Named values to watch ({ a, b }); then didChange also gets changedSources and changes. Wins over listenTo.", valueType: "any" },
      debounceWaitInMs: { description: "Fires after the value has been still this long (default 0: at once).", valueType: "integer" },
      throttleWaitInMs: { description: "Fires at most once per this many ms (default 0).", valueType: "integer" },
    },
    events: { didChange: { description: "The value changed: ({ prevValue, newValue }), plus changedSources and changes with listenToSources." } },
    nonVisual: true,
  },
  Timer: {
    description: "Fires tick every `interval` ms while enabled; a tick waits for the previous handler (one is skipped meanwhile).",
    props: {
      enabled: { description: "Ticks while true (default true).", valueType: "boolean" },
      interval: { description: "The ms between ticks (default 1000).", valueType: "integer" },
      initialDelay: { description: "The ms before the first tick period starts (default 0).", valueType: "integer" },
      once: { description: "Stops after the first tick (enabling it again restarts it).", valueType: "boolean" },
    },
    events: { tick: { description: "An interval passed.", args: "none" } },
    api: {
      pause: { description: "Pauses the timer." },
      resume: { description: "Resumes a paused timer." },
      isPaused: { description: "isPaused(): whether it is paused." },
      isRunning: { description: "isRunning(): whether it is enabled and not paused." },
    },
    eventResults: true,
    nonVisual: true,
  },
  Queue: {
    description: "Processes items one at a time, first in first out (process), with progress and result feedback as toasts.",
    props: {
      clearAfterFinish: { description: "Removes the finished items (completed or failed) when the queue empties.", valueType: "boolean" },
    },
    templates: {
      progressFeedback: { description: "A toast while items are processed.", contextVars: ["$completedItems", "$queuedItems"] },
      resultFeedback: { description: "A toast when the queue empties (if an item completed).", contextVars: ["$completedItems", "$queuedItems"] },
    },
    events: {
      willProcess: { description: "Before an item: ({ item, actionItemId, processItemContext }); returning false skips it." },
      process: { description: "Processes an item: ({ item, actionItemId, processItemContext, onProgress }); throwing fails it; the result is kept." },
      didProcess: { description: "An item was processed: ({ item, actionItemId, processItemContext }) with processItemContext.processResult." },
      processError: { description: "An item failed: (error, { item, actionItemId, processItemContext }); returning false hides the error." },
      complete: { description: "The queue emptied after processing.", args: "none" },
    },
    api: {
      enqueueItem: { description: "Adds an item: enqueueItem(item); returns its id." },
      enqueueItems: { description: "Adds items: enqueueItems([…]); returns their ids." },
      getQueuedItems: { description: "Every item not removed: { item, actionItemId, status, progress, result, error } (reactive)." },
      getQueueLength: { description: "How many items wait or run (reactive)." },
      remove: { description: "Removes an item by id." },
      clearCompleted: { description: "Removes the finished items." },
    },
    eventResults: true,
    nonVisual: true,
  },
  MessageListener: {
    description: "Receives window.postMessage messages (from an IFrame or another window); renders its children as they are.",
    props: {},
    events: { messageReceived: { description: "A message arrived: (data, { data, origin })." } },
    nonVisual: true,
  },
  AppState: {
    description: "Removed: reactive globals do its job.",
    props: {},
    removed: "declare a reactive global instead (global.name on the root element, or Globals.xs), as XMLUI itself advises (AppState.md)",
  },
};

export const componentMetadata: Readonly<Record<string, ComponentMetadata>> = {
  App: {
    layoutProps: false,
    description: "The root of an application: the shell (AppHeader, NavPanel, Footer around the content), the theme and the tone.",
    props: {
      scroll: {
        description: "page (default): the window scrolls; content: only the content area scrolls; none: the app is as tall as its content (embedding).",
        valueType: "string",
        availableValues: ["page", "content", "none"],
        isLiteral: true,
      },
      name: { description: "The app's name: PageMetaTitle adds it to the page title (\"Orders | Shop\").", valueType: "string" },
      logo: { description: "The logo image's URL.", valueType: "string" },
      "logo-light": { description: "The logo in the light tone.", valueType: "string" },
      "logo-dark": { description: "The logo in the dark tone.", valueType: "string" },
      defaultTheme: { description: "The theme until `setTheme()`.", valueType: "string", availableValues: THEME_IDS },
      defaultTone: { description: "The tone until `setThemeTone()`.", valueType: "string", availableValues: TONES },
      useHashBasedRouting: { description: "Routes after `#` (default true: any static server works); false: the path and the History API.", valueType: "boolean" },
      locale: { description: "Step 34: the app's locale (BCP 47); wins over App.setLocale(), the stored choice and the browser's languages.", valueType: "string" },
      defaultLocale: { description: "The locale when nothing else decides (default en); the prerender renders it unless `locale` is set.", valueType: "string" },
      localeBundles: {
        description: "Messages per locale ({ en: { key: 'ICU message' }, de: {…} }), a URL (de.json) or { locale, messages }; also src/locales/<locale>.json files.",
        valueType: "any",
      },
      direction: { description: "auto (default: from the locale), ltr or rtl: the dir of the App and of <html>.", valueType: "string", availableValues: ["auto", "ltr", "rtl"] },
    },
    events: {
      willNavigate: {
        description:
          "Before a navigation (navigate(), a Link or NavLink click, back or forward; not the Pages fallback or the first load). Receives the target path (with its query) and the query parameters; returning false cancels it. A handler that throws or times out cancels it too.",
      },
      didNavigate: { description: "After a navigation (not the first load). Receives the path (with its query) and the query parameters." },
      error: {
        description:
          "An error nothing else handled (a handler, a DataSource, a render error, a navigation event): (error: AppError, event). event.preventDefault() or returning false (also after an await) suppresses the default report (a toast, an announcement, the console). App.errors keeps the last 50.",
      },
    },
    eventResults: true,
    templates: {
      logoTemplate: { description: "The logo, as markup (instead of an image).", contextVars: [] },
    },
    regions: { AppHeader: "$$header", NavPanel: "$$nav", Footer: "$$footer" },
    removedProps: {
      layout: {
        message: "the shell has no layout names: set placement, fullHeight and sticky on the regions, and scroll on App",
        byValue: LAYOUT_EQUIVALENTS,
      },
      scrollWholePage: { message: "use scroll=\"page\" (true) or scroll=\"content\" (false)" },
      fitContent: { message: "use scroll=\"none\"" },
    },
    themeVars: {
      "maxWidth-content-App": "none",
      "backgroundColor-App": "$backgroundColor",
      "textColor-App": "$textColor",
      "fontFamily-App": "$fontFamily",
      "fontSize-App": "$fontSize",
    },
    // Default: the page level of the spacing ladder (space-level0, smaller on phones; styles.ts).
    optionalThemeVars: ["paddingHorizontal-content-App", "paddingVertical-content-App"],
  },
  Theme: {
    description: "Scopes theme variables, a tone, or another theme to its children.",
    props: {
      themeId: { description: "A theme for the children.", valueType: "string", availableValues: THEME_IDS },
      tone: { description: "A tone for the children.", valueType: "string", availableValues: TONES },
    },
    themeVarAttributes: true,
    nonVisual: true,
  },
  Text: {
    description: "Displays text: `value`, or the nested text; `variant` picks a semantic style.",
    themeVars: {
      "textColor-Text": "$textColor",
      "fontSize-Text": "inherit",
      "textColor-Text-secondary": "$textColor-secondary",
      "fontFamily-Text-code": "ui-monospace, SFMono-Regular, Menlo, monospace",
      "backgroundColor-Text-code": "$color-surface-100",
      "backgroundColor-Text-marked": "$color-warn-200",
    },
    props: {
      value: { description: "The text to display. Nested text is used when it is absent.", valueType: "any" },
      variant: {
        description: "A named text style (XMLUI Text variants); renders the semantic element where one exists (strong, em, code, …).",
        valueType: "string",
        availableValues: TEXT_VARIANTS,
      },
      ...TEXT_OVERFLOW_PROPS,
      inline: { description: "A true inline run: adjacent Text elements wrap as one text (ignores the overflow props).", valueType: "boolean" },
    },
    events: { contextMenu: CONTEXT_MENU },
    api: { hasOverflow: { description: "Whether the text is cut off (it overflows its box)." } },
  },
  Heading: {
    description: "A heading, h1 to h6: `value`, or the nested text.",
    themeVars: HEADING_THEME_VARS,
    props: {
      ...HEADING_PROPS,
      level: { description: "h1 (default) … h6; also H1 … H6 and 1 … 6.", valueType: "string", availableValues: HEADING_LEVELS },
    },
    api: HEADING_API,
  },
  H1: headingShortcut(1),
  H2: headingShortcut(2),
  H3: headingShortcut(3),
  H4: headingShortcut(4),
  H5: headingShortcut(5),
  H6: headingShortcut(6),
  Button: {
    description: "A clickable button (Mantine Button): `label`, or the nested content.",
    props: {
      label: { description: "The button's text. Nested content is used when it is absent.", valueType: "string" },
      enabled: { description: "false: disabled.", valueType: "boolean" },
    },
    events: {
      click: { description: "The button was clicked (or activated by the keyboard). A function handler receives the pointer: (ev) with ev.clientX, ev.clientY.", args: "pointer" },
    },
    themeVars: {
      "backgroundColor-Button": "$color-primary-500",
      "backgroundColor-Button--hover": "$color-primary-600",
      "textColor-Button": "#ffffff",
      "borderColor-Button": "$color-primary-600",
      "borderRadius-Button": "$borderRadius",
    },
  },
  ...CHOICE_COMPONENTS,
  ...DATE_COMPONENTS,
  ...INPUT_COMPONENTS,
  ...OVERLAY_COMPONENTS,
  ...STRUCTURE_COMPONENTS,
  Form: {
    description: "A form: edits a copy of `data`. Inputs inside bind a path of it with `bindTo` (the formBinding and validation behaviors); `$data` shows the current values.",
    props: {
      data: {
        description: "The initial data: an object, or a URL to load it from (once; the form is disabled meanwhile, and saves back to it). Later changes are not applied (XMLUI).",
        valueType: "any",
      },
      submitUrl: { description: "Without onSubmit: send the data here through the data layer. Default: `data`'s URL.", valueType: "string" },
      submitMethod: { description: "The request's method. Default: put when `data` is set, else post.", valueType: "string", availableValues: ["post", "put", "patch", "delete"] },
      enabled: { description: "false: every bound input and the buttons are disabled.", valueType: "boolean" },
      saveLabel: { description: 'The Save button\'s label. Default "Save".', valueType: "string" },
      saveInProgressLabel: { description: 'The Save button\'s label while submitting. Default "Saving...".', valueType: "string" },
      cancelLabel: { description: 'The Cancel button\'s label. Default "Cancel".', valueType: "string" },
      hideButtonRow: { description: "Hide the Save and Cancel buttons.", valueType: "boolean" },
      dataAfterSubmit: { description: "After a successful submit: keep the data, reset it to the baseline, or clear it.", valueType: "string", availableValues: ["keep", "reset", "clear"] },
      keepModalOpenOnSubmit: { description: "In a ModalDialog: a successful submit leaves the dialog open (by default it closes).", valueType: "boolean" },
      inProgressNotificationMessage: { description: "A toast while the form is submitting.", valueType: "string" },
      completedNotificationMessage: { description: "A toast after a successful submit.", valueType: "string" },
      errorNotificationMessage: { description: "A toast after a failed submit.", valueType: "string" },
    },
    events: {
      willSubmit: { description: "Before submitting, after validation: `(data, allData)`. `false` cancels; an object replaces the submitted data." },
      submit: { description: "Submits: `(data)`. Its result is passed to `success`; a throw is a failed submit." },
      success: { description: "The submit succeeded: `(result)`." },
      submitError: { description: "The submit failed: `(error, problem)`. `problem` is the server's validation problem (`{ fields, detail }`), if it sent one." },
      cancel: { description: "The Cancel button was clicked. The data stays.", args: "none" },
      reset: { description: "The form was reset (the `reset()` method, or `dataAfterSubmit`).", args: "none" },
      dirtyChanged: { description: "The form became dirty or clean: `(dirty)`." },
    },
    eventResults: true,
    templates: {
      buttonRowTemplate: { description: "Replaces the Save and Cancel buttons.", contextVars: ["$data"] },
    },
    childContextVars: ["$data"],
    api: {
      reset: { description: "Back to the initial data, or to the given object (which becomes the new baseline)." },
      update: { description: "Changes values by path: `update({ name: 'Ann', 'address.city': 'Paris' })`." },
      validate: { description: "Validates every input, waiting for pending checks: a promise of `{ isValid, errors, warnings, data }`." },
      getData: { description: "The data to submit (without `noSubmit` inputs)." },
      isDirty: { description: "Whether the user changed anything since the last reset or submit (reactive)." },
      setDirty: { description: "Marks the form dirty or clean." },
      submit: { description: "Submits, as the Save button does." },
      isSubmitting: { description: "A submit is running (reactive)." },
      cancel: { description: "Stops a running submit to a URL: no success, no error; the data stays." },
      cancelled: { description: "The last submit was cancelled (reactive)." },
      hasErrors: { description: "Some input has an error (reactive)." },
    },
    themeVars: {
      "gap-Form": "$space-3",
      "gap-Form-buttons": "$space-2",
    },
  },
  DataSource: {
    description: "Loads data from a URL and keeps it: value, inProgress, loaded, error; refetch() and cancel().",
    props: {
      url: {
        description: "The URL; with an unresolved part (an interpolated null or undefined) there is no request yet.",
        valueType: "string",
        nullishUnresolved: true,
      },
      method: { description: "The HTTP method (default get).", valueType: "string", availableValues: HTTP_METHODS },
      queryParams: { description: "Added to the URL; arrays repeat the key; null and undefined are left out.", valueType: "any" },
      headers: { description: "Request headers.", valueType: "any" },
      body: { description: "The request body: an object is sent as JSON.", valueType: "any" },
      when: { description: "False: no request (the DataSource stays, with loaded false). Default true.", valueType: "any" },
      resultSelector: { description: "The part of the response to keep, as a path: data.items.", valueType: "string" },
      transformResult: { description: "A function from the (selected) response to the value: (data) => data.filter(…).", valueType: "any", code: true },
      pollIntervalInSeconds: { description: "Fetches again this often (no overlap with a running fetch). Default: no polling.", valueType: "number" },
      structuralSharing: { description: "Keeps unchanged parts of the value (and no loaded event when nothing changed). Default true.", valueType: "boolean" },
      retries: { description: "Retries of retryable failures (network, timeout, 429, 5xx). Default 2 for get, 0 otherwise.", valueType: "integer" },
      retryDelay: { description: "The first wait between attempts in ms, doubled each time (Retry-After wins). Default 500.", valueType: "integer" },
      timeoutMs: { description: "Per attempt, in ms. Default 30000.", valueType: "integer" },
    },
    events: {
      loaded: { description: "A fetch completed with new data: (data, isRefetch)." },
      error: { description: "A fetch failed after its retries: (error)." },
      cancel: { description: "cancel() stopped a fetch: (reason)." },
    },
    api: {
      value: { description: "The data (after resultSelector and transformResult)." },
      inProgress: { description: "A fetch is running." },
      isRefetching: { description: "A fetch is running and there is data already." },
      loaded: { description: "Data has arrived at least once." },
      error: { description: "The last fetch's error, or undefined: { message, category, code, status, retryable, body, attempts }." },
      cancelled: { description: "The last fetch was cancelled." },
      lastCancelReason: { description: "The reason given to the last cancel()." },
      responseHeaders: { description: "The last response's headers." },
      refetch: { description: "Fetches again; resolves when done." },
      cancel: { description: "Cancels the running fetch (true if there was one); the previous value stays." },
    },
    nonVisual: true,
    whenIsProp: true,
  },
  APICall: {
    description: "Sends a request when executed (create, update, delete): execute(...params), then success or error, and invalidation.",
    props: {
      url: { description: "The URL; may use $param and $params (the arguments of execute()).", valueType: "string", deferred: ["$param", "$params"] },
      method: { description: "The HTTP method (default get, as in XMLUI).", valueType: "string", deferred: ["$param", "$params"] },
      queryParams: { description: "Added to the URL; may use $param.", valueType: "any", deferred: ["$param", "$params"] },
      headers: { description: "Request headers; may use $param.", valueType: "any", deferred: ["$param", "$params"] },
      body: { description: "The request body: an object is sent as JSON, as multipart/form-data when it has a File or Blob; may use $param.", valueType: "any", deferred: ["$param", "$params"] },
      payloadType: {
        description: "How the body is sent: json, form (URL-encoded) or multipart-form. Default: json, multipart-form when the body has a file.",
        valueType: "string",
        availableValues: ["json", "form", "multipart-form"],
        deferred: ["$param", "$params"],
      },
      invalidates: {
        description: "URL paths whose DataSources refetch after success (and those below them). Default: every DataSource.",
        valueType: "any",
        deferred: ["$param", "$params"],
      },
      retries: { description: "Retries of retryable failures. Default 0: a write is not repeated unless asked.", valueType: "integer" },
      retryDelay: { description: "The first wait between attempts in ms, doubled each time. Default 500.", valueType: "integer" },
      timeoutMs: { description: "Per attempt, in ms. Default 30000.", valueType: "integer" },
      confirmTitle: { description: "Asks before the request (confirm()): the question's title; may use $param.", valueType: "string", deferred: ["$param", "$params"] },
      confirmMessage: { description: "Asks before the request: the question; may use $param. Cancelled: no request, execute() resolves to undefined.", valueType: "string", deferred: ["$param", "$params"] },
      confirmButtonLabel: { description: 'The button that confirms (default "Yes").', valueType: "string", deferred: ["$param", "$params"] },
      inProgressNotificationMessage: { description: "A toast while the request runs; may use $param.", valueType: "string", deferred: ["$param", "$params"] },
      completedNotificationMessage: { description: "A toast after success; may use $result (the response) and $param.", valueType: "string", deferred: ["$result", "$param", "$params"] },
      errorNotificationMessage: {
        description: "A toast after a failure; may use $error ({ message, status, body, … }) and $param. It handles the error: execute() resolves to undefined.",
        valueType: "string",
        deferred: ["$error", "$param", "$params"],
      },
    },
    events: {
      beforeRequest: { description: "Before the request, with execute()'s arguments: returning false skips it." },
      success: { description: "The request succeeded: (result). Returning false skips the invalidation." },
      error: { description: "The request failed: (error). Without a handler, execute() rejects with the error." },
      cancel: { description: "cancel() (or the calling handler's cancellation) stopped it: (reason)." },
    },
    api: {
      execute: { description: "Sends the request: execute(...params); resolves to the result." },
      cancel: { description: "Cancels the running calls (true if there were any)." },
      inProgress: { description: "A call is running." },
      loaded: { description: "A call has succeeded at least once." },
      lastResult: { description: "The result of the call started last." },
      lastError: { description: "The error of the call started last, or undefined." },
      cancelled: { description: "The call started last was cancelled." },
      lastCancelReason: { description: "Why it was cancelled: user, supersede, timeout, unmount." },
      lastResponseHeaders: { description: "The headers of the last successful response." },
    },
    nonVisual: true,
    eventResults: true,
    action: true,
  },
  ...FILE_COMPONENTS,
  Items: {
    description: "Renders `data` through its item template, without a wrapper element. An instance stays with its item (keyed by $id, id or key).",
    props: {
      data: { description: "The items: an array, an object (its values: integer keys first), or a URL to load it from (/api/users).", valueType: "any" },
      reverse: { description: "Render the items in reverse order.", valueType: "boolean" },
    },
    templates: {
      itemTemplate: {
        description: "The markup for one item.",
        contextVars: ["$item", "$itemIndex", "$isFirst", "$isLast"],
      },
    },
    childrenTemplate: "itemTemplate",
    nonVisual: true,
  },
  List: {
    description: "A virtualized list: renders only the rows in view, with groups, ordering, selection and bottom anchoring (step 29).",
    props: {
      data: { description: "The items: an array, or a URL to load it from (/api/users).", valueType: "any" },
      items: { description: "An alias of data (wins over it).", valueType: "any" },
      idKey: { description: "The item field that identifies a row: unique and never empty (default id).", valueType: "string" },
      loading: { description: "Shows a spinner (after loadingDelay) while there are no rows.", valueType: "boolean" },
      loadingDelay: { description: "Milliseconds before the loading spinner shows (default 400).", valueType: "number" },
      limit: { description: "Shows at most this many items.", valueType: "integer" },
      orderBy: { description: "Orders the items: { field, direction } (asc, desc) or an array of them.", valueType: "any" },
      scrollAnchor: { description: "bottom: starts at the end and follows new items while at the end (a chat); top (default).", valueType: "string", availableValues: ["top", "bottom"] },
      fixedItemSize: { description: "Every row is as tall as the first one (measured once).", valueType: "boolean" },
      renderCache: { description: "Keeps recently seen rows mounted after they scroll out (default true).", valueType: "boolean" },
      renderCacheSize: { description: "How many recently seen rows stay mounted (default 80).", valueType: "integer" },
      virtualBufferSize: { description: "Pixels rendered beyond each end of the viewport (default about four rows).", valueType: "number" },
      groupBy: { description: "Groups the items by this field, or by what a function of the item returns.", valueType: "any" },
      availableGroups: { description: "Only these groups are shown, in this order.", valueType: "any" },
      defaultGroups: { description: "Groups listed first, in this order (shown even when empty with hideEmptyGroups false).", valueType: "any" },
      hideEmptyGroups: { description: "Groups without items are not shown (default true).", valueType: "boolean" },
      groupsInitiallyExpanded: { description: "Groups start unfolded (default true).", valueType: "boolean" },
      borderCollapse: { description: "Bordered rows join into one block: no double borders, rounded only at the ends (default true).", valueType: "boolean" },
      rowsSelectable: { description: "Rows can be selected: click, Shift and Ctrl/Cmd click, the keys, checkboxes.", valueType: "boolean" },
      enableMultiRowSelection: { description: "Several rows can be selected (default true).", valueType: "boolean" },
      initiallySelected: { description: "The ids selected at first.", valueType: "any" },
      syncWithVar: {
        description: "The name of a variable holding { selectedIds }: the List reads its selection from it and writes it back.",
        valueType: "string",
        variableName: true,
      },
      refreshOn: {
        description: "XMLUI's re-render trigger; ignored here.",
        valueType: "any",
        deprecationMessage: "not needed in gfui: each row re-renders when what it reads changes, so 'refreshOn' is ignored",
      },
      rowUnselectablePredicate: { description: "A function of the item: true when its row can't be selected.", valueType: "any" },
      hideSelectionCheckboxes: { description: "No checkboxes; selecting still works by clicks, keys and the API.", valueType: "boolean" },
      selectionCheckboxPosition: { description: "before (default): a column before the content; overlay: over the content, at selectionCheckboxAnchor.", valueType: "string", availableValues: ["before", "overlay"] },
      selectionCheckboxAnchor: {
        description: "Where an overlay checkbox sits (default center-left).",
        valueType: "string",
        availableValues: ["top-left", "top-right", "bottom-left", "bottom-right", "center-left", "center-right"],
      },
      selectionCheckboxOffsetX: { description: "An overlay checkbox's distance from its anchor's side (default $space-2).", valueType: "string", cssKind: "size" },
      selectionCheckboxOffsetY: { description: "An overlay checkbox's distance from its anchor's top or bottom (default $space-2).", valueType: "string", cssKind: "size" },
      selectionCheckboxSize: { description: "The checkbox's size.", valueType: "string", cssKind: "size" },
      keyBindings: { description: "Shortcuts of the actions: { selectAll, cut, copy, paste, delete } (defaults CmdOrCtrl+A/X/C/V, Delete).", valueType: "any" },
    },
    events: {
      scroll: { description: "The user scrolled: { scrollTop, scrollHeight, viewportSize, atEnd, visibleRange, itemCount }." },
      visibleRangeDidChange: { description: "The rows in view changed: { startIndex, endIndex } (rows, inclusive)." },
      selectionDidChange: { description: "The selection changed: the selected items." },
      rowDoubleClick: { description: "A row was double-clicked: its item." },
      contextMenu: { description: "A row was right-clicked. A function handler receives the pointer and the row's item.", args: "pointer" },
      selectAllAction: { description: "The select-all shortcut (all rows are selected first): (row, selectedItems, selectedIds)." },
      cutAction: { description: "The cut shortcut: (row, selectedItems, selectedIds)." },
      copyAction: { description: "The copy shortcut: (row, selectedItems, selectedIds)." },
      pasteAction: { description: "The paste shortcut: (row, selectedItems, selectedIds)." },
      deleteAction: { description: "The delete shortcut: (row, selectedItems, selectedIds)." },
    },
    templates: {
      itemTemplate: { description: "The markup for one item.", contextVars: ["$item", "$itemIndex", "$isFirst", "$isLast", "$isSelected"] },
      emptyListTemplate: { description: "Shown when there are no items (default: No data available).", contextVars: [] },
      groupHeaderTemplate: { description: "A group's header: $group is { id, key, items, isExpanded, toggle() }.", contextVars: ["$group"] },
      groupFooterTemplate: { description: "After a group's last item: $group as in the header.", contextVars: ["$group"] },
    },
    childrenTemplate: "itemTemplate",
    api: {
      scrollToTop: { description: "Scrolls to the first row." },
      scrollToBottom: { description: "Scrolls to the last row." },
      scrollToIndex: { description: "Scrolls to the row at an index (group headers and footers count)." },
      scrollToId: { description: "Scrolls to the row of an item id." },
      getItemCount: { description: "The number of rows." },
      getVisibleRange: { description: "{ startIndex, endIndex } of the rows in view ({ -1, -1 } when there are none)." },
      clearSelection: { description: "Selects nothing." },
      getSelectedItems: { description: "The selected items." },
      getSelectedIds: { description: "The selected ids." },
      selectAll: { description: "Selects every selectable row (rowsSelectable, several rows)." },
      selectId: { description: "Selects an id, or an array of ids." },
    },
    themeVars: {
      "backgroundColor-List": "$backgroundColor",
      "backgroundColor-selected-List": "$color-primary-100",
      "backgroundColor-selected-List--hover": "$color-primary-100",
      "backgroundColor-row-List--hover": "$color-primary-50",
      "outlineColor-row-List--focus": "$color-primary-500",
    },
  },
  Tree: {
    description: "Hierarchical data (flat with parent ids, or nested) as a virtualized tree: expansion, single selection, keys, lazy loading, a saved state (step 31).",
    eventResults: true,
    props: {
      data: { description: "The nodes: a flat array (dataFormat flat) or nested items (hierarchy), or a URL to load them from.", valueType: "any", isRequired: true },
      dataFormat: { description: "flat (default): items with parent ids; hierarchy: items with nested children.", valueType: "string", availableValues: ["flat", "hierarchy"] },
      idField: { description: "The field with a node's unique id (default id).", valueType: "string" },
      nameField: { description: "The field with a node's text (default name).", valueType: "string" },
      iconField: { description: "The field with a node's icon (default icon).", valueType: "string" },
      iconExpandedField: { description: "The field with a node's toggle icon when expanded (default iconExpanded).", valueType: "string" },
      iconCollapsedField: { description: "The field with a node's toggle icon when collapsed (default iconCollapsed).", valueType: "string" },
      parentIdField: { description: "The field with the parent's id, in flat format (default parentId).", valueType: "string" },
      childrenField: { description: "The field with the children, in hierarchy format (default children).", valueType: "string" },
      selectableField: { description: "The field that makes a node unselectable when false (default selectable).", valueType: "string" },
      loadedField: { description: "The field that marks a node's children as still to load when false (default loaded).", valueType: "string" },
      dynamicField: { description: "The field that makes a node load its children through loadChildren (default dynamic).", valueType: "string" },
      autoLoadAfterField: { description: "The field with a node's own autoLoadAfter (default autoLoadAfter).", valueType: "string" },
      selectedValue: { description: "The selected node's id: the first selection, and it follows later changes.", valueType: "any" },
      selectedId: { description: "An alias of selectedValue.", valueType: "any" },
      defaultExpanded: { description: "What starts expanded: none (default), first-level, all, or an array of ids (their paths open).", valueType: "any" },
      initialTreeState: { description: "A saved state (getTreeState()): applied as its nodes appear; scrollPosition too.", valueType: "any" },
      dataRefreshMode: { description: "A new data value: reset (default) starts over; preserve-state keeps expansion, selection and loaded children of the nodes that remain.", valueType: "string", availableValues: ["reset", "preserve-state"] },
      autoExpandToSelection: { description: "The selected node's path opens (default true).", valueType: "boolean" },
      itemClickExpands: { description: "A click anywhere on a row toggles it, not only on its toggle icon.", valueType: "boolean" },
      iconCollapsed: { description: "The toggle icon of a collapsed node (default chevronright).", valueType: "string", knownValues: ICON_NAMES },
      iconExpanded: { description: "The toggle icon of an expanded node (default chevrondown).", valueType: "string", knownValues: ICON_NAMES },
      iconSize: { description: "The toggle icons' size (default 16).", valueType: "string" },
      itemHeight: { description: "A row's height in pixels before it is measured (default 32).", valueType: "number" },
      fixedItemSize: { description: "Every row is as tall as the first one (measured once).", valueType: "boolean" },
      animateExpand: { description: "One toggle icon (iconCollapsed), rotated by expandRotation when expanded.", valueType: "boolean" },
      expandRotation: { description: "Degrees the toggle icon turns with animateExpand (default 90).", valueType: "number" },
      dynamic: { description: "Every node loads its children through loadChildren unless its dynamic field says otherwise.", valueType: "boolean" },
      autoLoadAfter: { description: "Milliseconds: a loaded node collapsed this long loads its children again when expanded.", valueType: "number" },
      spinnerDelay: { description: "Milliseconds before a loading node shows a spinner (default 0).", valueType: "number" },
      scrollStyle: { description: "normal (default): the browser's scrollbar; overlay, whenMouseOver, whenScrolling: a thin one, always, on hover or while scrolling.", valueType: "string", availableValues: ["normal", "overlay", "whenMouseOver", "whenScrolling"] },
      showScrollerFade: { description: "Fades at the edges where there is more to scroll (with a scrollStyle other than normal).", valueType: "boolean" },
      overflow: { description: "visible: the Tree is as tall as its rows and its container scrolls.", valueType: "string" },
    },
    events: {
      selectionDidChange: { description: "The selection changed: { newNode, previousNode }." },
      nodeDidExpand: { description: "A node was expanded: the node." },
      nodeDidCollapse: { description: "A node was collapsed: the node." },
      loadChildren: { description: "A dynamic node is expanded: return (or resolve to) its children's items." },
      contextMenu: { description: "A row was right-clicked. A function handler receives the pointer and the node.", args: "pointer" },
      cutAction: { description: "Ctrl/Cmd+X on a row: the focused node." },
      copyAction: { description: "Ctrl/Cmd+C on a row: the focused node." },
      pasteAction: { description: "Ctrl/Cmd+V on a row: the focused node." },
      deleteAction: { description: "Delete on a row: the focused node." },
    },
    templates: {
      itemTemplate: {
        description: "A row's content: $item is the node (id, name, depth, isExpanded, hasChildren, children, selectable, parentId, parentIds, path, loadingState and its fields).",
        contextVars: ["$item"],
      },
    },
    api: {
      expandAll: { description: "Expands every node (not those still to load)." },
      collapseAll: { description: "Collapses every node." },
      expandToLevel: { description: "Expands the nodes above a depth (1: the roots), collapsing the rest." },
      expandNode: { description: "Expands a node by id (loading its children if it is dynamic)." },
      collapseNode: { description: "Collapses a node by id." },
      selectNode: { description: "Selects a node by id (an unknown id clears the selection)." },
      selectNodeByIndex: { description: "Selects the node in a visible row by its index." },
      clearSelection: { description: "Selects nothing." },
      getNodeById: { description: "A node by id ($item's shape), or null." },
      getExpandedNodes: { description: "The expanded nodes' ids." },
      getSelectedNode: { description: "The selected node, or null." },
      scrollIntoView: { description: "Opens a node's path and scrolls to it (options: { block })." },
      scrollToItem: { description: "Scrolls to a node if its row is visible." },
      getVisibleItems: { description: "The nodes in the rows in view." },
      getTreeState: { description: "The view state by node id (expanded, loadingState, selected, times) and scrollPosition." },
      setTreeState: { description: "Applies a saved state to the nodes that exist." },
      preserveStateOnNextDataRefresh: { description: "The next new data keeps the view state, even in reset mode: { operation: insert | delete | update, scrollTarget }." },
      appendNode: { description: "Adds a node (its item) as the last child of a node, or as a root (null)." },
      removeNode: { description: "Removes a node and its descendants." },
      removeChildren: { description: "Removes a node's descendants." },
      insertNodeBefore: { description: "Adds a node before a sibling." },
      insertNodeAfter: { description: "Adds a node after a sibling." },
      replaceNode: { description: "Merges fields into a node; its children change only when given." },
      replaceChildren: { description: "Replaces a node's children." },
      getNodeLoadingState: { description: "unloaded, loading or loaded." },
      markNodeLoaded: { description: "Marks a node's children as loaded." },
      markNodeUnloaded: { description: "Marks a node's children as still to load, and collapses it." },
      getExpandedTimestamp: { description: "When a node was last expanded (ms since the epoch)." },
      setAutoLoadAfter: { description: "A node's own autoLoadAfter (null or undefined: none)." },
      getNodeAutoLoadAfter: { description: "A node's autoLoadAfter: its own, else the Tree's." },
    },
    themeVars: {
      "backgroundColor-Tree-row--selected": "$color-primary-50",
      "backgroundColor-Tree-row--hover": "$color-surface-100",
      "textColor-Tree": "$textColor",
      "textColor-Tree--selected": "$color-primary-900",
      "textColor-Tree--hover": "$textColor",
      "borderRadius-Tree-row": "4px",
      "borderColor-Tree-row--focus": "$color-primary-500",
      "outlineColor-Tree--focus": "$color-primary-500",
      "outlineWidth-Tree--focus": "2px",
      "outlineStyle-Tree--focus": "solid",
      "outlineOffset-Tree--focus": "-2px",
      "width-indent-Tree": "$space-3",
    },
  },
  TileGrid: {
    description: "Data as a grid of fixed-size tiles, virtualized by rows; the column count follows the width; selection and keys (step 31).",
    props: {
      data: { description: "The items: an array, or a URL to load it from.", valueType: "any" },
      itemWidth: { description: "A tile's width (default 120px); with stretchItems, its minimum.", valueType: "string" },
      itemHeight: { description: "A tile's height (default 140px).", valueType: "string" },
      gap: { description: "The space between tiles (default $space-2).", valueType: "string", cssKind: "size" },
      stretchItems: { description: "The tiles of a row grow to fill its width.", valueType: "boolean" },
      loading: { description: "Shows a spinner instead of the tiles.", valueType: "boolean" },
      itemsSelectable: { description: "Tiles can be selected: click, Shift and Ctrl/Cmd click, the keys, checkboxes.", valueType: "boolean" },
      enableMultiSelection: { description: "Several tiles can be selected (default true).", valueType: "boolean" },
      toggleSelectionOnClick: { description: "A plain click toggles a tile instead of selecting only it.", valueType: "boolean" },
      syncWithVar: {
        description: "The name of a variable holding { selectedIds }: the TileGrid reads its selection from it and writes it back.",
        valueType: "string",
        variableName: true,
      },
      refreshOn: {
        description: "XMLUI's re-render trigger; ignored here.",
        valueType: "any",
        deprecationMessage: "not needed in gfui: each tile re-renders when what it reads changes, so 'refreshOn' is ignored",
      },
      hideSelectionCheckboxes: { description: "No checkboxes; selecting still works by clicks, keys and the API.", valueType: "boolean" },
      checkboxPosition: { description: "Where a tile's checkbox sits (default topStart; start and end follow the writing direction).", valueType: "string", availableValues: ["topStart", "topEnd", "bottomStart", "bottomEnd"] },
      idKey: { description: "The item field that identifies a tile (default id).", valueType: "string" },
      itemUserSelect: { description: "Whether the tiles' text can be selected (default none).", valueType: "string", availableValues: ["auto", "text", "none", "contain", "all"] },
    },
    events: {
      selectionDidChange: { description: "The selection changed: (selectedItems, selectedIds)." },
      itemDoubleClick: { description: "A tile was double-clicked: (item, itemIndex)." },
      contextMenu: { description: "A tile was right-clicked. A function handler receives the pointer, the item and its index.", args: "pointer" },
      selectAllAction: { description: "Ctrl/Cmd+A (all tiles are selected first): (selectedItems, selectedIds)." },
      cutAction: { description: "Ctrl/Cmd+X: (focusedItem, selectedItems, selectedIds)." },
      copyAction: { description: "Ctrl/Cmd+C: (focusedItem, selectedItems, selectedIds)." },
      pasteAction: { description: "Ctrl/Cmd+V: (focusedItem, selectedItems, selectedIds)." },
      deleteAction: { description: "Delete: (focusedItem, selectedItems, selectedIds)." },
    },
    templates: {
      itemTemplate: { description: "A tile's content.", contextVars: ["$item", "$itemIndex", "$isFirst", "$isLast", "$selected"] },
    },
    childrenTemplate: "itemTemplate",
    api: {
      clearSelection: { description: "Selects nothing." },
      selectAll: { description: "Selects every tile (several tiles)." },
      selectId: { description: "Selects an id, or an array of ids." },
      getSelectedItems: { description: "The selected items." },
      getSelectedIds: { description: "The selected ids." },
    },
    themeVars: {
      "backgroundColor-item-TileGrid": "transparent",
      "backgroundColor-item-TileGrid--hover": "$color-surface-100",
      "backgroundColor-item-TileGrid--selected": "$color-surface-100",
      "backgroundColor-item-TileGrid--selected--hover": "$color-primary-100",
      "borderRadius-item-TileGrid": "$borderRadius",
      "offsetVertical-checkbox-TileGrid": "$space-1",
      "offsetHorizontal-checkbox-TileGrid": "$space-1",
      "outlineColor-item-TileGrid--focus": "$color-primary-500",
      "outlineWidth-item-TileGrid--focus": "2px",
      "outlineStyle-item-TileGrid--focus": "solid",
      "outlineOffset-item-TileGrid--focus": "-2px",
    },
  },
  Table: {
    description: "Rows of data in columns: Column children (also from Items) or columns inferred from the data; virtualized, sortable, selectable, resizable, pinned, paged (step 30).",
    childrenAsColumns: "Column",
    eventResults: true,
    props: {
      data: { description: "The rows: an array, or a URL to load it from (/api/orders).", valueType: "any" },
      items: { description: "An alias of data (wins over it).", valueType: "any" },
      idKey: { description: "The row field that identifies a row: unique and never empty (default id).", valueType: "string" },
      loading: { description: "Shows a spinner (after loadingDelay) while there are no rows.", valueType: "boolean" },
      loadingDelay: { description: "Milliseconds before the loading spinner shows (default 400).", valueType: "number" },
      columnInference: { description: "Without Column children, how rows are sampled to infer columns and types: first-n(25) (default), first-only, sample(n), all, off.", valueType: "string" },
      columnSizing: { description: "How columns without a width are sized: auto (balanced for inferred columns, stretch for explicit ones), stretch, balanced (by type), content.", valueType: "string", availableValues: ["auto", "stretch", "balanced", "content"] },
      canResizeColumns: { description: "Columns can be resized by dragging their header's edge or with the arrow keys (default true).", valueType: "boolean" },
      renderCache: { description: "Keeps recently seen rows mounted after they scroll out (default true).", valueType: "boolean" },
      renderCacheSize: { description: "How many recently seen rows stay mounted (default 80).", valueType: "integer" },
      virtualBufferSize: { description: "Pixels rendered beyond each end of the viewport.", valueType: "number" },
      isPaginated: { description: "Pages the rows (the controls hide when everything fits one page). Without it, pageSize alone pages when the rows don't fit.", valueType: "boolean" },
      pageSize: { description: "Rows per page.", valueType: "integer" },
      pageSizeOptions: { description: "The page sizes the user can pick (an array of numbers).", valueType: "any" },
      showPageInfo: { description: "Shows \"Page n of m (k items)\" (default true).", valueType: "boolean" },
      showPageSizeSelector: { description: "Shows the page size selector when there are several sizes (default true).", valueType: "boolean" },
      showCurrentPage: { description: "Shows the current page number (default true).", valueType: "boolean" },
      pageSizeSelectorPosition: { description: "Where the page size selector goes: start (default), center, end.", valueType: "string", availableValues: ["start", "center", "end"] },
      pageInfoPosition: { description: "Where the page information goes: start, center, end (default).", valueType: "string", availableValues: ["start", "center", "end"] },
      buttonRowPosition: { description: "Where the page buttons go: start, center (default), end.", valueType: "string", availableValues: ["start", "center", "end"] },
      paginationControlsLocation: { description: "Where the pager is: top, bottom (default), both.", valueType: "string", availableValues: ["top", "bottom", "both"] },
      alwaysShowPagination: { description: "true: the pager shows even with one page; false: never.", valueType: "boolean" },
      headerHeight: { description: "The header row's height.", valueType: "string", cssKind: "size" },
      rowsSelectable: { description: "Rows can be selected: click, Shift and Ctrl/Cmd click, the keys, checkboxes.", valueType: "boolean" },
      enableMultiRowSelection: { description: "Several rows can be selected (default true).", valueType: "boolean" },
      toggleSelectionOnClick: { description: "A plain click toggles a row instead of selecting only it.", valueType: "boolean" },
      initiallySelected: { description: "The ids selected at first.", valueType: "any" },
      syncWithVar: { description: "The name of a variable holding { selectedIds }: the Table reads its selection from it and writes it back.", valueType: "string", variableName: true },
      rowDisabledPredicate: { description: "A function of the row: true when the row is disabled (dimmed, not selectable).", valueType: "any" },
      rowUnselectablePredicate: { description: "A function of the row: true when it can't be selected.", valueType: "any" },
      rowVariant: { description: "A function of the row naming its variant: backgroundColor-row-<name>-Table (and --hover), textColor-row-<name>-Table.", valueType: "any" },
      expandedRowIds: { description: "The ids of the rows whose details are open (controlled; with rowExpansionDidChange).", valueType: "any" },
      initiallyExpandedRowIds: { description: "The ids of the rows whose details are open at first.", valueType: "any" },
      sortBy: { description: "The field the rows are sorted by (follows later changes).", valueType: "string" },
      sortDirection: { description: "ascending or descending (with sortBy).", valueType: "string", availableValues: ["ascending", "descending"] },
      defaultSortDirection: { description: "The direction of a column's first sorting click (and of sortBy without sortDirection): ascending (default) or descending.", valueType: "string", availableValues: ["ascending", "descending"] },
      autoFocus: { description: "Focuses the Table when it mounts.", valueType: "boolean" },
      hideHeader: { description: "No header row.", valueType: "boolean" },
      alwaysShowHeader: { description: "The header sticks at the top while the page scrolls.", valueType: "boolean" },
      hideSelectionCheckboxes: { description: "No checkboxes; selecting still works by clicks, keys and the API.", valueType: "boolean" },
      hideSelectionCheckboxesHeader: { description: "No select-all checkbox in the header.", valueType: "boolean" },
      alwaysShowSelectionCheckboxes: { description: "Row checkboxes show always, not only on hover or when selected.", valueType: "boolean" },
      alwaysShowSelectionCheckboxesHeader: { description: "The select-all checkbox shows always, not only on hover.", valueType: "boolean" },
      alwaysShowSortingIndicator: { description: "Sort icons show on every sortable header, not only on hover or when sorted.", valueType: "boolean" },
      iconNoSort: { description: "The icon of an unsorted sortable column (- for none).", valueType: "string" },
      iconSortAsc: { description: "The icon of an ascending column.", valueType: "string" },
      iconSortDesc: { description: "The icon of a descending column.", valueType: "string" },
      noBottomBorder: { description: "No border under the last row.", valueType: "boolean" },
      striped: { description: "Rows alternate backgroundColor-evenRow-Table and backgroundColor-oddRow-Table.", valueType: "boolean" },
      highlightHoveredColumn: { description: "Hovering a cell tints its column (backgroundColor-column-Table--hover).", valueType: "boolean" },
      cellVerticalAlign: { description: "Vertical alignment of cell content: top, center (default), bottom.", valueType: "string", availableValues: ["top", "center", "bottom"] },
      checkboxTolerance: { description: "Extra clickable space around the row checkboxes: none, compact (default, 8px), comfortable (12px), spacious (16px).", valueType: "string", availableValues: ["none", "compact", "comfortable", "spacious"] },
      keyBindings: { description: "Shortcuts of the actions: { selectAll, cut, copy, paste, delete } (defaults CmdOrCtrl+A/X/C/V, Delete).", valueType: "any" },
      userSelectCell: { description: "CSS user-select of cells.", valueType: "string", availableValues: ["auto", "text", "none", "contain", "all"] },
      userSelectRow: { description: "CSS user-select of rows.", valueType: "string", availableValues: ["auto", "text", "none", "contain", "all"] },
      userSelectHeading: { description: "CSS user-select of the header.", valueType: "string", availableValues: ["auto", "text", "none", "contain", "all"] },
      cellUserSelect: { description: "An older name of userSelectCell.", valueType: "string", availableValues: ["auto", "text", "none", "contain", "all"] },
      headerUserSelect: { description: "An older name of userSelectHeading.", valueType: "string", availableValues: ["auto", "text", "none", "contain", "all"] },
      refreshOn: { description: "XMLUI's re-render trigger; ignored here.", valueType: "any", deprecationMessage: "not needed in gfui: each row re-renders when what it reads changes, so 'refreshOn' is ignored" },
    },
    removedProps: {
      syncWithAppState: { message: "gfui has no AppState: use syncWithVar with a variable holding { selectedIds }" },
    },
    events: {
      sortingDidChange: { description: "The sorting changed: (field, direction); field is undefined when unsorted." },
      willSort: { description: "Before a header click sorts: (field, direction); returning false cancels." },
      rowClick: { description: "A row was clicked: its item." },
      rowDoubleClick: { description: "A row was double-clicked: its item." },
      rowEnter: { description: "The pointer entered a row: its item." },
      rowLeave: { description: "The pointer left a row: its item." },
      contextMenu: { description: "A row was right-clicked. A function handler receives the pointer and the row's item.", args: "pointer" },
      scroll: { description: "The user scrolled: { scrollTop, scrollHeight, viewportSize, atEnd, visibleRange, itemCount }." },
      visibleRangeDidChange: { description: "The rows in view changed: { startIndex, endIndex }." },
      selectionDidChange: { description: "The selection changed: the selected rows." },
      rowExpansionDidChange: { description: "A row's details opened or closed: (expandedIds, id, isExpanded)." },
      selectAllAction: { description: "The select-all shortcut (all rows are selected first): (row, selectedItems, selectedIds)." },
      cutAction: { description: "The cut shortcut: (row, selectedItems, selectedIds)." },
      copyAction: { description: "The copy shortcut: (row, selectedItems, selectedIds)." },
      pasteAction: { description: "The paste shortcut: (row, selectedItems, selectedIds)." },
      deleteAction: { description: "The delete shortcut: (row, selectedItems, selectedIds)." },
    },
    templates: {
      noDataTemplate: { description: "Shown when there are no rows (default: No data available).", contextVars: [] },
      rowDetailTemplate: { description: "A row's details, under it when expanded (adds an expansion column).", contextVars: ["$item", "$row", "$itemIndex", "$rowIndex", "$rowId", "$isExpanded"] },
    },
    api: {
      scrollToTop: { description: "Scrolls to the first row." },
      scrollToBottom: { description: "Scrolls to the last row." },
      scrollToIndex: { description: "Scrolls to the row at an index (detail rows count)." },
      scrollToId: { description: "Scrolls to the row of an id." },
      getItemCount: { description: "The number of rows." },
      getVisibleRange: { description: "{ startIndex, endIndex } of the rows in view." },
      expandRow: { description: "Opens a row's details by id." },
      collapseRow: { description: "Closes a row's details by id." },
      toggleRowExpansion: { description: "Opens or closes a row's details by id." },
      getExpandedRowIds: { description: "The ids of the rows whose details are open." },
      isRowExpanded: { description: "Whether a row's details are open." },
      clearSelection: { description: "Selects nothing." },
      getSelectedItems: { description: "The selected rows." },
      getSelectedIds: { description: "The selected ids." },
      selectAll: { description: "Selects every selectable row." },
      selectId: { description: "Selects an id, or an array of ids." },
    },
    themeVars: {
      "backgroundColor-Table": "$backgroundColor",
      "textColor-Table": "$textColor",
      "borderRadius-Table": "0px",
      "borderColor-cell-Table": "$borderColor",
      "padding-cell-Table": "$space-2",
      "fontSize-row-Table": "inherit",
      "fontWeight-row-Table": "inherit",
      "backgroundColor-row-Table": "transparent",
      "backgroundColor-row-Table--hover": "$color-primary-50",
      "textColor-row-Table": "inherit",
      "backgroundColor-selected-Table": "$color-primary-100",
      "backgroundColor-selected-Table--hover": "$color-primary-100",
      "backgroundColor-evenRow-Table": "transparent",
      "backgroundColor-oddRow-Table": "$color-surface-50",
      "backgroundColor-heading-Table": "$color-surface-100",
      "backgroundColor-heading-Table--hover": "$color-surface-200",
      "textColor-heading-Table": "$textColor",
      "fontWeight-heading-Table": "600",
      "fontSize-heading-Table": "inherit",
      "textTransform-heading-Table": "none",
      "backgroundColor-pinnedCell-Table": "$backgroundColor",
      "backgroundColor-column-Table--hover": "$color-primary-50",
      "outlineColor-row-Table--focus": "$color-primary-500",
    },
  },
  Column: {
    description: "A column of a Table: the field it shows (bindTo), its header, width, sorting, pinning, display type; its children are the cell's markup.",
    parents: ["Table"],
    layoutProps: false,
    props: {
      bindTo: { description: "The row field the column shows (a dotted path); without it the column can't sort.", valueType: "string" },
      header: { description: "The header text (default: bindTo).", valueType: "string" },
      headerHorizontalAlignment: { description: "The header's alignment: start, center, end.", valueType: "string", availableValues: ["start", "center", "end"] },
      tooltip: { description: "Text shown when hovering the column's cells.", valueType: "string" },
      tooltipOptions: { description: "XMLUI's tooltip options (accepted; the cells use a plain title).", valueType: "any" },
      width: { description: "A width in px (or a number), rem/em, or a star size (*, 2*) sharing the free space.", valueType: "any" },
      minWidth: { description: "The narrowest the column gets.", valueType: "any" },
      maxWidth: { description: "The widest the column gets.", valueType: "any" },
      canSort: { description: "A header click sorts by this column (default true with bindTo).", valueType: "boolean" },
      defaultSortDirection: { description: "This column's first sorting direction: ascending or descending.", valueType: "string", availableValues: ["ascending", "descending"] },
      pinTo: { description: "Keeps the column at the left or right edge while scrolling sideways.", valueType: "string", availableValues: ["left", "right"] },
      canResize: { description: "The column can be resized (default: the Table's canResizeColumns).", valueType: "boolean" },
      type: { description: "The display type: text, number(8,3), currency(EUR), date(short), email, url(label:domain), checkbox, switch, color, … (45 types).", valueType: "string" },
      typeOptions: { description: "Options of the type as an object (wins over the type's arguments): locale, currency, maxLines, a label map, alt, …", valueType: "any" },
      readOnly: { description: "Interactive cells (checkbox, switch, color) show but don't change; a value or a function of (row, rowIndex, colIndex, columnId, cell).", valueType: "any" },
      enabled: { description: "Interactive cells respond (default true); a value or a function of (row, rowIndex, colIndex, columnId, cell).", valueType: "any" },
    },
    events: {
      willChange: { description: "Before an interactive cell changes: (newValue, row, rowIndex, columnId); returning false cancels." },
      didChange: { description: "An interactive cell changed: (newValue, row, rowIndex, columnId). Rows are read-only: assign the variable holding them." },
    },
    templates: {
      cellTemplate: { description: "The cell's markup (the Column's children).", contextVars: ["$item", "$row", "$itemIndex", "$rowIndex", "$cell", "$colIndex", "$rowId"] },
    },
    childrenTemplate: "cellTemplate",
  },
  Value: {
    description: "A read-only value with type-aware formatting (the Table's column types outside a table).",
    props: {
      value: { description: "The value to show (null and undefined show nothing, except type json).", valueType: "any" },
      type: { description: "The display type, as a Column's: text, number(8,3), currency(EUR), date(short), email, url(label:domain), json, …", valueType: "string" },
      typeOptions: { description: "Options of the type as an object (wins over the type's arguments).", valueType: "any" },
    },
    themeVars: { "borderColor-Value": "$borderColor" },
  },
  Pagination: {
    description: "Page buttons, a page size selector and page information (step 30).",
    props: {
      enabled: { description: "The controls respond (default true).", valueType: "boolean" },
      itemCount: { description: "The number of items; without it only previous and next show (hasPrevPage, hasNextPage).", valueType: "integer" },
      pageSize: { description: "Items per page (default 10; follows changes).", valueType: "integer" },
      pageIndex: { description: "The current page, 0-based (default 0; follows changes).", valueType: "integer" },
      maxVisiblePages: { description: "How many page buttons show: 1 (default), 3 or 5.", valueType: "integer", availableValues: ["1", "3", "5"] },
      showPageInfo: { description: "Shows \"Page n of m (k items)\" (default true).", valueType: "boolean" },
      showPageSizeSelector: { description: "Shows the page size selector when there are several sizes (default true).", valueType: "boolean" },
      showCurrentPage: { description: "Shows the current page number with one page button (default true).", valueType: "boolean" },
      pageSizeOptions: { description: "The page sizes the user can pick (an array of numbers).", valueType: "any" },
      hasPrevPage: { description: "Without itemCount: the previous button is enabled.", valueType: "boolean" },
      hasNextPage: { description: "Without itemCount: the next button is enabled.", valueType: "boolean" },
      orientation: { description: "horizontal (default) or vertical.", valueType: "string", availableValues: ["horizontal", "vertical"] },
      pageSizeSelectorPosition: { description: "start (default), center, end.", valueType: "string", availableValues: ["start", "center", "end"] },
      pageInfoPosition: { description: "start, center, end (default).", valueType: "string", availableValues: ["start", "center", "end"] },
      buttonRowPosition: { description: "start, center (default), end.", valueType: "string", availableValues: ["start", "center", "end"] },
    },
    events: {
      pageDidChange: { description: "The page changed: (pageIndex, pageSize, itemCount)." },
      pageSizeDidChange: { description: "The page size changed: the new size." },
    },
    api: {
      moveFirst: { description: "Goes to the first page." },
      moveLast: { description: "Goes to the last page." },
      movePrev: { description: "Goes to the previous page." },
      moveNext: { description: "Goes to the next page." },
      currentPage: { description: "The current page, 1-based." },
      currentPageSize: { description: "The current page size." },
    },
  },
  Pages: {
    description: "Renders the first Page whose url matches the current route (and every other child).",
    props: {
      fallbackPath: { description: "Where an unmatched route goes (default \"/\").", valueType: "string" },
    },
    nonVisual: true,
  },
  Page: {
    description: "One route of Pages: its content shows while its url matches.",
    props: {
      url: {
        description: "The route pattern: /static, /users/:id, /users/:id? (optional), /files/* (the rest, as $routeParams['*']).",
        valueType: "string",
        isRequired: true,
        isLiteral: true,
      },
    },
    nonVisual: true,
    isRoute: true,
  },
  Link: {
    description: "A link to a route or a URL: `label`, or the nested content.",
    props: {
      to: { description: "A route (/tests/theming) or a URL (https://…, mailto:…). Without one the link can only be clicked.", valueType: "string" },
      label: { description: "The link's text. Nested content is used when it is absent.", valueType: "string" },
      icon: { description: "An icon before the text (an Icon name).", valueType: "string", knownValues: ICON_NAMES },
      target: {
        description: "Where to open it: _self (default), _blank (a new tab), _parent, _top.",
        valueType: "string",
        availableValues: ["_self", "_blank", "_parent", "_top", "_unfencedTop"],
      },
      enabled: { description: "false: the link can't be followed (default true).", valueType: "boolean" },
      active: { description: "Shows the link as active.", valueType: "boolean" },
      noIndicator: { description: "No underline or link color: it looks like its content.", valueType: "boolean" },
      ...TEXT_OVERFLOW_PROPS,
    },
    events: { click: { description: "Clicked, before the navigation. The handler receives no arguments.", args: "none" } },
    themeVars: {
      "textColor-Link": "$color-primary-600",
      "textColor-Link--hover": "$color-primary-500",
      "textColor-Link--active": "$color-primary-700",
      "fontWeight-Link--active": "600",
      "textDecorationLine-Link": "underline",
      "textUnderlineOffset-Link": "$space-1",
      "gap-icon-Link": "$gap-tight",
    },
  },
  ...DISPLAY_COMPONENTS,
  ...SHELL_COMPONENTS,
  ...STEP32_COMPONENTS,
  Stack: {
    description: "Lays out its children in a column or a row, or wraps them into rows (a flow). Gaps and paddings are automatic.",
    props: {
      ...STACK_PROPS,
      orientation: { description: '"vertical" (default) or "horizontal".', valueType: "string", availableValues: ["vertical", "horizontal"] },
    },
    optionalThemeVars: ["gap-Stack"],
  },
  VStack: stackAlias("vertical", false),
  HStack: stackAlias("horizontal", false),
  CVStack: stackAlias("vertical", true),
  CHStack: stackAlias("horizontal", true),
  SpaceFiller: {
    description: "Takes the free space of a stack, pushing what follows to the end; in a wrapping stack, a line break.",
    props: {},
  },
  FlowLayout: {
    description: "Removed: a wrapping stack does its job.",
    props: {},
    removed: `use <HStack wrapContent="true">; the gaps are automatic (or use gap), and itemWidth sets the children's width`,
  },

};

/** Every component's (and behavior's) theme variable defaults, merged (the first layer of every theme). */
export function componentThemeDefaults(metadata: Readonly<Record<string, ComponentMetadata>> = componentMetadata): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const component of Object.values(metadata)) Object.assign(defaults, component.themeVars);
  for (const behavior of BEHAVIORS) Object.assign(defaults, behavior.themeVars);
  return defaults;
}

/**
 * Whether `name` is a theme variable: a known name, or a known component
 * variable with a variant segment (`backgroundColor-Button-danger`,
 * `backgroundColor-Button-danger--hover`: the variant behavior reads them).
 */
export function isKnownThemeVariable(name: string, known: ReadonlySet<string>): boolean {
  if (known.has(name)) return true;
  // Step 30: a Table row variant sits mid-name (XMLUI): backgroundColor-row-<variant>-Table(--hover).
  const rowVariant = /^(backgroundColor|textColor)-row-[A-Za-z][A-Za-z0-9_-]*-Table(--hover)?$/.exec(name);
  if (rowVariant) return known.has(`${rowVariant[1]}-row-Table${rowVariant[2] ?? ""}`);
  const [main = "", ...states] = name.split("--");
  const variant = /^(.*-[A-Z][A-Za-z0-9_]*)-[a-z][A-Za-z0-9]*$/.exec(main);
  if (!variant) return false;
  return known.has([variant[1], ...states].join("--"));
}

/** Which behaviors attach to an element of a component, given the attributes it sets (in application order). */
export function attachedBehaviors(metadata: ComponentMetadata, attributes: ReadonlySet<string>): BehaviorMetadata[] {
  if (metadata.nonVisual) return [];
  return BEHAVIORS.filter(
    (behavior) =>
      behavior.triggerProps.some((prop) => attributes.has(prop) && !Object.hasOwn(metadata.props, prop)) &&
      (!behavior.requiresThemeVars || Object.keys(metadata.themeVars ?? {}).length > 0) &&
      (!behavior.requiresValueApi || (Object.hasOwn(metadata.api ?? {}, "value") && Object.hasOwn(metadata.api ?? {}, "setValue"))),
  );
}

export { BEHAVIORS, type BehaviorMetadata } from "./behaviors-metadata";
export { ICON_NAMES } from "./icon-names";
export * from "./layout-metadata";

/** Whether elements of the component accept the layout props (LAYOUT_PROPS). */
export function acceptsLayoutProps(metadata: ComponentMetadata): boolean {
  return !metadata.nonVisual && metadata.layoutProps !== false && metadata.removed === undefined;
}

/** A layout prop's metadata, when the component accepts it and has no own prop of that name. */
export function layoutProp(metadata: ComponentMetadata, name: string): PropMetadata | undefined {
  if (Object.hasOwn(metadata.props, name) || !acceptsLayoutProps(metadata) || !Object.hasOwn(LAYOUT_PROPS, name)) return undefined;
  return LAYOUT_PROPS[name];
}

/** Every known theme variable name (`<Theme>` attributes are checked against them). */
export function themeVariableNames(metadata: Readonly<Record<string, ComponentMetadata>> = componentMetadata): string[] {
  const names = new Set<string>();
  for (const tone of TONES) {
    for (const themeId of THEME_IDS) {
      for (const name of Object.keys(themeVariables({ themeId, tone, themes: BUILT_IN_THEME_MAP, componentDefaults: componentThemeDefaults(metadata) }))) names.add(name);
    }
  }
  for (const component of Object.values(metadata)) for (const name of component.optionalThemeVars ?? []) names.add(name);
  return [...names].sort();
}

export * from "./theming/engine";
export * from "./theming/themes";
