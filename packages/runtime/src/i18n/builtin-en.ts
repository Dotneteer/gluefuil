// The framework's own strings (step 34, decision D1): `gfui.*` keys, English.
// An app's bundle overrides any of them for any locale; a prop that sets the
// text (saveLabel, …) still wins. ICU MessageFormat, as every bundle.
export const BUILT_IN_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  // Form (forms.tsx)
  "gfui.form.save": "Save",
  "gfui.form.saving": "Saving...",
  "gfui.form.cancel": "Cancel",
  "gfui.form.warningsTitle": "Are you sure want to move forward?",
  "gfui.form.warningsMessage": "The following warnings were found during validation. Please make sure you are willing to move forward despite these issues.",
  "gfui.form.warningsProceed": "Yes, proceed",
  "gfui.form.warningsCancel": "No",
  // Validation (runtime forms/rules.ts)
  "gfui.validation.required": "This field is required",
  "gfui.validation.minLength": "Input should be at least {min, plural, one {# character} other {# characters}}",
  "gfui.validation.maxLength": "Input should be up to {max, plural, one {# character} other {# characters}}",
  "gfui.validation.lengthBetween": "Input length should be between {min} and {max}",
  "gfui.validation.minValue": "Input should be at least {min}",
  "gfui.validation.maxValue": "Input should be at most {max}",
  "gfui.validation.valueBetween": "Input should be between {min} and {max}",
  "gfui.validation.email": "Not a valid email address",
  "gfui.validation.url": "Not a valid URL",
  "gfui.validation.phone": "Not a valid phone number",
  "gfui.validation.invalid": "Invalid input",
  // Dialogs and overlays (overlays.tsx)
  "gfui.dialog.close": "Close",
  "gfui.dialog.cancel": "Cancel",
  "gfui.dialog.unsavedTitle": "Unsaved changes",
  "gfui.dialog.unsavedMessage": "You have unsaved changes. Are you sure you want to close this dialog?",
  "gfui.menu.more": "More options",
  // Files (files.tsx)
  "gfui.files.browse": "Browse",
  "gfui.files.drop": "Drop files here",
  // Errors (errors.tsx, step 33)
  "gfui.error.title": "Something went wrong",
  "gfui.error.render": "An error occurred while rendering this part of the page.",
  "gfui.error.retry": "Try again",
  // Accessible names
  "gfui.aria.selectRow": "Select row",
  "gfui.aria.selectAllRows": "Select all rows",
  "gfui.aria.pagination": "Pagination",
  "gfui.aria.clear": "Clear",
  "gfui.aria.showPassword": "Show the password",
  "gfui.aria.headingLink": "Link to this heading",
  "gfui.aria.loading": "Loading",
  "gfui.aria.resize": "Resize",
  "gfui.aria.toggleColorMode": "Toggle color mode",
  "gfui.aria.darkMode": "Dark mode",
  "gfui.aria.tableOfContents": "Table of Contents",
  "gfui.aria.treeNavigation": "Tree navigation",
  "gfui.aria.tileGrid": "Tile grid",
  "gfui.aria.main": "Main",
  "gfui.aria.details": "Details",
  "gfui.aria.qrCode": "QR code",
  "gfui.aria.qrTooLong": "The value is too long for a QR code",
});
