// Inputs (steps 16 and 24; design: .ai/plan/poc-24-inputs.md): TextBox,
// PasswordInput, TextArea, NumberBox, Checkbox, Switch, RadioGroup with Option,
// Slider, ColorPicker. Mantine components made usable from markup with
// wrapComponent, which also binds them to a Form (`bindTo`, step 22). Their
// look comes from theme variables only (styles.ts INPUTS).
import {
  Checkbox as MantineCheckbox,
  ColorInput,
  NumberInput,
  PasswordInput as MantinePasswordInput,
  Radio,
  RangeSlider,
  Slider as MantineSlider,
  Switch as MantineSwitch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { wrapComponent, type WrapConfig } from "@gluefuil/runtime";
import {
  createContext,
  createElement,
  useContext,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Glyph } from "./icons";
import { withLayout } from "./layout-wrap";
import { componentMetadata } from "./metadata";

/** Mantine components rendered with props assembled at run time (their exact prop types don't apply). */
const loose = (component: unknown) => component as ComponentType<Record<string, unknown>>;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const asText = (value: unknown) => (value === undefined || value === null ? "" : String(value));
const toNumber = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export const enabledToDisabled = (enabled: unknown) => ({ disabled: enabled === false || enabled === "false" });

/** `focus()` through the native component's ref. */
export const focusApi = ({ ref }: { ref: { current: unknown } }) => ({
  focus() {
    (ref.current as { focus?: () => void } | null)?.focus?.();
  },
});

/** The validation states shown without a form (`validationStatus`). */
export const VALIDATION_STATUSES = ["none", "valid", "warning", "error"] as const;

/** `validationStatus`: error is Mantine's error state; warning and valid a border color on the root (styles.ts). */
export const validationStatus = (status: unknown) => ({
  ...(status === "error" ? { error: true } : {}),
  ...(status === "warning" || status === "valid" ? { wrapperProps: { "data-validation": status } } : {}),
});

/** `gotFocus` and `lostFocus`: called without arguments (no DOM event reaches script). */
export const FOCUS_EVENTS: WrapConfig["events"] = {
  gotFocus: { prop: "onFocus", args: () => [] },
  lostFocus: { prop: "onBlur", args: () => [] },
};

const textValue = {
  prop: "value",
  change: "onChange",
  read: (event: { currentTarget: { value: string } }) => event.currentTarget.value,
  parse: asText,
};

/** Mantine's `vars` for an input's radius, from a theme variable. */
const inputRadius = (name: string) => () => ({ wrapper: { "--input-radius": `var(--gfui-borderRadius-${name})` } });

// --- Adornments -------------------------------------------------------------

type Adorned = Record<string, unknown> & { startText?: unknown; endText?: unknown; startIcon?: unknown; endIcon?: unknown };

/** An adornment's width: room for an icon and the text (Mantine sizes sections, it doesn't measure them). */
function sectionWidth(icon: boolean, text: string | undefined): string {
  const parts = ["0.75em"];
  if (icon) parts.push("1.25em");
  if (text) parts.push(`${text.length}ch`, "0.25em");
  return `calc(${parts.join(" + ")})`;
}

export function section(icon: unknown, text: unknown): { node: ReactNode; width: string } | undefined {
  const label = text === undefined || text === null || text === "" ? undefined : String(text);
  if (!icon && label === undefined) return undefined;
  return {
    node: (
      // Decoration next to the value: kept out of the input's accessible name (the label wraps it).
      <span className="gfui-Adornment" aria-hidden="true">
        {icon ? <Glyph name={icon} className="gfui-Adornment-icon" /> : null}
        {label}
      </span>
    ),
    width: sectionWidth(Boolean(icon), label),
  };
}

/** `startText`, `startIcon`, `endText`, `endIcon` → Mantine's left and right sections. */
function withAdornments(Native: ComponentType<Record<string, unknown>>) {
  function Adornments({ startText, startIcon, endText, endIcon, ...rest }: Adorned) {
    const start = section(startIcon, startText);
    const end = section(endIcon, endText);
    return createElement(Native, {
      ...rest,
      ...(start ? { leftSection: start.node, leftSectionWidth: start.width, leftSectionPointerEvents: "none" } : {}),
      ...(end ? { rightSection: end.node, rightSectionWidth: end.width, rightSectionPointerEvents: "none" } : {}),
    });
  }
  return Adornments;
}

// --- TextBox and PasswordInput ----------------------------------------------

type TextNativeProps = Record<string, unknown> & {
  type?: unknown;
  showPasswordToggle?: unknown;
  passwordVisibleIcon?: unknown;
  passwordHiddenIcon?: unknown;
};

/** A text input, or Mantine's PasswordInput for `type="password"` (with its toggle only when asked). */
function TextNative({ type, showPasswordToggle, passwordVisibleIcon, passwordHiddenIcon, ...rest }: TextNativeProps) {
  if (type === "password") {
    const visible = typeof passwordVisibleIcon === "string" ? passwordVisibleIcon : "eye";
    const hidden = typeof passwordHiddenIcon === "string" ? passwordHiddenIcon : "eye-off";
    return createElement(loose(MantinePasswordInput), {
      ...rest,
      // Without the toggle: no right section (Mantine shows its toggle for an undefined one).
      ...(isTrue(showPasswordToggle) ? {} : { rightSection: rest.rightSection ?? false }),
      visibilityToggleIcon: ({ reveal }: { reveal: boolean }) => <Glyph name={reveal ? hidden : visible} />,
      visibilityToggleButtonProps: { "aria-label": "Show the password" },
    });
  }
  return createElement(TextInput, { ...rest, type: type === "search" || type === "email" ? type : "text" });
}

const textConfig = (name: string, fixedType?: "password"): WrapConfig => ({
  props: componentMetadata[name]!.props,
  rename: { enabled: enabledToDisabled, validationStatus },
  events: FOCUS_EVENTS,
  value: textValue,
  withRef: true,
  api: focusApi,
  fixed: { className: `gfui-${name}`, vars: inputRadius(name), ...(fixedType ? { type: fixedType } : {}) },
});

export const TextBox = withLayout(wrapComponent(withAdornments(TextNative) as never, textConfig("TextBox")));

/** PasswordInput: a TextBox whose text is masked. */
export const PasswordInput = withLayout(wrapComponent(withAdornments(TextNative) as never, textConfig("PasswordInput", "password")));

// --- TextArea ---------------------------------------------------------------

type TextAreaNativeProps = Record<string, unknown> & {
  enterSubmits?: unknown;
  escResets?: unknown;
  autoSize?: unknown;
  resize?: unknown;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * Mantine's Textarea. In a form (XMLUI TextAreaReact.tsx 255–267): Enter
 * submits it unless `enterSubmits="false"` (Shift+Enter is a new line), and
 * Escape resets it with `escResets`. Outside a form both keys are ordinary.
 */
function TextAreaNative({ enterSubmits, escResets, autoSize, resize, onKeyDown, ...rest }: TextAreaNativeProps) {
  return createElement(Textarea, {
    ...rest,
    autosize: isTrue(autoSize),
    resize: resize === "horizontal" || resize === "vertical" || resize === "both" ? resize : "none",
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const form = event.currentTarget.form;
      if (form && event.key === "Enter" && !event.shiftKey && !isFalse(enterSubmits)) {
        event.preventDefault();
        form.requestSubmit();
      } else if (form && event.key === "Escape" && !event.shiftKey && isTrue(escResets)) {
        event.preventDefault();
        form.reset();
      }
      onKeyDown?.(event);
    },
  });
}

export const TextArea = withLayout(wrapComponent(TextAreaNative as never, {
  props: componentMetadata.TextArea!.props,
  rename: { enabled: enabledToDisabled, validationStatus },
  events: FOCUS_EVENTS,
  value: textValue,
  withRef: true,
  api: (context) => ({
    ...focusApi(context),
    /** Inserts text at the cursor (or replaces the selection), as typing would; no didChange. */
    insert(text: unknown) {
      const element = context.ref.current as HTMLTextAreaElement | null;
      const current = asText(context.getValue());
      const piece = asText(text);
      const start = element?.selectionStart ?? current.length;
      const end = element?.selectionEnd ?? current.length;
      context.setValue(current.slice(0, start) + piece + current.slice(end));
      requestAnimationFrame(() => element?.setSelectionRange(start + piece.length, start + piece.length));
    },
  }),
  fixed: { className: "gfui-TextArea", vars: inputRadius("TextArea") },
}));

// --- NumberBox --------------------------------------------------------------

/** A number from what NumberInput reports: a number, or a string while typing ("-", "1.", ""). */
export function parseNumberInput(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

type NumberNativeProps = Record<string, unknown> & {
  value?: unknown;
  onChange?: (value: number | undefined) => void;
  minValue?: unknown;
  maxValue?: unknown;
  integersOnly?: unknown;
  zeroOrPositive?: unknown;
  hasSpinBox?: unknown;
};

/**
 * Mantine's NumberInput with a number-or-undefined value. It keeps the text
 * being typed ("-", "1.") while the value is what it parses to; a different
 * value from outside replaces the text.
 */
function NumberNative({ value, onChange, minValue, maxValue, integersOnly, zeroOrPositive, hasSpinBox, ...rest }: NumberNativeProps) {
  const [text, setText] = useState<number | string>(() => (typeof value === "number" ? value : ""));
  const shown = parseNumberInput(text) === value ? text : typeof value === "number" ? value : "";
  return createElement(loose(NumberInput), {
    ...rest,
    value: shown,
    onChange: (next: number | string) => {
      setText(next);
      onChange?.(parseNumberInput(next));
    },
    min: toNumber(minValue) ?? (isTrue(zeroOrPositive) ? 0 : undefined),
    max: toNumber(maxValue),
    allowDecimal: !isTrue(integersOnly),
    allowNegative: !isTrue(zeroOrPositive),
    hideControls: isFalse(hasSpinBox),
    clampBehavior: "blur",
  });
}

export const NumberBox = withLayout(wrapComponent(withAdornments(NumberNative as never) as never, {
  props: componentMetadata.NumberBox!.props,
  rename: { enabled: enabledToDisabled, validationStatus },
  events: FOCUS_EVENTS,
  value: { prop: "value", change: "onChange", parse: parseNumberInput },
  withRef: true,
  api: focusApi,
  fixed: { className: "gfui-NumberBox", vars: inputRadius("NumberBox") },
}));

// --- Checkbox and Switch ----------------------------------------------------

const checkedValue = {
  prop: "checked",
  change: "onChange",
  read: (event: { currentTarget: { checked: boolean } }) => event.currentTarget.checked,
  parse: (value: unknown) => value === true || value === "true",
  readOnly: "drop" as const,
};

export const Checkbox = withLayout(wrapComponent(MantineCheckbox as never, {
  props: componentMetadata.Checkbox!.props,
  rename: { enabled: enabledToDisabled, validationStatus, readOnly: (v) => ({ "aria-readonly": v === true || undefined }) },
  events: FOCUS_EVENTS,
  value: checkedValue,
  withRef: true,
  api: focusApi,
  fixed: {
    className: "gfui-Checkbox",
    vars: () => ({ root: { "--checkbox-color": "var(--gfui-backgroundColor-Checkbox--checked)", "--checkbox-radius": "var(--gfui-borderRadius-Checkbox)" } }),
  },
}));

export const Switch = withLayout(wrapComponent(MantineSwitch as never, {
  props: componentMetadata.Switch!.props,
  rename: { enabled: enabledToDisabled, validationStatus, readOnly: (v) => ({ "aria-readonly": v === true || undefined }) },
  events: FOCUS_EVENTS,
  value: checkedValue,
  withRef: true,
  api: focusApi,
  fixed: { className: "gfui-Switch", vars: () => ({ root: { "--switch-color": "var(--gfui-backgroundColor-checked-Switch)" } }) },
}));

// --- RadioGroup and Option ----------------------------------------------------

const RadioGroupState = createContext<{ disabled: boolean; readOnly: boolean } | undefined>(undefined);

/** A radio value is a string (XMLUI: numbers and booleans are converted, anything else is ""). */
export function radioValue(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

type FocusTarget = { focus(): void; setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

type RadioGroupNativeProps = Record<string, unknown> & {
  orientation?: unknown;
  disabled?: boolean;
  readOnly?: unknown;
  validationStatus?: unknown;
  error?: unknown;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  ref?: Ref<FocusTarget>;
  children?: ReactNode;
};

/**
 * Mantine's Radio.Group around the children (Options, anywhere inside), in a
 * row or a column. Focus and blur count only when the focus enters or leaves
 * the group, not when it moves between its radios.
 */
function RadioGroupNative({ orientation, disabled, readOnly, validationStatus: status, error, onFocus, onBlur, ref, children, ...rest }: RadioGroupNativeProps) {
  const options = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => (options.current?.querySelector<HTMLInputElement>("input:checked:not(:disabled)") ?? options.current?.querySelector<HTMLInputElement>("input:not(:disabled)"))?.focus(),
    setAttribute: (name, value) => options.current?.setAttribute(name, value),
    removeAttribute: (name) => options.current?.removeAttribute(name),
  }));
  const leaving = (event: FocusEvent) => !options.current?.contains(event.relatedTarget as Node | null);
  return createElement(
    loose(Radio.Group),
    { ...rest, error: error === true || status === "error" ? true : undefined },
    <div
      ref={options}
      className="gfui-RadioGroup-options"
      role="presentation"
      data-orientation={orientation === "horizontal" ? "horizontal" : "vertical"}
      data-validation={status === "warning" || status === "valid" ? status : undefined}
      data-error={error === true || status === "error" ? "" : undefined}
      onFocus={(event) => leaving(event) && onFocus?.(event)}
      onBlur={(event) => leaving(event) && onBlur?.(event)}
    >
      <RadioGroupState value={{ disabled: disabled === true, readOnly: isTrue(readOnly) }}>{children}</RadioGroupState>
    </div>,
  );
}

export const RadioGroup = withLayout(wrapComponent(RadioGroupNative as never, {
  props: componentMetadata.RadioGroup!.props,
  rename: { enabled: enabledToDisabled },
  events: FOCUS_EVENTS,
  value: { prop: "value", change: "onChange", parse: radioValue, readOnly: "drop" },
  withRef: true,
  api: focusApi,
  fixed: { className: "gfui-RadioGroup" },
}));

/**
 * `Option`: in a RadioGroup, one radio. `label` or the children name it;
 * without either, the value. Outside a RadioGroup it renders nothing (Select's
 * Option children come with step 25).
 */
export function Option({ value, label, enabled, children }: { value?: unknown; label?: unknown; enabled?: unknown; children?: ReactNode }) {
  const group = useContext(RadioGroupState);
  if (!group) return null;
  const text = label !== undefined && label !== null && label !== "" ? String(label) : (children ?? radioValue(value));
  return (
    <Radio
      className="gfui-RadioGroupOption"
      value={radioValue(value ?? label)}
      label={text}
      disabled={group.disabled || isFalse(enabled)}
      aria-readonly={group.readOnly || undefined}
      vars={() => ({ root: { "--radio-color": "var(--gfui-backgroundColor-checked-RadioGroupOption)" } })}
    />
  );
}

// --- Slider -------------------------------------------------------------------

type SliderValue = number | [number, number];

/** A slider value: a number, or two numbers (a range); undefined when neither. */
export function sliderValue(value: unknown): SliderValue | undefined {
  if (Array.isArray(value)) {
    const [a, b] = value.map(toNumber);
    return a !== undefined && b !== undefined ? [Math.min(a, b), Math.max(a, b)] : undefined;
  }
  return toNumber(value);
}

type SliderNativeProps = Record<string, unknown> & {
  value?: SliderValue;
  onChange?: (value: SliderValue) => void;
  onChangeEnd?: (value: SliderValue) => void;
  label?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  step?: unknown;
  minStepsBetweenThumbs?: unknown;
  showValues?: unknown;
  valueFormat?: unknown;
  disabled?: boolean;
  validationStatus?: unknown;
  error?: unknown;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  ref?: Ref<FocusTarget>;
  className?: string;
  style?: unknown;
};

/**
 * Mantine's Slider, or RangeSlider when the value is a range. The label is the
 * slider's own (it names the thumbs); `valueFormat` formats the tooltip.
 */
function SliderNative(props: SliderNativeProps) {
  const { value, onChange, onChangeEnd, label, minValue, maxValue, step, minStepsBetweenThumbs, showValues, valueFormat, disabled, validationStatus: status, error, onFocus, onBlur, ref, className, style } = props;
  const root = useRef<HTMLDivElement>(null);
  const labelId = useId();
  useImperativeHandle(ref, () => ({
    focus: () => root.current?.querySelector<HTMLElement>("[role=slider]")?.focus(),
    setAttribute: (name, v) => root.current?.querySelector("[role=slider]")?.setAttribute(name, v),
    removeAttribute: (name) => root.current?.querySelector("[role=slider]")?.removeAttribute(name),
  }));
  const min = toNumber(minValue) ?? 0;
  const max = toNumber(maxValue) ?? 10;
  const stepValue = toNumber(step) ?? 1;
  const format = (n: number) => {
    if (typeof valueFormat !== "function") return String(n);
    const formatted = (valueFormat as (v: number) => unknown)(n);
    return formatted === undefined || formatted === null ? "" : String(formatted);
  };
  const text = label === undefined || label === null || label === "" ? undefined : String(label);
  const common = {
    min,
    max,
    step: stepValue,
    disabled,
    label: isFalse(showValues) ? null : format,
    className: "gfui-Slider-track",
  };
  const slider = Array.isArray(value)
    ? createElement(RangeSlider, {
        ...common,
        value,
        onChange: (next: [number, number]) => onChange?.(next),
        onChangeEnd: (next: [number, number]) => onChangeEnd?.(next),
        minRange: (toNumber(minStepsBetweenThumbs) ?? 1) * stepValue,
        thumbFromLabel: text ? `${text}, from` : undefined,
        thumbToLabel: text ? `${text}, to` : undefined,
      })
    : createElement(MantineSlider, {
        ...common,
        thumbLabel: text,
        value: typeof value === "number" ? value : min,
        onChange: (next: number) => onChange?.(next),
        onChangeEnd: (next: number) => onChangeEnd?.(next),
      });
  const leaving = (event: FocusEvent) => !root.current?.contains(event.relatedTarget as Node | null);
  return (
    <div
      ref={root}
      className={className}
      style={style as never}
      data-validation={status === "warning" || status === "valid" ? status : undefined}
      data-error={error === true || status === "error" ? "" : undefined}
      onFocus={(event) => leaving(event) && onFocus?.(event)}
      onBlur={(event) => leaving(event) && onBlur?.(event)}
    >
      {text ? (
        <span className="gfui-Slider-label" id={labelId}>
          {text}
        </span>
      ) : null}
      {slider}
    </div>
  );
}

export const Slider = withLayout(wrapComponent(SliderNative as never, {
  props: componentMetadata.Slider!.props,
  rename: { enabled: enabledToDisabled },
  events: { ...FOCUS_EVENTS, didCommit: "onChangeEnd" },
  value: { prop: "value", change: "onChange", parse: sliderValue, readOnly: "drop" },
  withRef: true,
  api: focusApi,
  fixed: { className: "gfui-Slider" },
}));

// --- ColorPicker --------------------------------------------------------------

/** A color value: the text given, "#000000" without one (XMLUI's default). */
export const colorValue = (value: unknown) => (value === undefined || value === null || value === "" ? "#000000" : String(value));

export const ColorPicker = withLayout(wrapComponent(ColorInput as never, {
  props: componentMetadata.ColorPicker!.props,
  rename: { enabled: enabledToDisabled, validationStatus },
  events: FOCUS_EVENTS,
  value: { prop: "value", change: "onChange", parse: colorValue, readOnly: "drop" },
  withRef: true,
  api: focusApi,
  fixed: {
    className: "gfui-ColorPicker",
    format: "hex",
    popoverProps: { withinPortal: false },
    // The preview swatch is decoration: kept out of the input's accessible name (the label wraps it). No eye
    // dropper: it would be a button inside the label.
    leftSectionProps: { "aria-hidden": true },
    withEyeDropper: false,
    // Its own label looks like the label behavior's (and gets the required mark in a form; step 25).
    labelProps: { className: "gfui-Label-text" },
    vars: inputRadius("ColorPicker"),
  },
}));
