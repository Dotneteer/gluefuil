export const runtimeInfo = {
  name: "@patchfuil/runtime",
} as const;

// --- Script sandbox ---------------------------------------------------------------
export { BindingError, loadBinding, type Binding } from "./script/load";
export { BANNED_MEMBERS, SandboxError, scriptGlobals, scriptRuntime } from "./script/sandbox";
