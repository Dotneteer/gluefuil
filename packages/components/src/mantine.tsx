/// <reference path="./css.d.ts" />
// Mantine-based components (step 16): Mantine React components made usable
// from markup with wrapComponent, styled only through gfui theme variables.
// Design: .ai/plan/poc-16-mantine.md
//
// Mantine's CSS is loaded in its `@layer mantine` form, so our (unlayered)
// rules win. Variables Mantine sets inline from its `vars` resolvers
// (--button-bg) are redirected with a fixed `vars` resolver; variables it sets
// from CSS (--input-bd) are redirected in our stylesheet (styles.ts).
import { Button as MantineButton } from "@mantine/core";
import avatarCss from "@mantine/core/styles/Avatar.layer.css?inline";
import badgeCss from "@mantine/core/styles/Badge.layer.css?inline";
import actionIconCss from "@mantine/core/styles/ActionIcon.layer.css?inline";
import burgerCss from "@mantine/core/styles/Burger.layer.css?inline";
import colorInputCss from "@mantine/core/styles/ColorInput.layer.css?inline";
import colorPickerCss from "@mantine/core/styles/ColorPicker.layer.css?inline";
import colorSwatchCss from "@mantine/core/styles/ColorSwatch.layer.css?inline";
import numberInputCss from "@mantine/core/styles/NumberInput.layer.css?inline";
import passwordInputCss from "@mantine/core/styles/PasswordInput.layer.css?inline";
import radioCss from "@mantine/core/styles/Radio.layer.css?inline";
import sliderCss from "@mantine/core/styles/Slider.layer.css?inline";
import switchCss from "@mantine/core/styles/Switch.layer.css?inline";
import dividerCss from "@mantine/core/styles/Divider.layer.css?inline";
import imageCss from "@mantine/core/styles/Image.layer.css?inline";
import loaderCss from "@mantine/core/styles/Loader.layer.css?inline";
import progressCss from "@mantine/core/styles/Progress.layer.css?inline";
import buttonCss from "@mantine/core/styles/Button.layer.css?inline";
import checkboxCss from "@mantine/core/styles/Checkbox.layer.css?inline";
import closeButtonCss from "@mantine/core/styles/CloseButton.layer.css?inline";
import comboboxCss from "@mantine/core/styles/Combobox.layer.css?inline";
import pillCss from "@mantine/core/styles/Pill.layer.css?inline";
import pillsInputCss from "@mantine/core/styles/PillsInput.layer.css?inline";
import datesCss from "@mantine/dates/styles.layer.css?inline";
import defaultVariablesCss from "@mantine/core/styles/default-css-variables.layer.css?inline";
import globalCss from "@mantine/core/styles/global.layer.css?inline";
import inlineInputCss from "@mantine/core/styles/InlineInput.layer.css?inline";
import inputCss from "@mantine/core/styles/Input.layer.css?inline";
import popoverCss from "@mantine/core/styles/Popover.layer.css?inline";
import scrollAreaCss from "@mantine/core/styles/ScrollArea.layer.css?inline";
import unstyledButtonCss from "@mantine/core/styles/UnstyledButton.layer.css?inline";
import drawerCss from "@mantine/core/styles/Drawer.layer.css?inline";
import menuCss from "@mantine/core/styles/Menu.layer.css?inline";
import modalCss from "@mantine/core/styles/Modal.layer.css?inline";
import modalBaseCss from "@mantine/core/styles/ModalBase.layer.css?inline";
import notificationCss from "@mantine/core/styles/Notification.layer.css?inline";
import overlayCss from "@mantine/core/styles/Overlay.layer.css?inline";
import paperCss from "@mantine/core/styles/Paper.layer.css?inline";
import tooltipCss from "@mantine/core/styles/Tooltip.layer.css?inline";
import tabsCss from "@mantine/core/styles/Tabs.layer.css?inline";
import accordionCss from "@mantine/core/styles/Accordion.layer.css?inline";
import notificationsCss from "@mantine/notifications/styles.layer.css?inline";
import { pointerData, wrapComponent } from "@gluefuil/runtime";
import { enabledToDisabled } from "./inputs";
import { withLayout } from "./layout-wrap";
import { componentMetadata } from "./metadata";

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
  // Select and AutoComplete with several values (choice.tsx, step 25).
  pillCss,
  pillsInputCss,
  // The date and time inputs (dates.tsx, step 26; their components are a lazy chunk, their CSS isn't).
  datesCss,
  popoverCss,
  scrollAreaCss,
  closeButtonCss,
  // The App shell's drawer toggle (shell.tsx).
  burgerCss,
  // The display components (display.tsx, step 23).
  avatarCss,
  badgeCss,
  dividerCss,
  imageCss,
  loaderCss,
  progressCss,
  // The inputs (inputs.tsx, step 24).
  actionIconCss,
  passwordInputCss,
  numberInputCss,
  switchCss,
  radioCss,
  sliderCss,
  colorInputCss,
  colorPickerCss,
  colorSwatchCss,
  // Overlays and menus (overlays.tsx, step 27).
  paperCss,
  overlayCss,
  modalBaseCss,
  modalCss,
  drawerCss,
  menuCss,
  tooltipCss,
  notificationCss,
  notificationsCss,
  // Structure (structure.tsx, step 28).
  tabsCss,
  accordionCss,
].join("\n");

export const MANTINE_STYLESHEET_HREF = "gfui-mantine";


/** Mantine Button's variables, redirected to the Button theme variables (also the DropdownMenu trigger's). */
export const buttonVars = () => ({
  root: {
    "--button-bg": "var(--gfui-backgroundColor-Button)",
    "--button-hover": "var(--gfui-backgroundColor-Button--hover)",
    "--button-color": "var(--gfui-textColor-Button)",
    "--button-bd": "1px solid var(--gfui-borderColor-Button)",
    "--button-radius": "var(--gfui-borderRadius-Button)",
  },
});

const buttonConfig = (type: "button" | "submit") => ({
  props: componentMetadata.Button!.props,
  rename: { label: (label: unknown) => (label === undefined || label === null ? {} : { children: String(label) }), enabled: enabledToDisabled },
  // The pointer snapshot, never the DOM event (step 27).
  events: { click: { prop: "onClick", args: (event: never) => [pointerData(event)] } },
  fixed: {
    type,
    className: "gfui-Button",
    vars: buttonVars,
  },
});

export const Button = withLayout(wrapComponent(MantineButton as never, buttonConfig("button")));

/** A Form's Save button (step 22): a Button that submits its form (Enter in an input submits too). Not in the markup. */
export const SubmitButton = wrapComponent(MantineButton as never, buttonConfig("submit"));
