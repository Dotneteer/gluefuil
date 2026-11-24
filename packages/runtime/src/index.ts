// --- Script sandbox ---------------------------------------------------------------
export { assertBindingValue, BindingError } from "./script/binding-value";
export { loadBinding, type Binding } from "./script/load";
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
  HandlerTimeoutError,
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
export {
  BREAKPOINT_NAMES,
  BREAKPOINTS,
  breakpoint,
  breakpointFromName,
  breakpointIndex,
  currentBreakpoint,
  resolveVisibility,
  setServerBreakpoint,
  When,
  type BreakpointName,
  type Condition,
  type WhenProps,
} from "./render/visibility";
export { TemplateInstance, templateRenderer, type TemplateFunction, type TemplateRenderer } from "./render/templates";
export { loadModule, type ModuleImports, type ModuleSourceMap } from "./render/module";
export {
  activeThemeId,
  activeThemeTone,
  resetThemeState,
  setTheme,
  setThemeDefaults,
  setThemeTone,
  toggleThemeTone,
} from "./render/theme-state";
export { navDrawerOpen, navPanelCollapsed, resetShellState, setNavDrawerOpen, setNavPanelCollapsed } from "./render/shell-state";
export {
  coerceLiteral,
  wrapComponent,
  type WrapConfig,
  type WrapEvent,
  type WrapMetadata,
  type WrapTemplate,
  type WrapValue,
} from "./render/wrap";
export {
  currentLocation,
  currentRouteParams,
  findRoute,
  getBasename,
  hrefFor,
  matchRoute,
  navigate,
  normalizeBasename,
  parseLocation,
  redirect,
  registeredRoutes,
  registerRoutes,
  resetRouter,
  routePath,
  routingMode,
  setBasename,
  setNavigationHandlers,
  setRoutingMode,
  setServerPath,
  type NavigateOptions,
  type NavigationHandlers,
  type RouteLocation,
  type RoutingMode,
} from "./render/router";
export { GlobalScope, useGlobalScope } from "./render/global-scope";
export { createContextScope, provideContext, useContextScope } from "./render/context-scope";
export { DEFAULT_FIELD_OPTIONS, FormField, FormStore, type FieldOptions, type ValidationSummary } from "./forms/store";
export { customResults, highestSeverity, isEmptyValue, parseRegex, PATTERNS, validateRules, type FieldRules, type RuleResult, type Severity } from "./forms/rules";
export { INITIAL_FLAGS, isShown, type InteractionFlags, type ValidationMode } from "./forms/display";
export { deleteAt, getAt, parseFieldPath, setAt, type FieldKey } from "./forms/paths";
export { FieldBindingProvider, FormProvider, useFieldBinding, useFormStore, type FieldBinding } from "./forms/react";
export { BASE_ATTRIBUTE, mountApp, PATH_ATTRIBUTE, PRERENDERED_ATTRIBUTE, READY_ATTRIBUTE, type MountOptions } from "./render/mount";
export {
  BoundUser,
  DEFAULT_SLOT,
  Slot,
  SLOTS,
  useComponent,
  type ComponentInput,
  type SlotProps,
} from "./render/user-components";
export { inServerView, isServerView } from "./reactivity/server-view";
// Data (step 20): the HTTP gate, the retry policy, the query engine, DataSource's and APICall's cores.
export {
  categoryOfStatus,
  dataError,
  isDataError,
  type DataError,
  type DataErrorCategory,
} from "./data/errors";
export { buildUrl, parseRetryAfter, RequestCancelledError, sendRequest, type HttpResult, type RequestSpec } from "./data/http";
export { MAX_BACKOFF_MS, MAX_RETRY_AFTER_MS, retryDelay, runWithRetry, shouldRetry, type RetryOptions } from "./data/retry";
export { invalidate, pathMatches, queryClient, queryKey, resetDataState, setDataDefaults, type DataDefaults } from "./data/client";
export { Loader, type LoaderEvents, type LoaderOptions, type LoaderState } from "./data/loader";
export { ApiCaller, type ApiCallEvents, type ApiCallOptions, type ApiCallState } from "./data/api-call";
export { deferredValue, isDeferred, resolveDeferred, type DeferredValue } from "./render/deferred";
// Compiled code creates elements through the runtime, never through React directly.
export { createElement, Fragment } from "react";
