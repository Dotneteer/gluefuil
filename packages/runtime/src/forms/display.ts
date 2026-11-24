// When a field shows its validation results (step 22), after XMLUI's
// useValidationDisplay (FormItem/Validations.ts) and the interaction flags its
// form reducer keeps (Form/FormReact.tsx): late by default.

export type ValidationMode = "errorLate" | "onChanged" | "onLostFocus";

export interface InteractionFlags {
  /** Changed by the user (or `update()`). */
  dirty: boolean;
  focused: boolean;
  /** Blurred at least once while dirty. */
  afterFirstDirtyBlur: boolean;
  /** Valid when it got the focus. */
  validOnFocus: boolean;
  /** Valid when it lost the focus. */
  validOnBlur: boolean;
  /** Turned from invalid to valid since the focus. */
  invalidToValid: boolean;
  /** A submit attempt: show everything until the next edit. */
  forceShow: boolean;
}

export const INITIAL_FLAGS: Readonly<InteractionFlags> = Object.freeze({
  dirty: false,
  focused: false,
  afterFirstDirtyBlur: false,
  validOnFocus: false,
  validOnBlur: false,
  invalidToValid: false,
  forceShow: false,
});

/**
 * - errorLate: nothing before the field is dirty; shown once it loses the
 *   focus invalid; while focused again after that, shown until the value
 *   turns valid.
 * - onChanged: as soon as it is dirty.
 * - onLostFocus: dirty, not focused, and invalid when it lost the focus.
 * A submit attempt shows everything.
 */
export function isShown(mode: ValidationMode, flags: InteractionFlags): boolean {
  if (flags.forceShow) return true;
  switch (mode) {
    case "onChanged":
      return flags.dirty;
    case "onLostFocus":
      return flags.dirty && !flags.focused && !flags.validOnBlur;
    case "errorLate":
    default:
      if (!flags.dirty) return false;
      if (!flags.focused) return !flags.validOnBlur;
      return flags.afterFirstDirtyBlur && !flags.validOnFocus && !flags.invalidToValid;
  }
}
