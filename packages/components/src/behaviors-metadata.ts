// Behaviors (step 18): what the compiler needs to attach them. React-free.
// Design: .ai/plan/poc-18-behaviors.md
//
// A behavior attaches when the element sets one of its trigger props, the
// component's contract does not declare that prop itself, the component is
// visual, and the behavior's own condition holds. The compiler then wraps the
// element in the behavior's component (exported by @patchfuil/components).

import type { PropMetadata } from "./metadata";

export interface BehaviorMetadata {
  name: string;
  /** The wrapper component's export name in @patchfuil/components. */
  component: string;
  triggerProps: readonly string[];
  /** Its props: valid (and checked) props of an element it attaches to. */
  props: Record<string, PropMetadata>;
  /** Attaches only to components with theme variables (variant). */
  requiresThemeVars?: boolean;
  /** Theme variables of its own rendering, with defaults. */
  themeVars?: Record<string, string>;
}

/** In application order: the first wraps the component, the last is outermost (as XMLUI). */
export const BEHAVIORS: readonly BehaviorMetadata[] = [
  {
    name: "label",
    component: "LabelBehavior",
    triggerProps: ["label"],
    props: {
      label: { description: "A label for the component (a <label> element: inputs get it as their accessible name).", valueType: "string" },
      labelPosition: { description: "Where the label goes.", valueType: "string", availableValues: ["top", "start"] },
    },
    themeVars: {
      "textColor-Label": "$textColor-secondary",
      "fontSize-Label": "0.9em",
      "gap-Label": "$space-1",
    },
  },
  {
    name: "tooltip",
    component: "TooltipBehavior",
    triggerProps: ["tooltip"],
    props: {
      tooltip: { description: "Text shown while the pointer is over the component or it has the focus.", valueType: "string" },
    },
    themeVars: {
      "backgroundColor-Tooltip": "$color-surface-900",
      "textColor-Tooltip": "#ffffff",
      "borderRadius-Tooltip": "$borderRadius",
      "padding-Tooltip": "$space-1 $space-2",
      "fontSize-Tooltip": "0.85em",
    },
  },
  {
    name: "variant",
    component: "VariantBehavior",
    triggerProps: ["variant"],
    props: {
      variant: {
        description: "A styling variant: the component's theme variables take their `-<variant>` values (backgroundColor-Button-danger) where a theme defines them.",
        valueType: "string",
      },
    },
    requiresThemeVars: true,
  },
];
