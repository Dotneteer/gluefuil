// --- Script sandbox ---------------------------------------------------------------
export { assertBindingValue, BindingError, loadBinding, type Binding } from "./script/load";
export { BANNED_MEMBERS, SandboxError, scriptGlobals, scriptRuntime } from "./script/sandbox";

// --- Reactivity ---------------------------------------------------------------------
export {
  batch,
  computed,
  endBatch,
  isBatching,
  startBatch,
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
export { freezeDeep, variable, type Variable } from "./reactivity/variable";

// --- Rendering compiled modules ---------------------------------------------------------
export {
  Bound,
  TextNode,
  useScope,
  type BindingFunction,
  type BoundProps,
  type HandlerFactory,
  type VariableDefinition,
} from "./render/elements";
export { ARRAY_MUTATORS, type PathKey } from "./script/paths";
export { ASYNC_ARRAY_METHODS } from "./script/async-array";
export {
  currentInvocation,
  delay,
  HANDLER_POLICIES,
  HandlerCancelledError,
  HandlerSlot,
  Invocation,
  setDefaultHandlerTimeout,
  type CancelReason,
  type CancellationToken,
  type HandlerFunction,
  type HandlerPolicy,
} from "./render/handlers";
export { APP_GLOBAL_NAMES, createAppScope } from "./render/app-globals";
export {
  API_REFS,
  apiRegistrar,
  createFileScope,
  useComponentApi,
  useFileScope,
  type RegisterApi,
} from "./render/component-api";
export { reportRuntimeError, setErrorReporter, type ErrorReporter } from "./errors";
export { loadModule, type ModuleImports } from "./render/module";
// Compiled code creates elements through the runtime, never through React directly.
export { createElement, Fragment } from "react";
