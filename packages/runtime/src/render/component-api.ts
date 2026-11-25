// Component IDs: `id="textBox"` exposes the component's API to the file
// (`textBox.value`, `textBox.setValue('x')`). Design: .ai/plan/poc-08-scoping-ids.md
//
// IDs are file-scoped (as in XMLUI, where implicit containers forward API
// registration to the file's container): the file component creates one
// scope entry per ID, a getter over a signal holding the API (undefined until
// the component mounts). Components opt in explicitly with useComponentApi;
// React's `ref` is not used, because it may be forwarded to a DOM element,
// and raw platform objects must never reach script (step 3 invariant).

import { useEffect, useState } from "react";
import { signal, type Signal } from "../reactivity/signals";

/** The ID signals of a file scope; inherited by every nested scope through the prototype chain. */
export const API_REFS: unique symbol = Symbol("gfui.apiRefs");

/** What `Bound` passes to a component with an `id`: call with the API, or undefined to unregister. */
export type RegisterApi = (api: object | undefined) => void;

/** Builds a file scope: one read-only, tracked entry per ID, inheriting from `parent`. */
export function createFileScope(parent: object, ids: readonly string[]): object {
  const scope = Object.create(parent) as Record<string | symbol, unknown>;
  const refs = new Map<string, Signal<object | undefined>>();
  for (const id of ids) {
    const api = signal<object | undefined>(undefined);
    refs.set(id, api);
    Object.defineProperty(scope, id, { get: () => api.get(), enumerable: true });
  }
  Object.defineProperty(scope, API_REFS, { value: refs });
  return Object.freeze(scope);
}

/** The file scope of one instance of a compiled file component. */
export function useFileScope(parent: object, ids: readonly string[]): object {
  const [scope] = useState(() => createFileScope(parent, ids));
  return scope;
}

/** The registrar for `id` in `scope` (Bound uses it). */
export function apiRegistrar(scope: object, id: string): RegisterApi {
  const refs = (scope as { [API_REFS]?: Map<string, Signal<object | undefined>> })[API_REFS];
  const ref = refs?.get(id);
  if (!ref) throw new Error(`No component ID '${id}' in this scope`);
  return (api) => ref.set(api);
}

/**
 * Publishes a component's API while it is mounted. `api` should be stable
 * (useMemo): its values are getters over the component's signals. It is
 * frozen, so script cannot replace its methods.
 */
export function useComponentApi(registerApi: RegisterApi | undefined, api: object): void {
  useEffect(() => {
    if (!registerApi) return undefined;
    registerApi(Object.isFrozen(api) ? api : Object.freeze(api));
    return () => registerApi(undefined);
  }, [registerApi, api]);
}
