/// <reference path="./css.d.ts" />
// Mantine-based components (step 16): Mantine React components made usable
// from markup with wrapComponent, styled only through pfui theme variables.
// Design: .ai/plan/poc-16-mantine.md
//
// Mantine's CSS is loaded in its `@layer mantine` form, so our (unlayered)
// rules win. Variables Mantine sets inline from its `vars` resolvers
// (--button-bg) are redirected with a fixed `vars` resolver; variables it sets
// from CSS (--input-bd) are redirected in our stylesheet (styles.ts).
import { Button as MantineButton, Checkbox as MantineCheckbox, Select as MantineSelect, TextInput } from "@mantine/core";
import burgerCss from "@mantine/core/styles/Burger.layer.css?inline";
import buttonCss from "@mantine/core/styles/Button.layer.css?inline";
import checkboxCss from "@mantine/core/styles/Checkbox.layer.css?inline";
import closeButtonCss from "@mantine/core/styles/CloseButton.layer.css?inline";
import comboboxCss from "@mantine/core/styles/Combobox.layer.css?inline";
import defaultVariablesCss from "@mantine/core/styles/default-css-variables.layer.css?inline";
import globalCss from "@mantine/core/styles/global.layer.css?inline";
import inlineInputCss from "@mantine/core/styles/InlineInput.layer.css?inline";
import inputCss from "@mantine/core/styles/Input.layer.css?inline";
import popoverCss from "@mantine/core/styles/Popover.layer.css?inline";
import scrollAreaCss from "@mantine/core/styles/ScrollArea.layer.css?inline";
import unstyledButtonCss from "@mantine/core/styles/UnstyledButton.layer.css?inline";
import { wrapComponent } from "@patchfuil/runtime";
import { createElement, type ComponentType } from "react";
import { useLayout, withoutLayoutProps, type LayoutProps } from "./layout";
import { componentMetadata } from "./metadata";

/**
 * The layout props (width, padding, …) for a wrapped component: applied to the
 * Mantine component's root as `style`; the rest of the props go through the
 * wrapper unchanged.
 */
function withLayout(Wrapped: ComponentType<Record<string, unknown>>): ComponentType<LayoutProps> {
  function Layout(props: LayoutProps) {
    // Only the style: Mantine puts it on the root, but other attributes on the input (TextInput).
    const { style } = useLayout(props);
    return createElement(Wrapped, { ...withoutLayoutProps(props), ...(style ? { style } : {}) });
  }
  Layout.displayName = Wrapped.displayName;
  return Layout;
}

/** The CSS of the Mantine components in use (all in `@layer mantine`). */
export const MANTINE_STYLESHEET = [
  // Static, so MantineProvider renders no <style> of its own (withCssVariables=false).
  defaultVariablesCss,
  globalCss,
  unstyledButtonCss,
  buttonCss,
  inputCss,
  inlineInputCss,
  checkboxCss,
  comboboxCss,
  popoverCss,
  scrollAreaCss,
  closeButtonCss,
  // The App shell's drawer toggle (shell.tsx).
  burgerCss,
].join("\n");

export const MANTINE_STYLESHEET_HREF = "pfui-mantine";

const asText = (value: unknown) => (value === undefined || value === null ? "" : String(value));
const enabledToDisabled = (enabled: unknown) => ({ disabled: enabled === false });
const focusApi = ({ ref }: { ref: { current: unknown } }) => ({
  focus() {
    (ref.current as { focus?: () => void } | null)?.focus?.();
  },
});

export const Button = withLayout(wrapComponent(MantineButton as never, {
  props: componentMetadata.Button!.props,
  rename: { label: (label) => (label === undefined || label === null ? {} : { children: String(label) }), enabled: enabledToDisabled },
  fixed: {
    type: "button",
    className: "pfui-Button",
    vars: () => ({
      root: {
        "--button-bg": "var(--pfui-backgroundColor-Button)",
        "--button-hover": "var(--pfui-backgroundColor-Button--hover)",
        "--button-color": "var(--pfui-textColor-Button)",
        "--button-bd": "1px solid var(--pfui-borderColor-Button)",
        "--button-radius": "var(--pfui-borderRadius-Button)",
      },
    }),
  },
}));

export const TextBox = withLayout(wrapComponent(TextInput as never, {
  props: componentMetadata.TextBox!.props,
  rename: { enabled: enabledToDisabled },
  value: { prop: "value", change: "onChange", read: (event: { currentTarget: { value: string } }) => event.currentTarget.value, parse: asText },
  withRef: true,
  api: focusApi,
  fixed: { className: "pfui-TextBox", vars: () => ({ wrapper: { "--input-radius": "var(--pfui-borderRadius-TextBox)" } }) },
}));

/** `options`: strings or `{ value, label }` objects → Mantine's `data`. */
function toData(options: unknown): { value: string; label: string }[] {
  if (!Array.isArray(options)) return [];
  return options.map((option) =>
    option !== null && typeof option === "object"
      ? { value: asText((option as { value?: unknown }).value), label: asText((option as { label?: unknown; value?: unknown }).label ?? (option as { value?: unknown }).value) }
      : { value: asText(option), label: asText(option) },
  );
}

export const Select = withLayout(wrapComponent(MantineSelect as never, {
  props: componentMetadata.Select!.props,
  rename: { options: (options) => ({ data: toData(options) }), enabled: enabledToDisabled },
  value: { prop: "value", change: "onChange", parse: (value) => (value === undefined || value === null || value === "" ? null : String(value)) },
  templates: { optionTemplate: { prop: "renderOption", context: (input: { option: unknown; checked?: boolean }) => ({ $item: input.option, $checked: input.checked === true }) } },
  withRef: true,
  api: focusApi,
  fixed: {
    className: "pfui-Select",
    comboboxProps: { withinPortal: false },
    vars: () => ({ wrapper: { "--input-radius": "var(--pfui-borderRadius-Select)" } }),
  },
}));

export const Checkbox = withLayout(wrapComponent(MantineCheckbox as never, {
  props: componentMetadata.Checkbox!.props,
  rename: { enabled: enabledToDisabled },
  value: {
    prop: "checked",
    change: "onChange",
    read: (event: { currentTarget: { checked: boolean } }) => event.currentTarget.checked,
    parse: (value) => value === true || value === "true",
  },
  fixed: {
    className: "pfui-Checkbox",
    vars: () => ({ root: { "--checkbox-color": "var(--pfui-backgroundColor-Checkbox--checked)", "--checkbox-radius": "var(--pfui-borderRadius-Checkbox)" } }),
  },
}));
