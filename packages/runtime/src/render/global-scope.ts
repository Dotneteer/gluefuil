// The app's globals (step 21B, .ai/plan/poc-21b-globals.md): the app root's
// global container provides its scope (only the globals, over the file's app
// scope); every user component below takes it as the parent of its own scope,
// so `global.*` and `Globals.xs` names reach every file through the prototype
// chain, and a component's own names shadow them.

import { createContext, createElement, useContext, type ReactNode } from "react";

const GlobalScopeContext = createContext<object | undefined>(undefined);

/** Provides the app's global scope to the user components below. Rendered by compiled app roots. */
export function GlobalScope({ scope, children }: { scope: object; children?: ReactNode }) {
  return createElement(GlobalScopeContext.Provider, { value: scope }, children);
}

/** The global scope of the enclosing app, if it declares globals. */
export function useGlobalScope(): object | undefined {
  return useContext(GlobalScopeContext);
}
