// React-free entry point: component metadata (and the theme engine). The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @patchfuil/runtime. The boundary test in tools/ enforces this.

import { BEHAVIORS, type BehaviorMetadata } from "./behaviors-metadata";
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
}

export interface EventMetadata {
  description: string;
  /** Handling it is a warning with this message. */
  deprecationMessage?: string;
}

/** XMLUI's Text variants that pfui implements (text.tsx). */
const TEXT_VARIANTS = [
  "abbr", "caption", "cite", "code", "deleted", "em", "inserted", "keyboard", "marked", "mono", "paragraph",
  "placeholder", "sample", "secondary", "small", "strong", "sub", "subheading", "subtitle", "sup", "title", "var",
];

const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6", "H1", "H2", "H3", "H4", "H5", "H6", "1", "2", "3", "4", "5", "6"];

const HEADING_THEME_VARS: Record<string, string> = {
  "textColor-Heading": "$textColor",
  "fontWeight-Heading": "600",
  "lineHeight-Heading": "1.25",
  "fontSize-H1": "2em",
  "fontSize-H2": "1.5em",
  "fontSize-H3": "1.25em",
  "fontSize-H4": "1.1em",
  "fontSize-H5": "1em",
  "fontSize-H6": "0.9em",
};

function headingShortcut(level: number): ComponentMetadata {
  return {
    description: `A level ${level} heading (Heading level="h${level}").`,
    props: {
      value: { description: "The heading text. Nested text is used when it is absent.", valueType: "any" },
      maxLines: { description: "Clamps the heading to this many lines, with an ellipsis.", valueType: "integer" },
    },
  };
}


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
      icon: { description: "A built-in icon name: home, list, settings, user, info, star, folder, chart, mail, search, layout.", valueType: "string" },
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
      icon: { description: "A built-in icon name (see NavLink).", valueType: "string" },
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

const ALIGNMENTS = ["start", "center", "end", "stretch"];

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
      maxLines: { description: "Clamps the text to this many lines, with an ellipsis.", valueType: "integer" },
    },
  },
  Heading: {
    description: "A heading, h1 to h6: `value`, or the nested text.",
    themeVars: HEADING_THEME_VARS,
    props: {
      value: { description: "The heading text. Nested text is used when it is absent.", valueType: "any" },
      level: { description: "h1 (default) … h6; also H1 … H6 and 1 … 6.", valueType: "string", availableValues: HEADING_LEVELS },
      maxLines: { description: "Clamps the heading to this many lines, with an ellipsis.", valueType: "integer" },
    },
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
  TextBox: {
    description: "A single-line text input (Mantine TextInput).",
    props: {
      initialValue: { description: "The text when the component mounts.", valueType: "any" },
      placeholder: { description: "Shown while the text is empty.", valueType: "string" },
      enabled: { description: "false: disabled.", valueType: "boolean" },
    },
    events: {
      didChange: { description: "The text changed by typing; `$param` is the new text." },
    },
    themeVars: {
      "backgroundColor-TextBox": "$backgroundColor",
      "textColor-TextBox": "$textColor",
      "borderColor-TextBox": "$borderColor",
      "borderColor-TextBox--focus": "$color-primary-500",
      "borderRadius-TextBox": "$borderRadius",
    },
    api: {
      value: { description: "The current text (reactive)." },
      setValue: { description: "Replaces the text." },
      focus: { description: "Moves the keyboard focus to the input." },
    },
  },
  Select: {
    description: "Picks one value from a list (Mantine Select).",
    props: {
      options: { description: "The choices: strings, or { value, label } objects.", valueType: "any" },
      initialValue: { description: "The selected value when the component mounts.", valueType: "any" },
      placeholder: { description: "Shown while nothing is selected.", valueType: "string" },
      enabled: { description: "false: disabled.", valueType: "boolean" },
      searchable: { description: "Filter the options by typing.", valueType: "boolean" },
      clearable: { description: "Show a button that clears the selection.", valueType: "boolean" },
    },
    events: {
      didChange: { description: "The selection changed; `$param` is the new value (null when cleared)." },
    },
    templates: {
      optionTemplate: { description: "The markup for one option in the list.", contextVars: ["$item", "$checked"] },
    },
    themeVars: {
      "backgroundColor-Select": "$backgroundColor",
      "textColor-Select": "$textColor",
      "borderColor-Select": "$borderColor",
      "borderColor-Select--focus": "$color-primary-500",
      "borderRadius-Select": "$borderRadius",
    },
    api: {
      value: { description: "The selected value (reactive); null when none." },
      setValue: { description: "Selects a value." },
      focus: { description: "Moves the keyboard focus to the input." },
    },
  },
  Checkbox: {
    description: "A checkbox with its own label (Mantine Checkbox).",
    props: {
      label: { description: "The checkbox's label.", valueType: "string" },
      initialValue: { description: "Checked when the component mounts.", valueType: "boolean" },
      enabled: { description: "false: disabled.", valueType: "boolean" },
    },
    events: {
      didChange: { description: "Checked or unchecked by the user; `$param` is the new state." },
    },
    themeVars: {
      "backgroundColor-Checkbox--checked": "$color-primary-500",
      "borderRadius-Checkbox": "$borderRadius",
    },
    api: {
      value: { description: "Whether it is checked (reactive)." },
      setValue: { description: "Checks or unchecks it." },
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
    description: "A link to a route: `label`, or the nested content.",
    props: {
      to: { description: "The route to go to: /tests/theming.", valueType: "string", isRequired: true },
      label: { description: "The link's text. Nested content is used when it is absent.", valueType: "string" },
    },
    themeVars: {
      "textColor-Link": "$color-primary-600",
    },
  },
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
      (!behavior.requiresThemeVars || Object.keys(metadata.themeVars ?? {}).length > 0),
  );
}

export { BEHAVIORS, type BehaviorMetadata } from "./behaviors-metadata";
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
