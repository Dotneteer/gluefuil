// The built-ins' stylesheet (steps 16-17): every visual value is a theme variable
// (`--pfui-*`, compiled by the theme engine; defaults in the metadata's
// `themeVars`). App renders it once as a React 19 hoisted <style>, which a
// server render emits ahead of the app's HTML.

import { BREAKPOINTS } from "@patchfuil/runtime";

export const BASE_STYLESHEET_HREF = "pfui-base";

/** Below md: a phone. The spacing ladder's page level steps down, and flows go one item per row. */
const PHONE_MAX = BREAKPOINTS.find(([name]) => name === "md")![1] - 0.02;

/**
 * The App shell (shell.tsx; design: .ai/plan/poc-19a-app-shell.md).
 *
 * - The regions are flex items: the header and footer of .pfui-AppColumn, the
 *   nav in one of four slots (a nav in the header must be inside the header
 *   element, which grid areas can't express).
 * - What sticks and scrolls follows the root's data-* attributes; the sticky
 *   offsets are the declared heights (height-AppHeader, height-Footer).
 * - Rules for wide screens wrap their ancestor conditions in :where(), so the
 *   drawer rules (SHELL_DRAWER, per breakpoint) win without specificity tricks.
 */
const SHELL = `
.pfui-App {
  background-color: var(--pfui-backgroundColor-App);
  color: var(--pfui-textColor-App);
  font-family: var(--pfui-fontFamily-App);
  font-size: var(--pfui-fontSize-App);
  line-height: var(--pfui-lineHeight);
  display: flex;
  --pfui-shell-top: 0px;
  --pfui-shell-bottom: 0px;
}
.pfui-App[data-scroll="page"] { min-height: 100dvh; }
.pfui-App[data-scroll="content"] { height: 100dvh; overflow: hidden; }
.pfui-App[data-header-sticky] { --pfui-shell-top: var(--pfui-height-AppHeader); }
.pfui-App[data-footer-sticky] { --pfui-shell-bottom: var(--pfui-height-Footer); }
.pfui-AppColumn { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pfui-AppBody { flex: 1; display: flex; min-height: 0; }
.pfui-AppMain { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pfui-AppContent {
  flex: 1 0 auto;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--pfui-maxWidth-content-App);
  margin-inline: auto;
  /* The page: level 0 of the spacing ladder (LAYOUT below). */
  display: flex;
  flex-direction: column;
  --pfui-gap: var(--pfui-l0);
  gap: var(--pfui-gap);
  padding: var(--pfui-paddingVertical-content-App, var(--pfui-l0)) var(--pfui-paddingHorizontal-content-App, var(--pfui-l0));
}
:where(.pfui-App[data-scroll="content"]) .pfui-AppMain { overflow: auto; }
:where(.pfui-App[data-scroll="content"]) .pfui-NavPanel { overflow-y: auto; }

.pfui-AppHeader {
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--pfui-gap-AppHeader);
  height: var(--pfui-height-AppHeader);
  padding: 0 var(--pfui-paddingHorizontal-AppHeader);
  background-color: var(--pfui-backgroundColor-AppHeader);
  color: var(--pfui-textColor-AppHeader);
  border-bottom: 1px solid var(--pfui-borderColor-AppHeader);
}
:where(.pfui-App[data-scroll="page"]) .pfui-AppHeader[data-sticky] { position: sticky; top: 0; z-index: 100; }
/* Mantine draws the lines with --mantine-color-black/white, which pfui doesn't define. */
.pfui-AppHeader-burger { display: none; --burger-color: var(--pfui-textColor-AppHeader); }
.pfui-AppHeader-logo { display: flex; align-items: center; }
.pfui-AppHeader-title { font-weight: 600; white-space: nowrap; }
.pfui-AppHeader-content { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--pfui-gap-AppHeader); }
.pfui-AppHeader-profile { display: flex; align-items: center; }
:where(.pfui-App:not([data-nav="header"])) .pfui-AppHeader[data-generated] { display: none; }
:where(.pfui-App[data-nav-full-height]) .pfui-AppHeader-logo { display: none; }
.pfui-AppLogo { display: block; max-height: calc(var(--pfui-height-AppHeader) - 16px); }

.pfui-NavPanel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: var(--pfui-backgroundColor-NavPanel);
}
.pfui-NavPanel-items { display: flex; flex-direction: column; gap: var(--pfui-space-0_5); padding: var(--pfui-padding-NavPanel); flex: 1; }
.pfui-NavPanel-logo { display: flex; align-items: center; min-height: var(--pfui-height-AppHeader); padding: 0 var(--pfui-paddingHorizontal-AppHeader); box-sizing: border-box; }
.pfui-NavPanel-footer { padding: var(--pfui-padding-NavPanel); }
.pfui-NavPanel[data-placement="side"] {
  flex-shrink: 0;
  width: var(--pfui-width-navPanel-App);
  border-inline-end: 1px solid var(--pfui-borderColor-NavPanel);
}
:where(.pfui-App[data-scroll="page"]) .pfui-NavPanel[data-placement="side"][data-sticky] {
  position: sticky;
  top: var(--pfui-shell-top);
  height: calc(100dvh - var(--pfui-shell-top) - var(--pfui-shell-bottom));
  overflow-y: auto;
}
:where(.pfui-App[data-scroll="page"][data-nav-full-height]) .pfui-NavPanel[data-placement="side"][data-sticky] { top: 0; height: 100dvh; }
.pfui-NavPanel[data-placement="below-header"] { flex-shrink: 0; border-bottom: 1px solid var(--pfui-borderColor-NavPanel); }
:where(.pfui-App[data-scroll="page"]) .pfui-NavPanel[data-placement="below-header"][data-sticky] { position: sticky; top: var(--pfui-shell-top); z-index: 99; }
.pfui-NavPanel[data-placement="header"] { background-color: transparent; }
.pfui-NavPanel[data-placement="below-header"] .pfui-NavPanel-items,
.pfui-NavPanel[data-placement="header"] .pfui-NavPanel-items { flex-direction: row; align-items: center; }
.pfui-NavPanel[data-placement="header"] .pfui-NavPanel-items { padding: 0; }
:where(.pfui-App[data-nav-collapsed]) .pfui-NavPanel[data-placement="side"] { width: var(--pfui-width-navPanel-collapsed-App); }
:where(.pfui-App[data-nav-collapsed]) .pfui-NavLink-label,
:where(.pfui-App[data-nav-collapsed]) .pfui-NavGroup-chevron,
:where(.pfui-App[data-nav-collapsed]) .pfui-NavPanel-logo { display: none; }
:where(.pfui-App[data-nav-collapsed]) .pfui-NavLink-initial { display: inline-flex; }
.pfui-App-overlay { display: none; }

.pfui-Footer {
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  min-height: var(--pfui-height-Footer);
  padding: 0 var(--pfui-paddingHorizontal-Footer);
  background-color: var(--pfui-backgroundColor-Footer);
  color: var(--pfui-textColor-Footer);
  border-top: 1px solid var(--pfui-borderColor-Footer);
}
:where(.pfui-App[data-scroll="page"]) .pfui-Footer[data-sticky] { position: sticky; bottom: 0; z-index: 100; }

.pfui-NavLink,
.pfui-NavGroup-label {
  display: flex;
  align-items: center;
  gap: var(--pfui-space-2);
  padding: var(--pfui-padding-NavLink);
  border-radius: var(--pfui-borderRadius-NavLink);
  color: var(--pfui-textColor-NavLink);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.pfui-NavLink:hover,
.pfui-NavGroup-label:hover { background-color: var(--pfui-backgroundColor-NavLink--hover); }
.pfui-NavLink[data-active] {
  color: var(--pfui-textColor-NavLink--active);
  background-color: var(--pfui-backgroundColor-NavLink--active);
  font-weight: 600;
}
.pfui-NavLink-icon { flex-shrink: 0; }
.pfui-NavLink-initial {
  display: none;
  flex-shrink: 0;
  width: 20px;
  justify-content: center;
  font-weight: 600;
}
.pfui-NavGroup-label { list-style: none; }
.pfui-NavGroup-label::-webkit-details-marker { display: none; }
.pfui-NavGroup-chevron { margin-inline-start: auto; transition: transform 150ms; }
.pfui-NavGroup[open] > .pfui-NavGroup-label .pfui-NavGroup-chevron { transform: rotate(180deg); }
.pfui-NavGroup-items { display: flex; flex-direction: column; gap: var(--pfui-space-0_5); padding-inline-start: var(--pfui-space-4); }
:where(.pfui-NavPanel[data-placement="header"], .pfui-NavPanel[data-placement="below-header"]) .pfui-NavGroup { position: relative; }
:where(.pfui-NavPanel[data-placement="header"], .pfui-NavPanel[data-placement="below-header"]) .pfui-NavGroup-items {
  position: absolute;
  top: 100%;
  inset-inline-start: 0;
  z-index: 102;
  min-width: 12rem;
  padding: var(--pfui-padding-NavPanel);
  background-color: var(--pfui-backgroundColor-NavPanel);
  border: 1px solid var(--pfui-borderColor-NavPanel);
  border-radius: var(--pfui-borderRadius);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
}
.pfui-NavPanelCollapseButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--pfui-space-1);
  border: none;
  border-radius: var(--pfui-borderRadius);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.pfui-NavPanelCollapseButton:hover { background-color: var(--pfui-backgroundColor-NavLink--hover); }
`;

/** Below `drawerBelow`: the nav becomes a drawer, opened by the header's toggle. One copy per breakpoint. */
function shellDrawer(name: string, min: number): string {
  const app = `.pfui-App[data-drawer-below="${name}"]`;
  return `
@media (max-width: ${min - 0.02}px) {
  ${app} .pfui-AppHeader-burger { display: inline-block; }
  ${app} .pfui-AppHeader[data-generated],
  ${app} .pfui-AppHeader-logo { display: flex; }
  ${app} .pfui-NavPanelCollapseButton { display: none; }
  ${app} .pfui-NavPanel {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 101;
    width: min(85vw, var(--pfui-width-navPanel-App));
    height: auto;
    overflow-y: auto;
    background-color: var(--pfui-backgroundColor-NavPanel);
    border-inline-end: 1px solid var(--pfui-borderColor-NavPanel);
    transform: translateX(-100%);
    /* Hidden only after sliding out; visible at once when opening, so the focus can move in. */
    visibility: hidden;
    transition: transform 200ms ease, visibility 0s 200ms;
  }
  ${app}[data-drawer-open] .pfui-NavPanel { transform: none; visibility: visible; transition: transform 200ms ease, visibility 0s; }
  ${app} .pfui-NavPanel .pfui-NavPanel-items { flex-direction: column; align-items: stretch; padding: var(--pfui-padding-NavPanel); }
  ${app} .pfui-NavPanel .pfui-NavLink-label,
  ${app} .pfui-NavPanel .pfui-NavGroup-chevron { display: inline; }
  ${app} .pfui-NavPanel .pfui-NavLink-initial { display: none; }
  ${app} .pfui-NavPanel .pfui-NavGroup-items { position: static; box-shadow: none; border: none; min-width: 0; padding-block: 0; }
  ${app} .pfui-App-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 99;
    background-color: var(--pfui-backgroundColor-NavPanel-overlay);
  }
}`;
}


/**
 * The layout system (layout.tsx; design: .ai/plan/poc-19d-layout.md).
 *
 * - The spacing ladder: a container's data-level (0-3) and orientation pick
 *   --pfui-step from the space-level* theme variables. A vertical stack and a
 *   horizontal stack of columns (one with a container child) use their level's
 *   step; a horizontal stack of items the next tighter one. A surface (a
 *   background or a border) gets its level's step as padding.
 * - --pfui-gap is the gap in effect: an explicit gap (inline), else gap-Stack
 *   (a theme's flat override, XMLUI's behavior), else the step.
 * - Level 0 is smaller on phones (--pfui-l0); resolved on every container, so a
 *   <Theme> below the App can change it.
 * - Percentage widths in a flow (a child's width, layout.tsx flowWidth, or
 *   itemWidth) are gap-aware: calc(W - gap * (1 - W/100%)), and 100% on
 *   phones (--pfui-flow-wide is 0 there).
 */
const LAYOUT = `
.pfui-AppContent,
.pfui-Stack {
  --pfui-l0: var(--pfui-space-level0);
}
@media (max-width: ${PHONE_MAX}px) {
  .pfui-AppContent,
  .pfui-Stack {
    --pfui-l0: var(--pfui-space-level0-phone);
  }
}
.pfui-Stack {
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  --pfui-gap: var(--pfui-gap-Stack, var(--pfui-step));
  gap: var(--pfui-gap);
}
.pfui-Stack[data-level="0"] { --pfui-step: var(--pfui-l0); --pfui-pad: var(--pfui-l0); }
.pfui-Stack[data-level="1"] { --pfui-step: var(--pfui-space-level1); --pfui-pad: var(--pfui-space-level1); }
.pfui-Stack[data-level="2"] { --pfui-step: var(--pfui-space-level2); --pfui-pad: var(--pfui-space-level2); }
.pfui-Stack[data-level="3"] { --pfui-step: var(--pfui-space-level3); --pfui-pad: var(--pfui-space-level3); }
.pfui-Stack[data-orientation="horizontal"][data-level="0"] { --pfui-step: var(--pfui-space-level1); }
.pfui-Stack[data-orientation="horizontal"][data-level="1"] { --pfui-step: var(--pfui-space-level2); }
.pfui-Stack[data-orientation="horizontal"][data-level="2"],
.pfui-Stack[data-orientation="horizontal"][data-level="3"] { --pfui-step: var(--pfui-space-level3); }
.pfui-Stack[data-orientation="horizontal"][data-level="0"]:has(> .pfui-Stack) { --pfui-step: var(--pfui-l0); }
.pfui-Stack[data-orientation="horizontal"][data-level="1"]:has(> .pfui-Stack) { --pfui-step: var(--pfui-space-level1); }
.pfui-Stack[data-orientation="horizontal"][data-level="2"]:has(> .pfui-Stack) { --pfui-step: var(--pfui-space-level2); }
.pfui-Stack[data-surface] { padding: var(--pfui-pad); }
.pfui-Stack[data-wrap] {
  flex-wrap: wrap;
  --pfui-flow-gap: var(--pfui-gap);
  --pfui-flow-wide: 1;
}
@media (max-width: ${PHONE_MAX}px) {
  .pfui-Stack[data-wrap] { --pfui-flow-wide: 0; }
}
.pfui-Stack[data-wrap] > * { max-width: 100%; box-sizing: border-box; }
.pfui-Stack[data-wrap][data-item-width] > :not(.pfui-SpaceFiller) { flex-shrink: 0; }
.pfui-Stack[data-wrap][data-item-width="fixed"] > :not(.pfui-SpaceFiller) { width: var(--pfui-item-width); }
.pfui-Stack[data-wrap][data-item-width="%"] > :not(.pfui-SpaceFiller) {
  width: calc((var(--pfui-item-width) - var(--pfui-flow-gap) * (1 - var(--pfui-item-fraction))) * var(--pfui-flow-wide) + 100% * (1 - var(--pfui-flow-wide)));
}
.pfui-SpaceFiller { flex: 1 1 0px; }
/* A line break in a flow. Its zero-height line still has a row gap on each side (as XMLUI's FlowLayout .break). */
.pfui-Stack[data-wrap] > .pfui-SpaceFiller {
  flex: 0 0 100%;
  height: 0;
}
/*
 * A button keeps its own width: not stretched in a column (XMLUI: layout.md
 * § VStack; width="100%" fills it), not squeezed in a row (Mantine's root
 * clips its label, so it could shrink to nothing).
 */
.pfui-AppContent > .pfui-Button,
.pfui-Stack[data-orientation="vertical"] > .pfui-Button {
  width: fit-content;
}
.pfui-Stack > .pfui-Button { flex-shrink: 0; }
/* A heading belongs to what follows it: more space above it than below. */
.pfui-AppContent > .pfui-Heading:not(:first-child),
.pfui-Stack[data-orientation="vertical"] > .pfui-Heading:not(:first-child) {
  margin-block-start: var(--pfui-gap);
}
`;

const SHELL_DRAWER = BREAKPOINTS.filter(([, min]) => min > 0)
  .map(([name, min]) => shellDrawer(name, min))
  .join("\n");

export const BASE_STYLESHEET = `
${SHELL}
${SHELL_DRAWER}
${LAYOUT}
.pfui-App,
.pfui-Theme {
  /* Mantine's global variables, redirected to the pfui theme. */
  --mantine-font-family: var(--pfui-fontFamily);
  --mantine-color-text: var(--pfui-textColor);
  --mantine-color-body: var(--pfui-backgroundColor);
  --mantine-color-dimmed: var(--pfui-textColor-secondary);
  --mantine-color-placeholder: var(--pfui-textColor-secondary);
  --mantine-color-default-border: var(--pfui-borderColor);
  --mantine-primary-color-filled: var(--pfui-color-primary-500);
  --mantine-primary-color-filled-hover: var(--pfui-color-primary-600);
  --mantine-radius-default: var(--pfui-borderRadius);
}
.pfui-Text {
  color: var(--pfui-textColor-Text);
  font-size: var(--pfui-fontSize-Text);
}
.pfui-Text[data-variant="secondary"],
.pfui-Text[data-variant="placeholder"],
.pfui-Text[data-variant="caption"] {
  color: var(--pfui-textColor-Text-secondary);
}
.pfui-Text[data-variant="code"],
.pfui-Text[data-variant="keyboard"],
.pfui-Text[data-variant="sample"],
.pfui-Text[data-variant="mono"] {
  font-family: var(--pfui-fontFamily-Text-code);
}
.pfui-Text[data-variant="code"],
.pfui-Text[data-variant="keyboard"] {
  background-color: var(--pfui-backgroundColor-Text-code);
  border-radius: 4px;
  padding: 0 0.25em;
}
.pfui-Text[data-variant="marked"] {
  background-color: var(--pfui-backgroundColor-Text-marked);
  color: inherit;
}
.pfui-Text[data-variant="strong"] { font-weight: 700; }
.pfui-Text[data-variant="title"] { font-size: 1.5em; font-weight: 600; }
.pfui-Text[data-variant="subtitle"] { font-size: 1.15em; font-weight: 500; }
.pfui-Text[data-variant="subheading"] { font-size: 0.8em; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.pfui-Text[data-variant="caption"],
.pfui-Text[data-variant="small"] { font-size: 0.85em; }
.pfui-Text[data-variant="paragraph"] { display: block; margin: 0; }
.pfui-Link {
  color: var(--pfui-textColor-Link);
  text-decoration: underline;
  cursor: pointer;
}
.pfui-Heading {
  color: var(--pfui-textColor-Heading);
  font-weight: var(--pfui-fontWeight-Heading);
  line-height: var(--pfui-lineHeight-Heading);
  margin: 0;
}
.pfui-Heading[data-level="1"] { font-size: var(--pfui-fontSize-H1); }
.pfui-Heading[data-level="2"] { font-size: var(--pfui-fontSize-H2); }
.pfui-Heading[data-level="3"] { font-size: var(--pfui-fontSize-H3); }
.pfui-Heading[data-level="4"] { font-size: var(--pfui-fontSize-H4); }
.pfui-Heading[data-level="5"] { font-size: var(--pfui-fontSize-H5); }
.pfui-Heading[data-level="6"] { font-size: var(--pfui-fontSize-H6); }
/* Mantine inputs: variables Mantine sets from CSS, redirected (our rules are unlayered: they win). */
.pfui-TextBox .mantine-Input-input {
  --input-bg: var(--pfui-backgroundColor-TextBox);
  --input-color: var(--pfui-textColor-TextBox);
  --input-bd: var(--pfui-borderColor-TextBox);
  --input-bd-focus: var(--pfui-borderColor-TextBox--focus);
}
.pfui-Select .mantine-Input-input {
  --input-bg: var(--pfui-backgroundColor-Select);
  --input-color: var(--pfui-textColor-Select);
  --input-bd: var(--pfui-borderColor-Select);
  --input-bd-focus: var(--pfui-borderColor-Select--focus);
}
/* Mantine expects its baseline.css (* { box-sizing: border-box }), which also styles <body>: only its input parts here. */
.pfui-App :where(.mantine-InputWrapper-root, .mantine-Input-wrapper, .mantine-Input-input) {
  box-sizing: border-box;
}
.pfui-TextBox .mantine-Input-input:focus,
.pfui-Select .mantine-Input-input:focus {
  --input-bd: var(--input-bd-focus);
}
.pfui-Select .mantine-Select-dropdown {
  background-color: var(--pfui-backgroundColor-Select);
  color: var(--pfui-textColor-Select);
  border-color: var(--pfui-borderColor-Select);
}
.pfui-Label {
  display: inline-flex;
  flex-direction: column;
  gap: var(--pfui-gap-Label);
}
.pfui-Label[data-position="start"] {
  flex-direction: row;
  align-items: center;
}
.pfui-Label-text {
  color: var(--pfui-textColor-Label);
  font-size: var(--pfui-fontSize-Label);
}
.pfui-TooltipAnchor {
  position: relative;
  display: inline-flex;
}
.pfui-Tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--pfui-backgroundColor-Tooltip);
  color: var(--pfui-textColor-Tooltip);
  border-radius: var(--pfui-borderRadius-Tooltip);
  padding: var(--pfui-padding-Tooltip);
  font-size: var(--pfui-fontSize-Tooltip);
  white-space: nowrap;
  pointer-events: none;
  z-index: 1000;
}
`.trim();
