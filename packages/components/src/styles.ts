// The built-ins' stylesheet (steps 16-17): every visual value is a theme variable
// (`--gfui-*`, compiled by the theme engine; defaults in the metadata's
// `themeVars`). App renders it once as a React 19 hoisted <style>, which a
// server render emits ahead of the app's HTML.

import { BREAKPOINTS } from "@gluefuil/runtime";

export const BASE_STYLESHEET_HREF = "gfui-base";

/** The text inputs: each has TextBox's five theme variables, with its own name (step 24). */
const TEXT_INPUTS = ["TextBox", "PasswordInput", "TextArea", "NumberBox", "ColorPicker", "Select", "AutoComplete", "DateInput", "TimeInput", "DatePicker"];

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

/**
 * The text-overflow props of Text, Heading and Link (text.tsx textOverflow;
 * XMLUI Text.module.scss): data-overflow, data-break, data-preserve-linebreaks,
 * data-inline, data-clip.
 */
const TEXT_OVERFLOW = `
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-overflow="truncate"] {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-overflow="clamp"] {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-overflow][data-clip] { text-overflow: clip; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-overflow="none"] {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
}
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-overflow="scroll"] {
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
}
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-overflow="flow"] {
  display: inline-block;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: normal;
}
:is(.gfui-Text, .gfui-Heading, .gfui-Link):is(h1, h2, h3, h4, h5, h6, p)[data-overflow] { display: block; }
:is(h1, h2, h3, h4, h5, h6, p)[data-overflow="clamp"] { display: -webkit-box; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-preserve-linebreaks] { white-space: pre-wrap; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-inline] { display: inline; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-break="normal"] { word-break: normal; overflow-wrap: normal; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-break="word"] { overflow-wrap: break-word; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-break="anywhere"] { word-break: break-all; overflow-wrap: anywhere; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-break="keep"] { word-break: keep-all; }
:is(.gfui-Text, .gfui-Heading, .gfui-Link)[data-break="hyphenate"] { hyphens: auto; overflow-wrap: break-word; }
.gfui-Heading-anchor {
  margin-inline-start: 0.4em;
  color: var(--gfui-color-anchor-Heading);
  text-decoration: none;
  opacity: 0;
}
.gfui-Heading:hover > .gfui-Heading-anchor,
.gfui-Heading-anchor:focus-visible { opacity: 1; }
`;

/**
 * The display components (display.tsx, icons.tsx; step 23). Mantine's own
 * variables and rules are overridden by these unlayered rules.
 */
const DISPLAY = `
.gfui-Icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: text-bottom;
  width: var(--gfui-icon-size, var(--gfui-size-Icon));
  height: var(--gfui-icon-size, var(--gfui-size-Icon));
}
[data-clickable] { cursor: pointer; }
.gfui-Image {
  border-radius: var(--gfui-borderRadius-Image);
  max-width: 100%;
}
.gfui-Image[data-inline] { display: inline; }
.gfui-Image[data-grayscale] { filter: grayscale(1); }
.gfui-Avatar {
  --avatar-size: var(--gfui-avatar-size, 3em);
  --avatar-radius: var(--gfui-borderRadius-Avatar);
  --avatar-placeholder-fz: calc(var(--avatar-size) * 0.33);
  border: var(--gfui-border-Avatar);
  box-shadow: var(--gfui-boxShadow-Avatar);
}
.gfui-Avatar[data-size="xs"] { --gfui-avatar-size: 1.5em; }
.gfui-Avatar[data-size="sm"] { --gfui-avatar-size: 3em; }
.gfui-Avatar[data-size="md"] { --gfui-avatar-size: 5em; }
.gfui-Avatar[data-size="lg"] { --gfui-avatar-size: 12em; }
.gfui-Avatar[data-size="xl"] { --gfui-avatar-size: 16em; }
.gfui-Avatar .mantine-Avatar-placeholder {
  background-color: var(--gfui-backgroundColor-Avatar);
  color: var(--gfui-textColor-Avatar);
  font-weight: var(--gfui-fontWeight-Avatar);
}
.gfui-Badge {
  height: auto;
  padding: var(--gfui-padding-Badge);
  background: var(--gfui-badge-bg, var(--gfui-backgroundColor-Badge));
  color: var(--gfui-badge-color, var(--gfui-textColor-Badge));
  border: var(--gfui-border-Badge);
  border-radius: var(--gfui-borderRadius-Badge);
  font-size: var(--gfui-fontSize-Badge);
  font-weight: var(--gfui-fontWeight-Badge);
  text-transform: var(--gfui-textTransform-Badge);
  line-height: 1.4;
  letter-spacing: normal;
}
.gfui-Badge[data-shape="pill"] {
  background: var(--gfui-badge-bg, var(--gfui-backgroundColor-Badge-pill, var(--gfui-backgroundColor-Badge)));
  color: var(--gfui-badge-color, var(--gfui-textColor-Badge-pill, var(--gfui-textColor-Badge)));
  border-radius: var(--gfui-borderRadius-Badge-pill, 999em);
}
.gfui-Badge .mantine-Badge-label { overflow: visible; }
.gfui-ProgressBar {
  --progress-size: var(--gfui-thickness-ProgressBar);
  --progress-radius: var(--gfui-borderRadius-ProgressBar);
  background-color: var(--gfui-backgroundColor-ProgressBar);
}
.gfui-ProgressBar .mantine-Progress-section {
  background-color: var(--gfui-color-indicator-ProgressBar);
  border-radius: var(--gfui-borderRadius-indicator-ProgressBar);
}
.gfui-ProgressBar[data-complete] .mantine-Progress-section {
  background-color: var(--gfui-color-indicator-ProgressBar--complete);
}
.gfui-Spinner {
  --loader-size: var(--gfui-size-Spinner);
  --loader-color: var(--gfui-borderColor-Spinner);
}
.gfui-Spinner::after { border-width: var(--gfui-thickness-Spinner); }
.gfui-Spinner-fullScreen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.gfui-ContentSeparator {
  --divider-color: var(--gfui-backgroundColor-ContentSeparator);
  --divider-size: var(--gfui-separator-thickness, var(--gfui-thickness-ContentSeparator));
  flex-shrink: 0;
}
.gfui-ContentSeparator[data-orientation="horizontal"] {
  width: var(--gfui-separator-length, var(--gfui-length-ContentSeparator));
}
.gfui-ContentSeparator[data-orientation="vertical"][data-length] {
  height: var(--gfui-separator-length);
  align-self: auto;
}
.gfui-Card {
  background-color: var(--gfui-backgroundColor-Card);
  border: var(--gfui-border-Card);
  border-radius: var(--gfui-borderRadius-Card);
  box-shadow: var(--gfui-boxShadow-Card);
  --gfui-gap: var(--gfui-gap-Card, var(--gfui-gap-Stack, var(--gfui-step)));
}
.gfui-Card[data-surface] { padding: var(--gfui-padding-Card, var(--gfui-pad)); }
.gfui-Card[data-clickable]:hover { background-color: var(--gfui-backgroundColor-Card--hover); }
/* A horizontal card: the title row on a line of its own above the children. */
.gfui-Card[data-orientation="horizontal"]:has(> .gfui-Card-header) { flex-wrap: wrap; }
.gfui-Card-header {
  display: flex;
  align-items: center;
  gap: var(--gfui-gap-avatar-Card);
  min-width: 0;
  flex-basis: 100%;
}
.gfui-Card-titles {
  display: flex;
  flex-direction: column;
  gap: var(--gfui-gap-title-Card);
  min-width: 0;
}
.gfui-Card-titles > .gfui-Link { text-decoration-line: none; }
.gfui-Markdown {
  display: flex;
  flex-direction: column;
  gap: var(--gfui-gap-Markdown);
  min-width: 0;
  overflow-wrap: break-word;
}
.gfui-Markdown > *,
.gfui-Markdown :is(p, ul, ol, blockquote, pre, table, figure, dl) { margin-block: 0; }
.gfui-Markdown :is(li, blockquote, td, th) > p + p { margin-block-start: var(--gfui-gap-Markdown); }
.gfui-Markdown .gfui-Heading { margin-block-start: calc(var(--gfui-gap-Markdown) / 2); }
.gfui-Markdown > .gfui-Heading:first-child { margin-block-start: 0; }
.gfui-Markdown :is(ul, ol) { padding-inline-start: 1.5em; }
.gfui-Markdown li[data-task] { list-style: none; margin-inline-start: -1.5em; }
.gfui-Markdown li[data-task] > input { margin-inline-end: 0.5em; }
.gfui-Markdown blockquote {
  margin-inline: 0;
  padding-inline-start: 1em;
  border-inline-start: 3px solid var(--gfui-borderColor-Markdown-blockquote);
  color: var(--gfui-textColor-secondary);
}
.gfui-Markdown-code {
  margin: 0;
  padding: var(--gfui-space-3);
  overflow-x: auto;
  border-radius: var(--gfui-borderRadius);
  background-color: var(--gfui-backgroundColor-Markdown-code);
  font-family: var(--gfui-fontFamily-Text-code);
  font-size: 0.9em;
}
.gfui-Markdown-table { overflow-x: auto; }
.gfui-Markdown table { border-collapse: collapse; }
.gfui-Markdown :is(th, td) {
  border: 1px solid var(--gfui-borderColor-Markdown-table);
  padding: var(--gfui-paddingCell-Markdown-table);
  text-align: start;
}
.gfui-Markdown th { background-color: var(--gfui-backgroundColor-Markdown-th); }
.gfui-Markdown hr {
  width: 100%;
  border: 0;
  border-block-start: 1px solid var(--gfui-borderColor);
}
.gfui-Markdown-image { max-width: 100%; }
.gfui-Markdown[data-grayscale] .gfui-Markdown-image { filter: grayscale(1); }
.gfui-Markdown[data-truncate-links] .gfui-Link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
.gfui-Markdown-footnotes {
  font-size: 0.9em;
  color: var(--gfui-textColor-secondary);
  border-block-start: 1px solid var(--gfui-borderColor);
  padding-block-start: var(--gfui-gap-Markdown);
}
`;



/**
 * Structure (step 28, structure.tsx): Tabs, ExpandableItem, Stepper, Splitter,
 * ScrollViewer, StickyBox, StickySection, ResponsiveBar.
 */
const STRUCTURE = `
.gfui-Tabs { display: flex; flex-direction: column; min-width: 0; }
.gfui-Tabs[data-orientation="vertical"] { flex-direction: row; }
.gfui-Tabs-list { --tab-border-color: var(--gfui-borderColor-Tabs); }
.gfui-Tabs-tab {
  color: var(--gfui-textColor-Tabs);
  font-family: var(--gfui-fontFamily);
  font-size: inherit;
}
.gfui-Tabs-tab:hover { background-color: var(--gfui-backgroundColor-Tabs--hover); }
.gfui-Tabs-tab[data-active] {
  color: var(--gfui-textColor-Tabs--active);
  border-color: var(--gfui-borderColor-Tabs--active);
}
.gfui-Tabs-panel { padding-top: var(--gfui-gap-Tabs, var(--gfui-space-level2)); }
.gfui-Tabs[data-orientation="vertical"] > .gfui-Tabs-panel { padding-top: 0; padding-left: var(--gfui-gap-Tabs, var(--gfui-space-level2)); flex: 1 1 0; min-width: 0; }
.gfui-Tabs[data-accordion] .gfui-Tabs-panel { padding-top: 0; }
.gfui-Tabs[data-accordion] .gfui-Tabs-tab[data-active] { color: var(--gfui-textColor-Tabs--active); }
.gfui-ExpandableItem { display: flex; flex-direction: column; min-width: 0; }
.gfui-ExpandableItem-summary { display: flex; align-items: center; gap: var(--gfui-gap-ExpandableItem); color: var(--gfui-textColor-summary-ExpandableItem); }
.gfui-ExpandableItem-summary[data-full-width] > .gfui-ExpandableItem-toggle { flex: 1 1 auto; justify-content: space-between; }
.gfui-ExpandableItem-summary[data-full-width] > .gfui-ExpandableItem-label { flex: 1 1 auto; }
.gfui-ExpandableItem-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--gfui-gap-ExpandableItem);
  padding: var(--gfui-space-1) 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: start;
}
.gfui-ExpandableItem-toggle:disabled { cursor: default; opacity: 0.6; }
.gfui-ExpandableItem-icon { flex-shrink: 0; width: 1.1em; height: 1.1em; }
.gfui-ExpandableItem-content > * { padding-top: var(--gfui-gap-ExpandableItem); }
.gfui-Stepper { display: flex; flex-direction: column; gap: var(--gfui-space-level2); min-width: 0; font-family: var(--gfui-fontFamily); }
.gfui-Stepper-headers { display: flex; list-style: none; margin: 0; padding: 0; gap: var(--gfui-space-3); }
.gfui-Stepper[data-orientation="horizontal"] > .gfui-Stepper-headers { flex-wrap: wrap; align-items: flex-start; }
.gfui-Stepper[data-orientation="vertical"] > .gfui-Stepper-headers { flex-direction: column; }
.gfui-Stepper[data-orientation="horizontal"] .gfui-Stepper-step { flex: 1 1 0; min-width: 0; }
.gfui-Stepper[data-orientation="horizontal"] .gfui-Stepper-step + .gfui-Stepper-step > .gfui-Step-header::before {
  content: "";
  flex: 0 0 var(--gfui-space-4);
  height: 2px;
  align-self: center;
  background-color: var(--gfui-borderColor);
}
.gfui-Step-header {
  display: flex;
  align-items: center;
  gap: var(--gfui-space-2);
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--gfui-textColor);
  text-align: start;
}
button.gfui-Step-header { cursor: pointer; }
.gfui-Stepper[data-stacked-label] .gfui-Step-header { flex-direction: column; }
.gfui-Stepper[data-stacked-label] .gfui-Stepper-step + .gfui-Stepper-step > .gfui-Step-header::before { display: none; }
.gfui-Step-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 2em;
  height: 2em;
  border-radius: 50%;
  border: 2px solid var(--gfui-borderColor);
  font-weight: 600;
  font-size: 0.9em;
}
.gfui-Step-indicator > svg { width: 1.1em; height: 1.1em; }
.gfui-Step-header[data-state="active"] > .gfui-Step-indicator { border-color: var(--gfui-color-Stepper--active); color: var(--gfui-color-Stepper--active); }
.gfui-Step-header[data-state="completed"] > .gfui-Step-indicator { border-color: var(--gfui-color-Stepper--completed); background-color: var(--gfui-color-Stepper--completed); color: #ffffff; }
.gfui-Step-header[data-state="error"] > .gfui-Step-indicator { border-color: var(--gfui-color-Stepper--error); color: var(--gfui-color-Stepper--error); }
.gfui-Step-header[data-state="error"] .gfui-Step-label { color: var(--gfui-color-Stepper--error); }
.gfui-Step-labels { display: flex; flex-direction: column; min-width: 0; }
.gfui-Step-label { font-weight: 600; }
.gfui-Step-description { color: var(--gfui-textColor-secondary); font-size: 0.9em; }
.gfui-Stepper[data-orientation="vertical"] .gfui-Step-content { padding: var(--gfui-space-2) 0 var(--gfui-space-2) calc(1em + var(--gfui-space-2)); }
.gfui-Splitter { display: flex; min-width: 0; min-height: 0; overflow: hidden; }
.gfui-Splitter[data-orientation="horizontal"] { flex-direction: row; }
.gfui-Splitter[data-orientation="vertical"] { flex-direction: column; }
.gfui-Splitter[data-orientation="horizontal"][data-swapped] { flex-direction: row-reverse; }
.gfui-Splitter[data-orientation="vertical"][data-swapped] { flex-direction: column-reverse; }
.gfui-Splitter-pane { display: flex; flex-direction: column; overflow: auto; min-width: 0; min-height: 0; }
.gfui-Splitter-pane[data-pane="secondary"] { flex: 1 1 0; }
.gfui-Splitter-pane > * { flex: 1 1 auto; }
/* One visible child (the other hidden by when): no bar, it fills the splitter. */
.gfui-Splitter-pane:empty { display: none; }
.gfui-Splitter:has(> .gfui-Splitter-pane:empty) > .gfui-Splitter-resizer { display: none; }
/* !important: the primary pane's size and limits are inline styles. */
.gfui-Splitter:has(> .gfui-Splitter-pane:empty) > .gfui-Splitter-pane { flex: 1 1 0 !important; max-width: none !important; max-height: none !important; min-width: 0 !important; min-height: 0 !important; }
.gfui-Splitter-resizer {
  flex: 0 0 var(--gfui-thickness-resizer-Splitter);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--gfui-backgroundColor-resizer-Splitter);
  touch-action: none;
}
.gfui-Splitter[data-orientation="horizontal"] > .gfui-Splitter-resizer { cursor: col-resize; }
.gfui-Splitter[data-orientation="vertical"] > .gfui-Splitter-resizer { cursor: row-resize; }
.gfui-Splitter-resizer:hover,
.gfui-Splitter-resizer:focus-visible,
.gfui-Splitter[data-dragging] > .gfui-Splitter-resizer { background-color: var(--gfui-backgroundColor-resizer-Splitter--hover); outline: none; }
.gfui-Splitter[data-floating]:not([data-dragging]) > .gfui-Splitter-resizer:not(:hover):not(:focus-visible) { background-color: transparent; }
.gfui-Splitter[data-dragging] { user-select: none; }
.gfui-ScrollViewer { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; min-width: 0; --gfui-shell-top: 0px; }
.gfui-ScrollViewer-body { position: relative; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.gfui-ScrollViewer-area { flex: 1 1 0; min-height: 0; }
/* normal: the browser's scrollbar (the other styles: Mantine's ScrollArea viewport). */
.gfui-ScrollViewer-body > .gfui-ScrollViewer-viewport { flex: 1 1 0; min-height: 0; overflow: auto; }
.gfui-ScrollViewer-area { --scrollarea-scrollbar-size: var(--gfui-size-scrollbar-ScrollViewer); }
.gfui-ScrollViewer-thumb { background-color: var(--gfui-backgroundColor-thumb-ScrollViewer); }
.gfui-ScrollViewer-body::before,
.gfui-ScrollViewer-body::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: var(--gfui-height-fade-ScrollViewer);
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms;
  z-index: 1;
}
.gfui-ScrollViewer-body::before { top: 0; background: linear-gradient(var(--gfui-backgroundColor), transparent); }
.gfui-ScrollViewer-body::after { bottom: 0; background: linear-gradient(transparent, var(--gfui-backgroundColor)); }
.gfui-ScrollViewer-body[data-fade-top]::before,
.gfui-ScrollViewer-body[data-fade-bottom]::after { opacity: 1; }
.gfui-StickyBox,
.gfui-StickySection { position: sticky; z-index: 3; }
.gfui-StickyBox { background-color: var(--gfui-backgroundColor-StickyBox); }
.gfui-StickySection { background-color: var(--gfui-backgroundColor-StickySection); }
.gfui-StickyBox[data-to="top"],
.gfui-StickySection[data-to="top"] { top: 0; }
/* The page scrolls: under a sticky AppHeader (a ScrollViewer sets the offset back to 0). */
:where(.gfui-App[data-scroll="page"]) .gfui-StickyBox[data-to="top"],
:where(.gfui-App[data-scroll="page"]) .gfui-StickySection[data-to="top"] { top: var(--gfui-shell-top, 0px); }
.gfui-StickyBox[data-to="bottom"],
.gfui-StickySection[data-to="bottom"] { bottom: 0; }
.gfui-ResponsiveBar {
  display: flex;
  align-items: center;
  gap: var(--gfui-gap-ResponsiveBar);
  overflow: hidden;
  min-width: 0;
}
.gfui-ResponsiveBar[data-orientation="vertical"] { flex-direction: column; align-items: stretch; min-height: 0; }
.gfui-ResponsiveBar[data-reverse][data-orientation="horizontal"] { flex-direction: row-reverse; }
.gfui-ResponsiveBar[data-reverse][data-orientation="vertical"] { flex-direction: column-reverse; }
.gfui-ResponsiveBar-item,
.gfui-ResponsiveBar-overflow { flex-shrink: 0; display: flex; }
.gfui-ResponsiveBar-menuItem { display: flex; padding: var(--gfui-space-1); }
`;

/**
 * Overlays and menus (step 27, overlays.tsx): the overlay layer, ModalDialog,
 * Drawer, the menus, Tooltip, the toasts and confirm(). Mantine's own rules are
 * in @layer mantine; these (unlayered) redirect them to gfui theme variables.
 */
const OVERLAYS = `
.gfui-Overlays {
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 200;
}
.gfui-ModalDialog-overlay { background: var(--gfui-backgroundColor-overlay-ModalDialog); }
.gfui-ModalDialog-content {
  background-color: var(--gfui-backgroundColor-ModalDialog);
  color: var(--gfui-textColor-ModalDialog);
  border-radius: var(--gfui-borderRadius-ModalDialog);
  box-shadow: var(--gfui-boxShadow-ModalDialog);
  min-width: var(--gfui-minWidth-ModalDialog);
  max-width: var(--gfui-maxWidth-ModalDialog);
  font-family: var(--gfui-fontFamily);
}
.gfui-ModalDialog-content[data-full-screen] { min-width: 0; max-width: none; border-radius: 0; }
.gfui-ModalDialog-header,
.gfui-Drawer-header {
  background-color: inherit;
  color: inherit;
  min-height: 0;
  gap: var(--gfui-space-2);
}
.gfui-ModalDialog-header { padding: var(--gfui-padding-ModalDialog, var(--gfui-space-level1)); padding-bottom: 0; }
.gfui-ModalDialog-title {
  font-size: var(--gfui-fontSize-title-ModalDialog);
  font-weight: var(--gfui-fontWeight-title-ModalDialog);
  color: var(--gfui-textColor-title-ModalDialog);
  line-height: 1.3;
}
/* The content: a surface of the spacing ladder at level 1 (overlays.tsx Body). */
.gfui-ModalDialog-stack[data-surface] { padding: var(--gfui-padding-ModalDialog, var(--gfui-pad)); }
.gfui-ModalDialog-stack { --gfui-gap: var(--gfui-gap-ModalDialog, var(--gfui-step)); }
.gfui-Drawer-overlay { background: var(--gfui-backgroundColor-backdrop-Drawer); }
.gfui-Drawer-content {
  background-color: var(--gfui-backgroundColor-Drawer);
  color: var(--gfui-textColor);
  box-shadow: var(--gfui-boxShadow-Drawer);
  font-family: var(--gfui-fontFamily);
}
.gfui-Drawer-header { padding: var(--gfui-padding-Drawer, var(--gfui-space-level1)); padding-bottom: 0; }
.gfui-Drawer-stack[data-surface] { padding: var(--gfui-padding-Drawer, var(--gfui-pad)); }
.gfui-Drawer-stack { --gfui-gap: var(--gfui-gap-Drawer, var(--gfui-step)); }
.gfui-DropdownMenu {
  box-sizing: border-box;
  background-color: var(--gfui-backgroundColor-DropdownMenu);
  border: 1px solid var(--gfui-borderColor-DropdownMenu);
  border-radius: var(--gfui-borderRadius-DropdownMenu);
  box-shadow: var(--gfui-boxShadow-DropdownMenu);
  min-width: var(--gfui-minWidth-DropdownMenu);
  font-family: var(--gfui-fontFamily);
}
.gfui-DropdownMenu-trigger { display: inline-flex; }
.gfui-MenuItem {
  --menu-item-color: var(--gfui-color-MenuItem);
  --menu-item-hover: var(--gfui-backgroundColor-MenuItem--hover);
  background-color: var(--gfui-backgroundColor-MenuItem);
  font-size: var(--gfui-fontSize-MenuItem);
  padding: var(--gfui-paddingVertical-MenuItem) var(--gfui-paddingHorizontal-MenuItem);
  gap: var(--gfui-gap-MenuItem);
}
.gfui-MenuItem:where(:hover, :focus, [data-menu-active]):where(:not(:disabled, [data-disabled])) { color: var(--gfui-color-MenuItem--hover); }
.gfui-MenuItem[data-active] {
  background-color: var(--gfui-backgroundColor-MenuItem--active);
  --menu-item-color: var(--gfui-color-MenuItem--active);
}
.gfui-MenuItem:where([data-disabled], :disabled) { --menu-item-color: var(--gfui-color-MenuItem--disabled); }
.gfui-MenuItem-icon { margin: 0; }
.gfui-MenuSeparator { border-color: var(--gfui-borderColor); }
.gfui-TooltipAnchor {
  position: relative;
  display: inline-flex;
}
.gfui-Tooltip {
  background-color: var(--gfui-backgroundColor-Tooltip);
  color: var(--gfui-textColor-Tooltip);
  border-radius: var(--gfui-borderRadius-Tooltip);
  padding: var(--gfui-padding-Tooltip);
  font-size: var(--gfui-fontSize-Tooltip);
  font-family: var(--gfui-fontFamily);
  max-width: 320px;
}
.gfui-Tooltip-arrow { background-color: var(--gfui-backgroundColor-Tooltip); }
.gfui-Toast {
  --notification-color: var(--gfui-color-primary-500);
  background-color: var(--gfui-backgroundColor);
  color: var(--gfui-textColor);
  border: 1px solid var(--gfui-borderColor);
  font-family: var(--gfui-fontFamily);
}
.gfui-Toast[data-kind="success"] { --notification-color: var(--gfui-color-success-500); }
.gfui-Toast[data-kind="error"] { --notification-color: var(--gfui-color-danger-500); }
.gfui-Toast .mantine-Notification-description { color: inherit; }
.gfui-Confirm-message { white-space: pre-line; }
.gfui-Confirm-buttons {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--gfui-space-2);
}
.gfui-Confirm-cancel {
  --gfui-backgroundColor-Button: transparent;
  --gfui-backgroundColor-Button--hover: var(--gfui-color-surface-100);
  --gfui-textColor-Button: var(--gfui-textColor);
  --gfui-borderColor-Button: var(--gfui-borderColor);
}
.gfui-Confirm-buttons[data-action-color="attention"] > .gfui-Confirm-action {
  --gfui-backgroundColor-Button: var(--gfui-color-danger-600);
  --gfui-backgroundColor-Button--hover: var(--gfui-color-danger-700);
  --gfui-borderColor-Button: var(--gfui-color-danger-700);
}
.gfui-Confirm-buttons[data-action-color="secondary"] > .gfui-Confirm-action {
  --gfui-backgroundColor-Button: var(--gfui-color-secondary-500);
  --gfui-backgroundColor-Button--hover: var(--gfui-color-secondary-600);
  --gfui-borderColor-Button: var(--gfui-color-secondary-600);
}
`;

export const BASE_STYLESHEET = `
${SHELL}
${SHELL_DRAWER}
${LAYOUT}
${TEXT_OVERFLOW}
${DISPLAY}
${OVERLAYS}
${STRUCTURE}
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
  text-decoration-line: var(--gfui-textDecorationLine-Link);
  text-underline-offset: var(--gfui-textUnderlineOffset-Link);
  cursor: pointer;
}
.gfui-Link:hover { color: var(--gfui-textColor-Link--hover); }
.gfui-Link[data-active] {
  color: var(--gfui-textColor-Link--active);
  font-weight: var(--gfui-fontWeight-Link--active);
}
.gfui-Link[data-no-indicator] { color: inherit; text-decoration-line: none; }
.gfui-Link[aria-disabled] { cursor: not-allowed; opacity: 0.5; }
.gfui-Link:has(> .gfui-Link-icon) {
  display: inline-flex;
  align-items: center;
  gap: var(--gfui-gap-icon-Link);
}
.gfui-Link-icon { width: 1.1em; height: 1.1em; flex-shrink: 0; }
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
${TEXT_INPUTS.map((name) => `.gfui-${name} .mantine-Input-input {
  --input-bg: var(--gfui-backgroundColor-${name});
  --input-color: var(--gfui-textColor-${name});
  --input-bd: var(--gfui-borderColor-${name});
  --input-bd-focus: var(--gfui-borderColor-${name}--focus);
}`).join("\n")}
/* The radius is Mantine's wrapper variable (the input and its sections read it); missed until step 24's theming E2E test. */
${TEXT_INPUTS.map((name) => `.gfui-${name} .mantine-Input-wrapper { --input-radius: var(--gfui-borderRadius-${name}); }`).join("\n")}
/* Mantine expects its baseline.css (* { box-sizing: border-box }), which also styles <body>: only its input parts here. */
.gfui-App :where(.mantine-InputWrapper-root, .mantine-Input-wrapper, .mantine-Input-input) {
  box-sizing: border-box;
}
${TEXT_INPUTS.map((name) => `.gfui-${name} .mantine-Input-input:focus-within`).join(",\n")} {
  --input-bd: var(--input-bd-focus);
}
/*
 * Mantine's error state (a form's error, or validationStatus="error"). Mantine sets --input-bd for it
 * in its layered CSS, which our unlayered redirects above override, so it is set again here, after the
 * focus rule: an input in error stays red while focused (found in step 24).
 */
.gfui-App .mantine-Input-input[data-error] { --input-bd: var(--gfui-borderColor-Input--error); }
/* Step 24: the validation states without a form (validationStatus), and Mantine's error state. */
.gfui-App, .gfui-Theme { --mantine-color-error: var(--gfui-borderColor-Input--error); }
[data-validation="warning"] .mantine-Input-input,
.gfui-RadioGroup-options[data-validation="warning"] .mantine-Radio-radio,
.gfui-Slider[data-validation="warning"] :is(.mantine-Slider-track, .mantine-RangeSlider-track) { --input-bd: var(--gfui-borderColor-Input--warning); outline: 1px solid var(--gfui-borderColor-Input--warning); }
[data-validation="valid"] .mantine-Input-input,
.gfui-RadioGroup-options[data-validation="valid"] .mantine-Radio-radio,
.gfui-Slider[data-validation="valid"] :is(.mantine-Slider-track, .mantine-RangeSlider-track) { --input-bd: var(--gfui-borderColor-Input--success); outline: 1px solid var(--gfui-borderColor-Input--success); }
[data-validation="warning"].mantine-Checkbox-root .mantine-Checkbox-input,
[data-validation="warning"].mantine-Switch-root .mantine-Switch-track { border-color: var(--gfui-borderColor-Input--warning); }
[data-validation="valid"].mantine-Checkbox-root .mantine-Checkbox-input,
[data-validation="valid"].mantine-Switch-root .mantine-Switch-track { border-color: var(--gfui-borderColor-Input--success); }
.gfui-Slider[data-error] :is(.mantine-Slider-track, .mantine-RangeSlider-track) { outline: 1px solid var(--gfui-borderColor-Input--error); }
.gfui-Adornment {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  color: var(--gfui-textColor-adornment-Input);
  white-space: nowrap;
}
.gfui-Adornment-icon { width: 1.1em; height: 1.1em; }
.gfui-Switch {
  --switch-bg: var(--gfui-backgroundColor-Switch);
  --switch-thumb-bg: var(--gfui-backgroundColor-indicator-Switch);
}
.gfui-Switch .mantine-Switch-track { background-color: var(--gfui-backgroundColor-Switch); }
.gfui-Switch .mantine-Switch-input:checked + .mantine-Switch-track { background-color: var(--gfui-backgroundColor-checked-Switch); border-color: var(--gfui-backgroundColor-checked-Switch); }
.gfui-RadioGroup-options {
  display: flex;
  flex-direction: column;
  gap: var(--gfui-space-2);
  margin-block-start: var(--gfui-space-1);
}
.gfui-RadioGroup-options[data-orientation="horizontal"] { flex-direction: row; flex-wrap: wrap; gap: var(--gfui-space-4); }
.gfui-Slider { display: flex; flex-direction: column; gap: var(--gfui-space-2); min-width: 120px; }
.gfui-Slider-label { color: var(--gfui-textColor-Label); font-size: var(--gfui-fontSize-Label); }
/* Slider and RangeSlider have their own static class names. */
.gfui-Slider :is(.mantine-Slider-track, .mantine-RangeSlider-track)::before { background-color: var(--gfui-backgroundColor-track-Slider); }
.gfui-Slider :is(.mantine-Slider-bar, .mantine-RangeSlider-bar) { background-color: var(--gfui-backgroundColor-range-Slider); }
.gfui-Slider :is(.mantine-Slider-thumb, .mantine-RangeSlider-thumb) {
  background-color: var(--gfui-backgroundColor-thumb-Slider);
  border-color: var(--gfui-borderColor-thumb-Slider);
}
.gfui-ColorPicker .mantine-InputWrapper-label {
  color: var(--gfui-textColor-Label);
  font-size: var(--gfui-fontSize-Label);
  font-weight: normal;
}
.gfui-ColorPicker .mantine-ColorInput-dropdown {
  background-color: var(--gfui-backgroundColor-ColorPicker);
  border-color: var(--gfui-borderColor-ColorPicker);
}
/* Select and AutoComplete (choice.tsx, step 25): the list, its options, the pills. */
${["Select", "AutoComplete"].map((name) => `.gfui-${name}-dropdown {
  background-color: var(--gfui-backgroundColor-menu-${name});
  border-color: var(--gfui-borderColor-menu-${name});
  color: var(--gfui-textColor-${name});
}
.gfui-${name}-dropdown .gfui-Choice-option:where(:hover, [data-combobox-selected]) { background-color: var(--gfui-backgroundColor-item-${name}--hover); }
.gfui-${name} .gfui-Choice-pill {
  background-color: var(--gfui-backgroundColor-${name}-badge);
  color: var(--gfui-textColor-${name}-badge);
}`).join("\n")}
/* The date and time inputs (dates.tsx, step 26). */
.gfui-DatePicker-fields {
  display: flex;
  align-items: flex-end;
  gap: var(--gfui-space-2);
}
.gfui-DatePicker-fields > .mantine-InputWrapper-root { flex: 1 1 0; min-width: 0; }
.gfui-DatePicker-dash { padding-bottom: 0.5em; }
.gfui-DatePicker-toggle { align-self: flex-end; margin-bottom: 0.25em; }
.gfui-DatePicker-dropdown {
  background-color: var(--gfui-backgroundColor-menu-DatePicker);
  border-color: var(--gfui-borderColor-menu-DatePicker);
}
.gfui-DatePicker-inline[data-error="true"] { outline: 1px solid var(--gfui-borderColor-Input--error); }
.gfui-Dates-loading { min-height: 2.25rem; }
.gfui-Choice-option {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.gfui-Choice-option[data-combobox-disabled] { opacity: 0.5; }
.gfui-Choice-check {
  flex: 0 0 12px;
  width: 12px;
}
.gfui-Choice-optionContent { flex: 1 1 auto; min-width: 0; }
.gfui-Choice-empty {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
}
.gfui-Choice-placeholder { color: var(--mantine-color-placeholder); }
.gfui-Choice-value, .gfui-Choice-placeholder {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
/* The label behavior's text, or the own (Mantine) label of Select, AutoComplete, ColorPicker (step 25). */
.gfui-Field[data-required] > * > .gfui-Label-text::after {
  content: " *";
  color: var(--gfui-textColor-ValidationMessage-error);
}
`.trim();
