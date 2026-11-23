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
`.trim();
