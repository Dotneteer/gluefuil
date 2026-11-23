// The built-ins' stylesheet (steps 16-17): every visual value is a theme variable
// (`--pfui-*`, compiled by the theme engine; defaults in the metadata's
// `themeVars`). App renders it once as a React 19 hoisted <style>, which a
// server render emits ahead of the app's HTML.

export const BASE_STYLESHEET_HREF = "pfui-base";

export const BASE_STYLESHEET = `
.pfui-App {
  background-color: var(--pfui-backgroundColor-App);
  color: var(--pfui-textColor-App);
  font-family: var(--pfui-fontFamily-App);
  font-size: var(--pfui-fontSize-App);
  line-height: var(--pfui-lineHeight);
  min-height: 100%;
}
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
