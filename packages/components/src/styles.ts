// The built-ins' stylesheet (steps 16-17): every visual value is a theme variable
// (`--gfui-*`, compiled by the theme engine; defaults in the metadata's
// `themeVars`). App renders it once as a React 19 hoisted <style>, which a
// server render emits ahead of the app's HTML.

import { BREAKPOINTS } from "@gluefuil/runtime";

export const BASE_STYLESHEET_HREF = "gfui-base";

/** Below md: a phone. The spacing ladder's page level steps down, and flows go one item per row. */
const PHONE_MAX = BREAKPOINTS.find(([name]) => name === "md")![1] - 0.02;

/**
 * The App shell (shell.tsx; design: .ai/plan/poc-19a-app-shell.md).
 *
 * - The regions are flex items: the header and footer of .gfui-AppColumn, the
 *   nav in one of four slots (a nav in the header must be inside the header
 *   element, which grid areas can't express).
 * - What sticks and scrolls follows the root's data-* attributes; the sticky
 *   offsets are the declared heights (height-AppHeader, height-Footer).
 * - Rules for wide screens wrap their ancestor conditions in :where(), so the
 *   drawer rules (SHELL_DRAWER, per breakpoint) win without specificity tricks.
 */
const SHELL = `
.gfui-App {
  background-color: var(--gfui-backgroundColor-App);
  color: var(--gfui-textColor-App);
  font-family: var(--gfui-fontFamily-App);
  font-size: var(--gfui-fontSize-App);
  line-height: var(--gfui-lineHeight);
  display: flex;
  --gfui-shell-top: 0px;
  --gfui-shell-bottom: 0px;
}
.gfui-App[data-scroll="page"] { min-height: 100dvh; }
.gfui-App[data-scroll="content"] { height: 100dvh; overflow: hidden; }
.gfui-App[data-header-sticky] { --gfui-shell-top: var(--gfui-height-AppHeader); }
.gfui-App[data-footer-sticky] { --gfui-shell-bottom: var(--gfui-height-Footer); }
.gfui-AppColumn { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gfui-AppBody { flex: 1; display: flex; min-height: 0; }
.gfui-AppMain { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gfui-AppContent {
  flex: 1 0 auto;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--gfui-maxWidth-content-App);
  margin-inline: auto;
  /* The page: level 0 of the spacing ladder (LAYOUT below). */
  display: flex;
  flex-direction: column;
  --gfui-gap: var(--gfui-l0);
  gap: var(--gfui-gap);
  padding: var(--gfui-paddingVertical-content-App, var(--gfui-l0)) var(--gfui-paddingHorizontal-content-App, var(--gfui-l0));
}
:where(.gfui-App[data-scroll="content"]) .gfui-AppMain { overflow: auto; }
:where(.gfui-App[data-scroll="content"]) .gfui-NavPanel { overflow-y: auto; }

.gfui-AppHeader {
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--gfui-gap-AppHeader);
  height: var(--gfui-height-AppHeader);
  padding: 0 var(--gfui-paddingHorizontal-AppHeader);
  background-color: var(--gfui-backgroundColor-AppHeader);
  color: var(--gfui-textColor-AppHeader);
  border-bottom: 1px solid var(--gfui-borderColor-AppHeader);
}
:where(.gfui-App[data-scroll="page"]) .gfui-AppHeader[data-sticky] { position: sticky; top: 0; z-index: 100; }
/* Mantine draws the lines with --mantine-color-black/white, which gfui doesn't define. */
.gfui-AppHeader-burger { display: none; --burger-color: var(--gfui-textColor-AppHeader); }
.gfui-AppHeader-logo { display: flex; align-items: center; }
.gfui-AppHeader-title { font-weight: 600; white-space: nowrap; }
.gfui-AppHeader-content { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--gfui-gap-AppHeader); }
.gfui-AppHeader-profile { display: flex; align-items: center; }
:where(.gfui-App:not([data-nav="header"])) .gfui-AppHeader[data-generated] { display: none; }
:where(.gfui-App[data-nav-full-height]) .gfui-AppHeader-logo { display: none; }
.gfui-AppLogo { display: block; max-height: calc(var(--gfui-height-AppHeader) - 16px); }

.gfui-NavPanel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: var(--gfui-backgroundColor-NavPanel);
}
.gfui-NavPanel-items { display: flex; flex-direction: column; gap: var(--gfui-space-0_5); padding: var(--gfui-padding-NavPanel); flex: 1; }
.gfui-NavPanel-logo { display: flex; align-items: center; min-height: var(--gfui-height-AppHeader); padding: 0 var(--gfui-paddingHorizontal-AppHeader); box-sizing: border-box; }
.gfui-NavPanel-footer { padding: var(--gfui-padding-NavPanel); }
.gfui-NavPanel[data-placement="side"] {
  flex-shrink: 0;
  width: var(--gfui-width-navPanel-App);
  border-inline-end: 1px solid var(--gfui-borderColor-NavPanel);
}
:where(.gfui-App[data-scroll="page"]) .gfui-NavPanel[data-placement="side"][data-sticky] {
  position: sticky;
  top: var(--gfui-shell-top);
  height: calc(100dvh - var(--gfui-shell-top) - var(--gfui-shell-bottom));
  overflow-y: auto;
}
:where(.gfui-App[data-scroll="page"][data-nav-full-height]) .gfui-NavPanel[data-placement="side"][data-sticky] { top: 0; height: 100dvh; }
.gfui-NavPanel[data-placement="below-header"] { flex-shrink: 0; border-bottom: 1px solid var(--gfui-borderColor-NavPanel); }
:where(.gfui-App[data-scroll="page"]) .gfui-NavPanel[data-placement="below-header"][data-sticky] { position: sticky; top: var(--gfui-shell-top); z-index: 99; }
.gfui-NavPanel[data-placement="header"] { background-color: transparent; }
.gfui-NavPanel[data-placement="below-header"] .gfui-NavPanel-items,
.gfui-NavPanel[data-placement="header"] .gfui-NavPanel-items { flex-direction: row; align-items: center; }
.gfui-NavPanel[data-placement="header"] .gfui-NavPanel-items { padding: 0; }
:where(.gfui-App[data-nav-collapsed]) .gfui-NavPanel[data-placement="side"] { width: var(--gfui-width-navPanel-collapsed-App); }
:where(.gfui-App[data-nav-collapsed]) .gfui-NavLink-label,
:where(.gfui-App[data-nav-collapsed]) .gfui-NavGroup-chevron,
:where(.gfui-App[data-nav-collapsed]) .gfui-NavPanel-logo { display: none; }
:where(.gfui-App[data-nav-collapsed]) .gfui-NavLink-initial { display: inline-flex; }
.gfui-App-overlay { display: none; }

.gfui-Footer {
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  min-height: var(--gfui-height-Footer);
  padding: 0 var(--gfui-paddingHorizontal-Footer);
  background-color: var(--gfui-backgroundColor-Footer);
  color: var(--gfui-textColor-Footer);
  border-top: 1px solid var(--gfui-borderColor-Footer);
}
:where(.gfui-App[data-scroll="page"]) .gfui-Footer[data-sticky] { position: sticky; bottom: 0; z-index: 100; }

.gfui-NavLink,
.gfui-NavGroup-label {
  display: flex;
  align-items: center;
  gap: var(--gfui-space-2);
  padding: var(--gfui-padding-NavLink);
  border-radius: var(--gfui-borderRadius-NavLink);
  color: var(--gfui-textColor-NavLink);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.gfui-NavLink:hover,
.gfui-NavGroup-label:hover { background-color: var(--gfui-backgroundColor-NavLink--hover); }
.gfui-NavLink[data-active] {
  color: var(--gfui-textColor-NavLink--active);
  background-color: var(--gfui-backgroundColor-NavLink--active);
  font-weight: 600;
}
.gfui-NavLink-icon { flex-shrink: 0; }
.gfui-NavLink-initial {
  display: none;
  flex-shrink: 0;
  width: 20px;
  justify-content: center;
  font-weight: 600;
}
.gfui-NavGroup-label { list-style: none; }
.gfui-NavGroup-label::-webkit-details-marker { display: none; }
.gfui-NavGroup-chevron { margin-inline-start: auto; transition: transform 150ms; }
.gfui-NavGroup[open] > .gfui-NavGroup-label .gfui-NavGroup-chevron { transform: rotate(180deg); }
.gfui-NavGroup-items { display: flex; flex-direction: column; gap: var(--gfui-space-0_5); padding-inline-start: var(--gfui-space-4); }
:where(.gfui-NavPanel[data-placement="header"], .gfui-NavPanel[data-placement="below-header"]) .gfui-NavGroup { position: relative; }
:where(.gfui-NavPanel[data-placement="header"], .gfui-NavPanel[data-placement="below-header"]) .gfui-NavGroup-items {
  position: absolute;
  top: 100%;
  inset-inline-start: 0;
  z-index: 102;
  min-width: 12rem;
  padding: var(--gfui-padding-NavPanel);
  background-color: var(--gfui-backgroundColor-NavPanel);
  border: 1px solid var(--gfui-borderColor-NavPanel);
  border-radius: var(--gfui-borderRadius);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
}
.gfui-NavPanelCollapseButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--gfui-space-1);
  border: none;
  border-radius: var(--gfui-borderRadius);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.gfui-NavPanelCollapseButton:hover { background-color: var(--gfui-backgroundColor-NavLink--hover); }
`;

/** Below `drawerBelow`: the nav becomes a drawer, opened by the header's toggle. One copy per breakpoint. */
function shellDrawer(name: string, min: number): string {
  const app = `.gfui-App[data-drawer-below="${name}"]`;
  return `
@media (max-width: ${min - 0.02}px) {
  ${app} .gfui-AppHeader-burger { display: inline-block; }
  ${app} .gfui-AppHeader[data-generated],
  ${app} .gfui-AppHeader-logo { display: flex; }
  ${app} .gfui-NavPanelCollapseButton { display: none; }
  ${app} .gfui-NavPanel {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 101;
    width: min(85vw, var(--gfui-width-navPanel-App));
    height: auto;
    overflow-y: auto;
    background-color: var(--gfui-backgroundColor-NavPanel);
    border-inline-end: 1px solid var(--gfui-borderColor-NavPanel);
    transform: translateX(-100%);
    /* Hidden only after sliding out; visible at once when opening, so the focus can move in. */
    visibility: hidden;
    transition: transform 200ms ease, visibility 0s 200ms;
  }
  ${app}[data-drawer-open] .gfui-NavPanel { transform: none; visibility: visible; transition: transform 200ms ease, visibility 0s; }
  ${app} .gfui-NavPanel .gfui-NavPanel-items { flex-direction: column; align-items: stretch; padding: var(--gfui-padding-NavPanel); }
  ${app} .gfui-NavPanel .gfui-NavLink-label,
  ${app} .gfui-NavPanel .gfui-NavGroup-chevron { display: inline; }
  ${app} .gfui-NavPanel .gfui-NavLink-initial { display: none; }
  ${app} .gfui-NavPanel .gfui-NavGroup-items { position: static; box-shadow: none; border: none; min-width: 0; padding-block: 0; }
  ${app} .gfui-App-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 99;
    background-color: var(--gfui-backgroundColor-NavPanel-overlay);
  }
}`;
}


/**
 * The layout system (layout.tsx; design: .ai/plan/poc-19d-layout.md).
 *
 * - The spacing ladder: a container's data-level (0-3) and orientation pick
 *   --gfui-step from the space-level* theme variables. A vertical stack and a
 *   horizontal stack of columns (one with a container child) use their level's
 *   step; a horizontal stack of items the next tighter one. A surface (a
 *   background or a border) gets its level's step as padding.
 * - --gfui-gap is the gap in effect: an explicit gap (inline), else gap-Stack
 *   (a theme's flat override, XMLUI's behavior), else the step.
 * - Level 0 is smaller on phones (--gfui-l0); resolved on every container, so a
 *   <Theme> below the App can change it.
 * - Percentage widths in a flow (a child's width, layout.tsx flowWidth, or
 *   itemWidth) are gap-aware: calc(W - gap * (1 - W/100%)), and 100% on
 *   phones (--gfui-flow-wide is 0 there).
 */
const LAYOUT = `
.gfui-AppContent,
.gfui-Stack {
  --gfui-l0: var(--gfui-space-level0);
}
@media (max-width: ${PHONE_MAX}px) {
  .gfui-AppContent,
  .gfui-Stack {
    --gfui-l0: var(--gfui-space-level0-phone);
  }
}
.gfui-Stack {
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  --gfui-gap: var(--gfui-gap-Stack, var(--gfui-step));
  gap: var(--gfui-gap);
}
.gfui-Stack[data-level="0"] { --gfui-step: var(--gfui-l0); --gfui-pad: var(--gfui-l0); }
.gfui-Stack[data-level="1"] { --gfui-step: var(--gfui-space-level1); --gfui-pad: var(--gfui-space-level1); }
.gfui-Stack[data-level="2"] { --gfui-step: var(--gfui-space-level2); --gfui-pad: var(--gfui-space-level2); }
.gfui-Stack[data-level="3"] { --gfui-step: var(--gfui-space-level3); --gfui-pad: var(--gfui-space-level3); }
.gfui-Stack[data-orientation="horizontal"][data-level="0"] { --gfui-step: var(--gfui-space-level1); }
.gfui-Stack[data-orientation="horizontal"][data-level="1"] { --gfui-step: var(--gfui-space-level2); }
.gfui-Stack[data-orientation="horizontal"][data-level="2"],
.gfui-Stack[data-orientation="horizontal"][data-level="3"] { --gfui-step: var(--gfui-space-level3); }
.gfui-Stack[data-orientation="horizontal"][data-level="0"]:has(> .gfui-Stack) { --gfui-step: var(--gfui-l0); }
.gfui-Stack[data-orientation="horizontal"][data-level="1"]:has(> .gfui-Stack) { --gfui-step: var(--gfui-space-level1); }
.gfui-Stack[data-orientation="horizontal"][data-level="2"]:has(> .gfui-Stack) { --gfui-step: var(--gfui-space-level2); }
.gfui-Stack[data-surface] { padding: var(--gfui-pad); }
.gfui-Stack[data-wrap] {
  flex-wrap: wrap;
  --gfui-flow-gap: var(--gfui-gap);
  --gfui-flow-wide: 1;
}
@media (max-width: ${PHONE_MAX}px) {
  .gfui-Stack[data-wrap] { --gfui-flow-wide: 0; }
}
.gfui-Stack[data-wrap] > * { max-width: 100%; box-sizing: border-box; }
.gfui-Stack[data-wrap][data-item-width] > :not(.gfui-SpaceFiller) { flex-shrink: 0; }
.gfui-Stack[data-wrap][data-item-width="fixed"] > :not(.gfui-SpaceFiller) { width: var(--gfui-item-width); }
.gfui-Stack[data-wrap][data-item-width="%"] > :not(.gfui-SpaceFiller) {
  width: calc((var(--gfui-item-width) - var(--gfui-flow-gap) * (1 - var(--gfui-item-fraction))) * var(--gfui-flow-wide) + 100% * (1 - var(--gfui-flow-wide)));
}
.gfui-SpaceFiller { flex: 1 1 0px; }
/* A line break in a flow. Its zero-height line still has a row gap on each side (as XMLUI's FlowLayout .break). */
.gfui-Stack[data-wrap] > .gfui-SpaceFiller {
  flex: 0 0 100%;
  height: 0;
}
/*
 * A button keeps its own width: not stretched in a column (XMLUI: layout.md
 * § VStack; width="100%" fills it), not squeezed in a row (Mantine's root
 * clips its label, so it could shrink to nothing).
 */
.gfui-AppContent > .gfui-Button,
.gfui-Stack[data-orientation="vertical"] > .gfui-Button {
  width: fit-content;
}
.gfui-Stack > .gfui-Button { flex-shrink: 0; }
/* A heading belongs to what follows it: more space above it than below. */
.gfui-AppContent > .gfui-Heading:not(:first-child),
.gfui-Stack[data-orientation="vertical"] > .gfui-Heading:not(:first-child) {
  margin-block-start: var(--gfui-gap);
}
`;

const SHELL_DRAWER = BREAKPOINTS.filter(([, min]) => min > 0)
  .map(([name, min]) => shellDrawer(name, min))
  .join("\n");

export const BASE_STYLESHEET = `
${SHELL}
${SHELL_DRAWER}
${LAYOUT}
.gfui-App,
.gfui-Theme {
  /* Mantine's global variables, redirected to the gfui theme. */
  --mantine-font-family: var(--gfui-fontFamily);
  --mantine-color-text: var(--gfui-textColor);
  --mantine-color-body: var(--gfui-backgroundColor);
  --mantine-color-dimmed: var(--gfui-textColor-secondary);
  --mantine-color-placeholder: var(--gfui-textColor-secondary);
  --mantine-color-default-border: var(--gfui-borderColor);
  --mantine-primary-color-filled: var(--gfui-color-primary-500);
  --mantine-primary-color-filled-hover: var(--gfui-color-primary-600);
  --mantine-radius-default: var(--gfui-borderRadius);
}
.gfui-Text {
  color: var(--gfui-textColor-Text);
  font-size: var(--gfui-fontSize-Text);
}
.gfui-Text[data-variant="secondary"],
.gfui-Text[data-variant="placeholder"],
.gfui-Text[data-variant="caption"] {
  color: var(--gfui-textColor-Text-secondary);
}
.gfui-Text[data-variant="code"],
.gfui-Text[data-variant="keyboard"],
.gfui-Text[data-variant="sample"],
.gfui-Text[data-variant="mono"] {
  font-family: var(--gfui-fontFamily-Text-code);
}
.gfui-Text[data-variant="code"],
.gfui-Text[data-variant="keyboard"] {
  background-color: var(--gfui-backgroundColor-Text-code);
  border-radius: 4px;
  padding: 0 0.25em;
}
.gfui-Text[data-variant="marked"] {
  background-color: var(--gfui-backgroundColor-Text-marked);
  color: inherit;
}
.gfui-Text[data-variant="strong"] { font-weight: 700; }
.gfui-Text[data-variant="title"] { font-size: 1.5em; font-weight: 600; }
.gfui-Text[data-variant="subtitle"] { font-size: 1.15em; font-weight: 500; }
.gfui-Text[data-variant="subheading"] { font-size: 0.8em; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.gfui-Text[data-variant="caption"],
.gfui-Text[data-variant="small"] { font-size: 0.85em; }
.gfui-Text[data-variant="paragraph"] { display: block; margin: 0; }
.gfui-Link {
  color: var(--gfui-textColor-Link);
  text-decoration: underline;
  cursor: pointer;
}
.gfui-Heading {
  color: var(--gfui-textColor-Heading);
  font-weight: var(--gfui-fontWeight-Heading);
  line-height: var(--gfui-lineHeight-Heading);
  margin: 0;
}
.gfui-Heading[data-level="1"] { font-size: var(--gfui-fontSize-H1); }
.gfui-Heading[data-level="2"] { font-size: var(--gfui-fontSize-H2); }
.gfui-Heading[data-level="3"] { font-size: var(--gfui-fontSize-H3); }
.gfui-Heading[data-level="4"] { font-size: var(--gfui-fontSize-H4); }
.gfui-Heading[data-level="5"] { font-size: var(--gfui-fontSize-H5); }
.gfui-Heading[data-level="6"] { font-size: var(--gfui-fontSize-H6); }
/* Mantine inputs: variables Mantine sets from CSS, redirected (our rules are unlayered: they win). */
.gfui-TextBox .mantine-Input-input {
  --input-bg: var(--gfui-backgroundColor-TextBox);
  --input-color: var(--gfui-textColor-TextBox);
  --input-bd: var(--gfui-borderColor-TextBox);
  --input-bd-focus: var(--gfui-borderColor-TextBox--focus);
}
.gfui-Select .mantine-Input-input {
  --input-bg: var(--gfui-backgroundColor-Select);
  --input-color: var(--gfui-textColor-Select);
  --input-bd: var(--gfui-borderColor-Select);
  --input-bd-focus: var(--gfui-borderColor-Select--focus);
}
/* Mantine expects its baseline.css (* { box-sizing: border-box }), which also styles <body>: only its input parts here. */
.gfui-App :where(.mantine-InputWrapper-root, .mantine-Input-wrapper, .mantine-Input-input) {
  box-sizing: border-box;
}
.gfui-TextBox .mantine-Input-input:focus,
.gfui-Select .mantine-Input-input:focus {
  --input-bd: var(--input-bd-focus);
}
.gfui-Select .mantine-Select-dropdown {
  background-color: var(--gfui-backgroundColor-Select);
  color: var(--gfui-textColor-Select);
  border-color: var(--gfui-borderColor-Select);
}
.gfui-Label {
  display: inline-flex;
  flex-direction: column;
  gap: var(--gfui-gap-Label);
}
.gfui-Label[data-position="start"] {
  flex-direction: row;
  align-items: center;
}
.gfui-Label-text {
  color: var(--gfui-textColor-Label);
  font-size: var(--gfui-fontSize-Label);
}
.gfui-Form {
  display: flex;
  flex-direction: column;
  gap: var(--gfui-gap-Form);
}
.gfui-Form-buttons {
  display: flex;
  justify-content: flex-end;
  gap: var(--gfui-gap-Form-buttons);
}
.gfui-Field {
  display: inline-flex;
  flex-direction: column;
  gap: var(--gfui-gap-Field);
}
.gfui-Field-messages {
  display: contents;
}
.gfui-ValidationMessage {
  font-size: var(--gfui-fontSize-ValidationMessage);
}
.gfui-ValidationMessage[data-severity="error"] {
  color: var(--gfui-textColor-ValidationMessage-error);
}
.gfui-ValidationMessage[data-severity="warning"] {
  color: var(--gfui-textColor-ValidationMessage-warning);
}
.gfui-ValidationMessage[data-stale] {
  opacity: 0.5;
}
.gfui-Field[data-required] > .gfui-Label > .gfui-Label-text::after {
  content: " *";
  color: var(--gfui-textColor-ValidationMessage-error);
}
.gfui-TooltipAnchor {
  position: relative;
  display: inline-flex;
}
.gfui-Tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--gfui-backgroundColor-Tooltip);
  color: var(--gfui-textColor-Tooltip);
  border-radius: var(--gfui-borderRadius-Tooltip);
  padding: var(--gfui-padding-Tooltip);
  font-size: var(--gfui-fontSize-Tooltip);
  white-space: nowrap;
  pointer-events: none;
  z-index: 1000;
}
`.trim();
