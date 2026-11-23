// --- Script sandbox ---------------------------------------------------------------
export { assertBindingValue, BindingError, loadBinding, type Binding } from "./script/load";
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

// --- Rendering compiled modules ---------------------------------------------------------
export { Bound, TextNode, type BindingFunction, type BoundProps } from "./render/elements";
export { loadModule, type ModuleImports } from "./render/module";
// Compiled code creates elements through the runtime, never through React directly.
export { createElement, Fragment } from "react";
