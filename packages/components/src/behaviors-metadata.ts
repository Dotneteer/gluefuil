// Behaviors (step 18): what the compiler needs to attach them. React-free.
// Design: .ai/plan/poc-18-behaviors.md
//
// A behavior attaches when the element sets one of its trigger props, the
// component's contract does not declare that prop itself, the component is
// visual, and the behavior's own condition holds. The compiler then wraps the
// element in the behavior's component (exported by @gluefuil/components).

import type { PropMetadata } from "./metadata";

export interface BehaviorMetadata {
  name: string;
  /** The wrapper component's export name in @gluefuil/components. */
  component: string;
  triggerProps: readonly string[];
  /** Its props: valid (and checked) props of an element it attaches to. */
  props: Record<string, PropMetadata>;
  /** Attaches only to components with theme variables (variant). */
  requiresThemeVars?: boolean;
  /** Attaches only to components with a `value` and a `setValue` API (step 22: the form behaviors). */
  requiresValueApi?: boolean;
  /** Events handled on the element (`onValidate`), given to the behavior's component. */
  events?: Record<string, { description: string; args?: "none" | "pointer" }>;
  /** Its event handlers return the handler's result (`validate`). */
  eventResults?: boolean;
  /** Theme variables of its own rendering, with defaults. */
  themeVars?: Record<string, string>;
}

const SEVERITY = { valueType: "string", availableValues: ["error", "warning"] } as const;

/**
 * In application order: the first wraps the component, the last is outermost.
 * The form behaviors follow `label` (step 22): `formBinding` wraps the labelled
 * input and puts its messages after the label (so they are not part of the
 * input's accessible name); `validation` outside it provides the rules. (XMLUI
 * registers them after `variant`; its binding wrapper renders the label itself.)
 */
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
    name: "formBinding",
    component: "FormBindingBehavior",
    triggerProps: ["bindTo"],
    requiresValueApi: true,
    props: {
      bindTo: { description: "The path of the enclosing Form's data this input edits (`name`, `address.city`).", valueType: "string" },
      noSubmit: { description: "Leave this input's value out of the submitted data and `$data`.", valueType: "boolean" },
    },
    themeVars: {
      "gap-Field": "$space-1",
      "textColor-ValidationMessage-error": "$color-danger",
      "textColor-ValidationMessage-warning": "$color-warn",
      "fontSize-ValidationMessage": "0.85em",
    },
  },
  {
    name: "validation",
    component: "ValidationBehavior",
    triggerProps: ["bindTo"],
    requiresValueApi: true,
    props: {
      required: { description: "The value must not be empty.", valueType: "boolean" },
      requiredInvalidMessage: { description: 'Instead of "This field is required".', valueType: "string" },
      minLength: { description: "The text has at least this many characters.", valueType: "integer" },
      maxLength: { description: "The text has at most this many characters.", valueType: "integer" },
      lengthInvalidMessage: { description: "The message when the length is out of bounds.", valueType: "string" },
      lengthInvalidSeverity: { description: "error (default) or warning.", ...SEVERITY },
      minValue: { description: "The number is at least this.", valueType: "number" },
      maxValue: { description: "The number is at most this.", valueType: "number" },
      rangeInvalidMessage: { description: "The message when the number is out of range.", valueType: "string" },
      rangeInvalidSeverity: { description: "error (default) or warning.", ...SEVERITY },
      pattern: { description: "A built-in format.", valueType: "string", availableValues: ["email", "url", "phone"] },
      patternInvalidMessage: { description: "The message when the format doesn't match.", valueType: "string" },
      patternInvalidSeverity: { description: "error (default) or warning.", ...SEVERITY },
      regex: { description: "A regular expression the text matches (`^\\d+$`, or `/^a/i` with flags).", valueType: "string" },
      regexInvalidMessage: { description: "The message when the regular expression doesn't match.", valueType: "string" },
      regexInvalidSeverity: { description: "error (default) or warning.", ...SEVERITY },
      matchValue: { description: "The value must equal this (a password confirmation).", valueType: "any" },
      matchInvalidMessage: { description: 'Instead of "Input does not match".', valueType: "string" },
      validationMode: { description: "When results show: errorLate (default: after leaving the input), onChanged, onLostFocus.", valueType: "string", availableValues: ["errorLate", "onChanged", "onLostFocus"] },
      customValidationsDebounce: { description: "Milliseconds to wait after a change before running onValidate.", valueType: "integer" },
      validationDisplayDelay: { description: "A slower onValidate shows its result when it settles, even while the input has the focus (ms).", valueType: "integer" },
    },
    events: {
      validate: { description: "A custom check: `(value)` → null, a message, false, or `{ isValid, invalidMessage, severity }` (or a promise of one)." },
    },
    eventResults: true,
  },
  {
    name: "tooltip",
    component: "TooltipBehavior",
    triggerProps: ["tooltip", "tooltipMarkdown"],
    props: {
      tooltip: { description: "Text shown while the pointer is over the component or it has the focus.", valueType: "string" },
      tooltipMarkdown: { description: "The tooltip's content as Markdown (instead of tooltip).", valueType: "string" },
      tooltipOptions: {
        description:
          "The Tooltip component's options: an object ({ side: 'bottom', showArrow: true }) or a string (\"left; delayDuration: 800; !showArrow\"): a side or align value alone, a boolean name (! for false), name: number.",
        valueType: "any",
      },
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
