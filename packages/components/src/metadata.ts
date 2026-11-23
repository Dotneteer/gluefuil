// React-free entry point: component metadata only. The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @patchfuil/runtime. The boundary test in tools/ enforces this.

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
}

export interface EventMetadata {
  description: string;
  /** Handling it is a warning with this message. */
  deprecationMessage?: string;
}

export const componentMetadata: Readonly<Record<string, ComponentMetadata>> = {
  App: {
    description: "The root of an application.",
    props: {},
  },
  Text: {
    description: "Displays text: `value`, or the nested text.",
    props: {
      value: { description: "The text to display. Nested text is used when it is absent.", valueType: "any" },
    },
  },
  Button: {
    description: "A clickable button: `label`, or the nested content.",
    props: {
      label: { description: "The button's text. Nested content is used when it is absent.", valueType: "string" },
    },
    events: {
      click: { description: "The button was clicked. The handler receives no arguments (no DOM event)." },
    },
  },
  TextBox: {
    description: "A single-line text input.",
    props: {
      initialValue: { description: "The text when the component mounts.", valueType: "any" },
      placeholder: { description: "Shown while the text is empty.", valueType: "string" },
    },
    events: {
      didChange: { description: "The text changed by typing; `$param` is the new text." },
    },
    api: {
      value: { description: "The current text (reactive)." },
      setValue: { description: "Replaces the text." },
      focus: { description: "Moves the keyboard focus to the input." },
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
  },
  Stack: {
    description: "Lays out its children in a column or a row.",
    props: {
      orientation: { description: '"vertical" (default) or "horizontal".', valueType: "string", availableValues: ["vertical", "horizontal"] },
      gap: { description: "Space between children, as a CSS length.", valueType: "string" },
    },
  },
};
