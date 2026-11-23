// The built-ins' stylesheet (step 17): every visual value is a theme variable
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
.pfui-Text {
  color: var(--pfui-textColor-Text);
  font-size: var(--pfui-fontSize-Text);
}
.pfui-Button {
  background-color: var(--pfui-backgroundColor-Button);
  color: var(--pfui-textColor-Button);
  border: 1px solid var(--pfui-borderColor-Button);
  border-radius: var(--pfui-borderRadius-Button);
  padding: var(--pfui-padding-Button);
  font: inherit;
  cursor: pointer;
}
.pfui-Button:hover {
  background-color: var(--pfui-backgroundColor-Button--hover);
}
.pfui-TextBox {
  background-color: var(--pfui-backgroundColor-TextBox);
  color: var(--pfui-textColor-TextBox);
  border: 1px solid var(--pfui-borderColor-TextBox);
  border-radius: var(--pfui-borderRadius-TextBox);
  padding: var(--pfui-padding-TextBox);
  font: inherit;
}
.pfui-TextBox:focus {
  outline: none;
  border-color: var(--pfui-borderColor-TextBox--focus);
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
