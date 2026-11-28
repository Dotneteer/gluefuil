// Reactive variables (`var.x`, `<variable>`, `global.x`): a variable follows its
// initializer like a spreadsheet cell until it is assigned; from then on it
// holds the assigned value (XMLUI markup.md, "When does a variable stop
// following its initial value?").
//
// Values are deep-frozen (plain objects and arrays), as XMLUI's state is (Immer
// auto-freeze). Changes go through assignment or the path helpers, which copy
// along the path; mutating a value in place through an alias throws instead of
// silently skipping the re-render. Design: .ai/plan/poc-06-variables-handlers.md

import { tracing } from "../trace/core";
import { traceState } from "../trace/emitters";
import type { SourceLocation } from "../trace/location";
import { batch, computed, markWrite, signal, SIGNAL_NODE, type ReadonlySignal } from "./signals";

/** Step 35: what the trace says about a variable. */
export interface VariableInfo {
  name: string;
  at?: SourceLocation;
}

export interface Variable<T> extends ReadonlySignal<T> {
  /** Assigns a value: the variable stops following its initializer. */
  set(value: T): void;
  /** True once the variable has been assigned. */
  readonly assigned: boolean;
}

function isPlain(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Freezes plain objects and arrays, recursively. A frozen value is assumed to
 * be frozen all the way down (as Immer does), so unchanged parts of a
 * structurally shared value are not visited again.
 */
export function freezeDeep<T>(value: T): T {
  if (!isPlain(value) || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) freezeDeep((value as Record<string, unknown>)[key]);
  return value;
}

class VariableNode<T> implements Variable<T> {
  private readonly assignedSignal = signal(false);
  private readonly valueSignal = signal<T | undefined>(undefined);
  private readonly current: ReadonlySignal<T>;

  constructor(
    init: () => T,
    private readonly info?: VariableInfo,
  ) {
    const follow = computed(() => freezeDeep(init()));
    this.current = computed(() => (this.assignedSignal.get() ? (this.valueSignal.get() as T) : follow.get()));
  }

  get [SIGNAL_NODE](): ReadonlySignal<T> {
    return this.current;
  }

  get(): T {
    return this.current.get();
  }

  peek(): T {
    return this.current.peek();
  }

  get assigned(): boolean {
    return this.assignedSignal.peek();
  }

  set(value: T): void {
    if (tracing && this.info) {
      // Step 35: the state entry, and the write mark later evaluations name as their cause.
      const before = this.current.peek();
      const frozen = freezeDeep(value);
      const cause = traceState(this.info.name, this.info.at, before, frozen);
      markWrite(this.valueSignal, cause);
    }
    batch(() => {
      this.valueSignal.set(freezeDeep(value));
      this.assignedSignal.set(true);
    });
  }
}

/** A variable that follows `init` (evaluated lazily, tracked) until it is set. */
export function variable<T>(init: () => T, info?: VariableInfo): Variable<T> {
  return new VariableNode(init, info);
}
