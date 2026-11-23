// React-free entry point: component metadata only. The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @patchfuil/runtime. The boundary test in tools/ enforces this.

/** What the compiler knows about a component. Grows with step 15 (contracts). */
export interface ComponentMetadata {
  description: string;
  /** Props settable from markup attributes. */
  props: Record<string, { description: string }>;
  /** Events, by name: `click` is handled by `onClick="…"` or `<event name="click">`. */
  events?: Record<string, { description: string }>;
  /** What `id` exposes: values and methods (`textBox.value`, `textBox.setValue(v)`). */
  api?: Record<string, { description: string }>;
}

export const componentMetadata: Readonly<Record<string, ComponentMetadata>> = {
  App: {
    description: "The root of an application.",
    props: {},
  },
  Text: {
    description: "Displays text: `value`, or the nested text.",
    props: {
      value: { description: "The text to display. Nested text is used when it is absent." },
    },
  },
  Button: {
    description: "A clickable button: `label`, or the nested content.",
    props: {
      label: { description: "The button's text. Nested content is used when it is absent." },
    },
    events: {
      click: { description: "The button was clicked. The handler receives no arguments (no DOM event)." },
    },
  },
  TextBox: {
    description: "A single-line text input.",
    props: {
      initialValue: { description: "The text when the component mounts." },
      placeholder: { description: "Shown while the text is empty." },
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
  Stack: {
    description: "Lays out its children in a column or a row.",
    props: {
      orientation: { description: '"vertical" (default) or "horizontal".' },
      gap: { description: "Space between children, as a CSS length." },
    },
  },
};
