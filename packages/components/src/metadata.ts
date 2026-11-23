// React-free entry point: component metadata only. The compiler imports
// this module, so nothing reachable from here may import React, Mantine,
// or @patchfuil/runtime. The boundary test in tools/ enforces this.

/** What the compiler knows about a component. Grows with step 15 (contracts). */
export interface ComponentMetadata {
  description: string;
  /** Props settable from markup attributes. */
  props: Record<string, { description: string }>;
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
  },
  Stack: {
    description: "Lays out its children in a column or a row.",
    props: {
      orientation: { description: '"vertical" (default) or "horizontal".' },
      gap: { description: "Space between children, as a CSS length." },
    },
  },
};
