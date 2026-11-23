export const runtimeInfo = {
  name: "@patchfuil/runtime",
} as const;

// --- Script sandbox ---------------------------------------------------------------
export { BindingError, loadBinding, type Binding } from "./script/load";
export { BANNED_MEMBERS, SandboxError, scriptGlobals, scriptRuntime } from "./script/sandbox";

// --- Reactivity ---------------------------------------------------------------------
export {
  batch,
  computed,
  observerCount,
  ReactivityError,
  signal,
  untracked,
  watch,
  type Equals,
  type ReadonlySignal,
  type Signal,
  type SignalOptions,
} from "./reactivity/signals";
export { shallowEqual, useComputed, useSignal } from "./reactivity/react";
export { createScope, type ScopeEntry } from "./reactivity/scope";
