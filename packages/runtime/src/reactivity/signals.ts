// The signal store: reactive state outside React.
//
//   signal(v)       a writable value; .get() is tracked, .peek() is not
//   computed(fn)    a derived value: lazy, cached, glitch-free
//   batch(fn)       deliver notifications once, after the outermost batch
//   watch(src, cb)  a leaf subscriber (what useSyncExternalStore needs)
//
// Push-pull: a write marks direct observers DIRTY and everything downstream
// CHECK, then notifies watchers; values are recomputed only when read, after
// checking the versions of their dependencies. A computed is linked to its
// sources only while it has observers, so an unobserved one (a render that
// never committed) leaks nothing: it revalidates by version when read.
// Design: .ai/plan/poc-04-reactivity.md; batching across `await`:
// .ai/plan/poc-07-async-handlers.md

import { reportRuntimeError, scheduleMicrotask } from "../errors";

export type Equals<T> = (a: T, b: T) => boolean;

export interface ReadonlySignal<T> {
  /** The current value; inside a computation, records a dependency. */
  get(): T;
  /** The current value without recording a dependency. */
  peek(): T;
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void;
}

export interface SignalOptions<T> {
  /** When the new value equals the old one, nothing is notified. Default: Object.is. */
  equals?: Equals<T>;
}

/**
 * Wrappers around a store node (such as variables) expose it under this key,
 * so `watch` and `observerCount` accept them like signals.
 */
export const SIGNAL_NODE: unique symbol = Symbol("gfui.signalNode");

function nodeOf(source: ReadonlySignal<unknown>): Source {
  const wrapped = (source as { [SIGNAL_NODE]?: ReadonlySignal<unknown> })[SIGNAL_NODE];
  return (wrapped ?? source) as unknown as Source;
}

/** Thrown when a computation (a binding) writes state. */
export class ReactivityError extends Error {
  override name = "ReactivityError";
}

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;
type State = typeof CLEAN | typeof CHECK | typeof DIRTY;

interface Observer {
  mark(state: typeof CHECK | typeof DIRTY): void;
}

abstract class Source {
  version = 0;
  readonly observers = new Set<Observer>();
  addObserver(observer: Observer): void {
    this.observers.add(observer);
  }
  removeObserver(observer: Observer): void {
    this.observers.delete(observer);
  }
  /** Brings the value up to date (computeds only). */
  refresh(): void {}
}

/** The computation currently collecting dependencies. */
let tracking: ComputedNode<unknown> | undefined;
let batchDepth = 0;
const pending = new Set<WatcherNode>();

function track(source: Source): void {
  tracking?.addDependency(source);
}

class SignalNode<T> extends Source implements Signal<T> {
  constructor(
    private value: T,
    private readonly equals: Equals<T>,
  ) {
    super();
  }

  get(): T {
    track(this);
    return this.value;
  }

  peek(): T {
    return this.value;
  }

  set(value: T): void {
    if (tracking) throw new ReactivityError("A binding or computed value cannot change state");
    if (this.equals(this.value, value)) return;
    this.value = value;
    this.version++;
    batch(() => {
      for (const observer of [...this.observers]) observer.mark(DIRTY);
    });
  }
}

class ComputedNode<T> extends Source implements Observer, ReadonlySignal<T> {
  private state: State = DIRTY;
  private computedOnce = false;
  private value: T | undefined;
  private error: unknown;
  private hasError = false;
  /** Each dependency with the version seen when it was read. */
  private dependencies = new Map<Source, number>();

  constructor(
    private readonly fn: () => T,
    private readonly equals: Equals<T>,
  ) {
    super();
  }

  get(): T {
    this.refresh();
    track(this);
    if (this.hasError) throw this.error;
    return this.value as T;
  }

  peek(): T {
    this.refresh();
    if (this.hasError) throw this.error;
    return this.value as T;
  }

  private get linked(): boolean {
    return this.observers.size > 0;
  }

  mark(state: typeof CHECK | typeof DIRTY): void {
    const wasClean = this.state === CLEAN;
    if (state > this.state) this.state = state;
    if (wasClean) for (const observer of [...this.observers]) observer.mark(CHECK);
  }

  override refresh(): void {
    if (this.linked) {
      if (this.state === CLEAN) return;
      if (this.state === CHECK && !this.dependenciesChanged()) {
        this.state = CLEAN;
        return;
      }
    } else if (this.computedOnce && !this.dependenciesChanged()) {
      // Unobserved: nobody marks it, so it validates by version on every read.
      return;
    }
    this.recompute();
  }

  private dependenciesChanged(): boolean {
    for (const [source, seen] of this.dependencies) {
      source.refresh();
      if (source.version !== seen) return true;
    }
    return false;
  }

  addDependency(source: Source): void {
    if (!this.dependencies.has(source)) this.dependencies.set(source, source.version);
  }

  private computing = false;

  private recompute(): void {
    if (this.computing) throw new ReactivityError("Cycle: a computed value depends on itself");
    this.computing = true;
    const previous = this.dependencies;
    this.dependencies = new Map();
    const outer = tracking;
    tracking = this as ComputedNode<unknown>;
    try {
      const value = this.fn();
      if (!this.computedOnce || this.hasError || !this.equals(this.value as T, value)) {
        this.value = value;
        this.version++;
      }
      this.hasError = false;
    } catch (error) {
      this.error = error;
      this.hasError = true;
      this.version++;
    } finally {
      tracking = outer;
      this.computing = false;
      this.computedOnce = true;
      this.state = CLEAN;
    }
    if (this.linked) {
      for (const source of previous.keys()) if (!this.dependencies.has(source)) source.removeObserver(this);
      for (const source of this.dependencies.keys()) if (!previous.has(source)) source.addObserver(this);
    }
  }

  override addObserver(observer: Observer): void {
    const wasLinked = this.linked;
    super.addObserver(observer);
    if (wasLinked) return;
    for (const source of this.dependencies.keys()) source.addObserver(this);
    // Nobody marked it while it was unlinked: revalidate now, so it starts
    // CLEAN. (Only a CLEAN node forwards marks to its observers.)
    if (this.computedOnce) {
      this.state = CHECK;
      this.refresh();
    }
  }

  override removeObserver(observer: Observer): void {
    super.removeObserver(observer);
    if (!this.linked) for (const source of this.dependencies.keys()) source.removeObserver(this);
  }
}

class WatcherNode implements Observer {
  constructor(readonly callback: () => void) {}
  mark(): void {
    pending.add(this);
  }
}

export function signal<T>(value: T, options: SignalOptions<T> = {}): Signal<T> {
  return new SignalNode(value, options.equals ?? Object.is);
}

export function computed<T>(fn: () => T, options: SignalOptions<T> = {}): ReadonlySignal<T> {
  return new ComputedNode(fn, options.equals ?? Object.is);
}

/** Runs `fn`; watchers are notified once, after the outermost batch ends. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

let batchGeneration = 0;

/**
 * Opens a batch that `endBatch()` closes: for code that cannot wrap its work
 * in one function call (a handler segment, opened when the handler resumes
 * after an `await` and closed before its next `await`).
 *
 * Such a batch must close within the synchronous run that opened it. If one
 * is still open when the microtask queue runs, it was leaked (a bug): the
 * store force-closes it, delivers the notifications and reports a
 * ReactivityError, so the UI can never stay frozen.
 */
export function startBatch(): void {
  if (batchDepth++ > 0) return;
  const generation = ++batchGeneration;
  scheduleMicrotask(() => {
    if (batchDepth > 0 && batchGeneration === generation) {
      batchDepth = 0;
      reportRuntimeError(new ReactivityError("A batch was left open past the end of a synchronous run; it was closed"));
      flush();
    }
  });
}

/** Closes a batch opened by `startBatch()`. An unbalanced call is ignored. */
export function endBatch(): void {
  if (batchDepth === 0) return;
  batchDepth--;
  if (batchDepth === 0) flush();
}

/** True while a batch is open (for tests and diagnostics). */
export function isBatching(): boolean {
  return batchDepth > 0;
}

/** Watchers notifying each other this many rounds in a row are a runaway cycle. */
const MAX_FLUSH_ROUNDS = 100;
let flushing = false;

/**
 * Delivers pending notifications. Every watcher is called even if another
 * throws (errors are reported afterwards). A watcher may write again: the
 * loop continues until nothing is pending, or stops a runaway cycle.
 */
function flush(): void {
  if (flushing) return; // a write inside a watcher: the running loop picks it up
  flushing = true;
  const errors: unknown[] = [];
  try {
    for (let round = 0; pending.size > 0; round++) {
      if (round === MAX_FLUSH_ROUNDS) {
        pending.clear();
        errors.push(new ReactivityError(`Watchers kept changing state for ${MAX_FLUSH_ROUNDS} rounds; stopped`));
        break;
      }
      const watchers = [...pending];
      pending.clear();
      for (const watcher of watchers) {
        try {
          watcher.callback();
        } catch (error) {
          errors.push(error);
        }
      }
    }
  } finally {
    flushing = false;
  }
  for (const error of errors) reportRuntimeError(error);
}

/**
 * Calls `callback` (without arguments) after `source` may have changed. The
 * callback should read the source to see the new value; it may be called
 * when an intermediate value changed but the source's value did not.
 * Returns the function that stops watching.
 */
export function watch(source: ReadonlySignal<unknown>, callback: () => void): () => void {
  const node = nodeOf(source);
  const watcher = new WatcherNode(callback);
  node.addObserver(watcher);
  // Evaluate now, so a computed knows (and links) its dependencies. An error is
  // kept by the computed and rethrown to whoever reads it.
  try {
    source.peek();
  } catch {
    // reported on read
  }
  return () => {
    node.removeObserver(watcher);
    pending.delete(watcher);
  };
}

/** Runs `fn` without recording dependencies. */
export function untracked<T>(fn: () => T): T {
  const outer = tracking;
  tracking = undefined;
  try {
    return fn();
  } finally {
    tracking = outer;
  }
}

/** The number of observers of a signal or computed (for tests and diagnostics). */
export function observerCount(source: ReadonlySignal<unknown>): number {
  return nodeOf(source).observers.size;
}
