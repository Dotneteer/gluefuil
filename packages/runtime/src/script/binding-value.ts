// The check every binding's value passes: bindings are synchronous.

/** Thrown when a binding produces a value bindings may not have. */
export class BindingError extends Error {
  override name = "BindingError";
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** Bindings are synchronous: a promise (any thenable) as a binding's value throws. */
export function assertBindingValue<T>(value: T): T {
  if (isThenable(value)) {
    throw new BindingError("A binding cannot produce a promise; call async functions from an event handler");
  }
  return value;
}
