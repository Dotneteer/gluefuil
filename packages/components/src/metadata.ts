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
  /**
   * The component is another one with fixed props (`HStack` is `Stack`
   * with `orientation="horizontal"`). The compiler renders `component`;
   * markup values win over `props`.
   */
  alias?: { component: string; props: Record<string, string> };
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
}

export interface EventMetadata {
  description: string;
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
  showAnchor: { description: "Gives the heading an id from its text and a # link to it, shown on hover.", valueType: "boolean" },
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
  gotFocus: { description: "The input got the keyboard focus. No arguments." },
  lostFocus: { description: "The input lost the keyboard focus. No arguments." },
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
      click: { description: "Clicked. The handler receives no arguments." },
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
      click: { description: "Clicked. The handler receives no arguments." },
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
const CLICK = { description: "Clicked (or Enter or Space when focused). The handler receives no arguments." };
const CONTEXT_MENU = { description: "Right-clicked: replaces the browser's menu. The handler receives no arguments." };

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
      click: { description: "Clicked (the second click of a double click is not one). The handler receives no arguments." },
      doubleClick: { description: "Double-clicked. The handler receives no arguments." },
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
      logo: { description: "The logo image's URL.", valueType: "string" },
      "logo-light": { description: "The logo in the light tone.", valueType: "string" },
      "logo-dark": { description: "The logo in the dark tone.", valueType: "string" },
      defaultTheme: { description: "The theme until `setTheme()`.", valueType: "string", availableValues: THEME_IDS },
      defaultTone: { description: "The tone until `setThemeTone()`.", valueType: "string", availableValues: TONES },
      useHashBasedRouting: { description: "Routes after `#` (default true: any static server works); false: the path and the History API.", valueType: "boolean" },
    },
    events: {
      willNavigate: {
        description:
          "Before a navigation (navigate(), a Link or NavLink click, back or forward; not the Pages fallback or the first load). Receives the target path (with its query) and the query parameters; returning false cancels it. A handler that throws or times out cancels it too.",
      },
      didNavigate: { description: "After a navigation (not the first load). Receives the path (with its query) and the query parameters." },
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
      click: { description: "The button was clicked. The handler receives no arguments (no DOM event)." },
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
    },
    events: {
      willSubmit: { description: "Before submitting, after validation: `(data, allData)`. `false` cancels; an object replaces the submitted data." },
      submit: { description: "Submits: `(data)`. Its result is passed to `success`; a throw is a failed submit." },
      success: { description: "The submit succeeded: `(result)`." },
      submitError: { description: "The submit failed: `(error, problem)`. `problem` is the server's validation problem (`{ fields, detail }`), if it sent one." },
      cancel: { description: "The Cancel button was clicked. The data stays." },
      reset: { description: "The form was reset (the `reset()` method, or `dataAfterSubmit`)." },
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
      body: { description: "The request body (an object is sent as JSON); may use $param.", valueType: "any", deferred: ["$param", "$params"] },
      invalidates: {
        description: "URL paths whose DataSources refetch after success (and those below them). Default: every DataSource.",
        valueType: "any",
        deferred: ["$param", "$params"],
      },
      retries: { description: "Retries of retryable failures. Default 0: a write is not repeated unless asked.", valueType: "integer" },
      retryDelay: { description: "The first wait between attempts in ms, doubled each time. Default 500.", valueType: "integer" },
      timeoutMs: { description: "Per attempt, in ms. Default 30000.", valueType: "integer" },
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
  },
  Items: {
    description: "Renders `data` through its item template, without a wrapper element.",
    props: {
      data: { description: "The array of items, or a URL to load it from (/api/users).", valueType: "any" },
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
    events: { click: { description: "Clicked, before the navigation. The handler receives no arguments." } },
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
