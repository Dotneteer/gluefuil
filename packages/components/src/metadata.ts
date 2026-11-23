// React-free entry point: component metadata (and the theme engine). The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @patchfuil/runtime. The boundary test in tools/ enforces this.

import { BEHAVIORS, type BehaviorMetadata } from "./behaviors-metadata";
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

export const componentMetadata: Readonly<Record<string, ComponentMetadata>> = {
  App: {
    description: "The root of an application: applies the active theme and tone.",
    props: {
      defaultTheme: { description: "The theme until `setTheme()`.", valueType: "string", availableValues: THEME_IDS },
      defaultTone: { description: "The tone until `setThemeTone()`.", valueType: "string", availableValues: TONES },
      useHashBasedRouting: { description: "Routes after `#` (default true: any static server works); false: the path and the History API.", valueType: "boolean" },
    },
    themeVars: {
      "backgroundColor-App": "$backgroundColor",
      "textColor-App": "$textColor",
      "fontFamily-App": "$fontFamily",
      "fontSize-App": "$fontSize",
    },
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
  Items: {
    description: "Renders `data` through its item template, without a wrapper element.",
    props: {
      data: { description: "The array of items.", valueType: "any" },
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
  Stack: {
    description: "Lays out its children in a column or a row.",
    props: {
      orientation: { description: '"vertical" (default) or "horizontal".', valueType: "string", availableValues: ["vertical", "horizontal"] },
      gap: { description: "Space between children, as a CSS length.", valueType: "string" },
    },
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

/** Every known theme variable name (`<Theme>` attributes are checked against them). */
export function themeVariableNames(metadata: Readonly<Record<string, ComponentMetadata>> = componentMetadata): string[] {
  const names = new Set<string>();
  for (const tone of TONES) {
    for (const themeId of THEME_IDS) {
      for (const name of Object.keys(themeVariables({ themeId, tone, themes: BUILT_IN_THEME_MAP, componentDefaults: componentThemeDefaults(metadata) }))) names.add(name);
    }
  }
  return [...names].sort();
}

export * from "./theming/engine";
export * from "./theming/themes";
