// Non-visual components (step 32; design: .ai/plan/poc-32-remaining.md):
// ChangeListener, Timer, Queue and MessageListener, after XMLUI's
// (ChangeListenerReact.tsx, TimerReact.tsx, QueueReact.tsx,
// MessageListenerReact.tsx). They render nothing of their own (MessageListener
// its children). Script gets plain values only: a message is a frozen
// `{ data, origin }`, never the MessageEvent (whose `source` is a window).
import { contentToast, freezeDeep, removeToast, reportRuntimeError, signal, toast, useComponentApi, useSignal, type RegisterApi, type Signal, type TemplateRenderer } from "@gluefuil/runtime";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const isFalse = (value: unknown) => value === false || value === "false";
const isTrue = (value: unknown) => value === true || value === "true";

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Structural equality of script values (XMLUI uses lodash's isEqual). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((value, i) => deepEqual(value, other[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((key) => Object.hasOwn(b, key) && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

// --- ChangeListener ---------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What changed between two `listenToSources` values (XMLUI ChangeListenerReact.tsx createSourcesChange). */
export function sourcesChange(prevValue: unknown, newValue: unknown) {
  let keys: (string | number)[];
  if (Array.isArray(prevValue) || Array.isArray(newValue)) {
    const length = Math.max(Array.isArray(prevValue) ? prevValue.length : 0, Array.isArray(newValue) ? newValue.length : 0);
    keys = Array.from({ length }, (_, i) => i);
  } else if (isRecord(prevValue) || isRecord(newValue)) {
    keys = [...new Set([...Object.keys(isRecord(prevValue) ? prevValue : {}), ...Object.keys(isRecord(newValue) ? newValue : {})])];
  } else keys = ["value"];
  const at = (value: unknown, key: string | number) => (Array.isArray(value) || isRecord(value) ? (value as Record<string | number, unknown>)[key] : value);
  const changedSources: (string | number)[] = [];
  const changes: Record<string, { prevValue: unknown; newValue: unknown }> = {};
  for (const key of keys) {
    const before = at(prevValue, key);
    const after = at(newValue, key);
    if (deepEqual(before, after)) continue;
    changedSources.push(key);
    changes[String(key)] = { prevValue: before, newValue: after };
  }
  return { prevValue, newValue, changedSources, changes };
}

/** Debounces or throttles (leading and trailing, as lodash) `fn`; `cancel` drops a pending call. */
export function rateLimited<A>(fn: (arg: A) => void, debounceMs: number, throttleMs: number): { call: (arg: A) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (debounceMs > 0) {
    return {
      call: (arg) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(arg), debounceMs);
      },
      cancel: () => clearTimeout(timer),
    };
  }
  if (throttleMs > 0) {
    let last = -Infinity;
    let pending: { arg: A } | undefined;
    const run = (arg: A) => {
      last = Date.now();
      fn(arg);
    };
    return {
      call: (arg) => {
        const wait = last + throttleMs - Date.now();
        if (wait <= 0 && timer === undefined) return run(arg);
        pending = { arg };
        if (timer === undefined) {
          timer = setTimeout(() => {
            timer = undefined;
            if (pending) run(pending.arg);
            pending = undefined;
          }, Math.max(0, wait));
        }
      },
      cancel: () => {
        clearTimeout(timer);
        timer = undefined;
        pending = undefined;
      },
    };
  }
  return { call: fn, cancel: () => {} };
}

type ChangeListenerProps = {
  listenTo?: unknown;
  listenToSources?: unknown;
  throttleWaitInMs?: unknown;
  debounceWaitInMs?: unknown;
  onDidChange?: (change: unknown) => unknown;
};

/**
 * `ChangeListener`: `didChange({ prevValue, newValue })` when `listenTo`
 * changes (structurally); with `listenToSources` (named values) also
 * `changedSources` and `changes`. The first value fires nothing. A debounce
 * waits for a quiet period; a throttle fires at most once per period.
 */
export function ChangeListener(props: ChangeListenerProps) {
  const sources = props.listenToSources !== undefined;
  const value = sources ? props.listenToSources : props.listenTo;
  const handler = useRef(props.onDidChange);
  handler.current = props.onDidChange;
  const debounce = Math.max(0, toNumber(props.debounceWaitInMs, 0));
  const throttle = Math.max(0, toNumber(props.throttleWaitInMs, 0));
  const limited = useMemo(
    () =>
      rateLimited<unknown>((change) => {
        if (typeof handler.current === "function") void handler.current(change);
      }, debounce, throttle),
    [debounce, throttle],
  );
  useEffect(() => () => limited.cancel(), [limited]);
  const previous = useRef<{ value: unknown } | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = { value };
    if (!before || deepEqual(before.value, value)) return;
    limited.call(Object.freeze(sources ? sourcesChange(before.value, value) : { prevValue: before.value, newValue: value }));
  }, [value, sources, limited]);
  return null;
}

// --- Timer --------------------------------------------------------------------------

type TimerProps = {
  enabled?: unknown;
  interval?: unknown;
  initialDelay?: unknown;
  once?: unknown;
  onTick?: () => Promise<unknown>;
  registerApi?: RegisterApi;
};

/**
 * `Timer`: `tick` every `interval` ms while `enabled` and not paused, after
 * `initialDelay` the first time; a tick is skipped while the previous one's
 * handler still runs; `once` stops after the first.
 */
export function Timer({ enabled, interval, initialDelay, once, onTick, registerApi }: TimerProps) {
  const on = !isFalse(enabled);
  const every = toNumber(interval, 1000);
  const delayMs = Math.max(0, toNumber(initialDelay, 0));
  const single = isTrue(once);
  const [state] = useState(() => signal({ paused: false, running: false }));
  const [fired, setFired] = useState(false);
  const started = useRef(false);
  const busy = useRef(false);
  const tickHandler = useRef(onTick);
  tickHandler.current = onTick;
  const paused = useSignal(state).paused;
  // Enabling a `once` timer again lets it fire again; disabling ends a pause (XMLUI).
  useEffect(() => {
    if (on && single) setFired(false);
    if (!on) state.set({ ...state.get(), paused: false });
  }, [on, single, state]);
  useEffect(() => {
    if (!on || paused || every <= 0 || (single && fired)) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let repeat: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const tick = async () => {
      if (busy.current || cancelled) return;
      busy.current = true;
      try {
        await tickHandler.current?.();
      } catch (error) {
        reportRuntimeError(error);
      } finally {
        busy.current = false;
        started.current = true;
        if (single && !cancelled) setFired(true);
      }
    };
    const start = () => {
      if (single) timer = setTimeout(tick, every);
      else repeat = setInterval(tick, every);
    };
    if (delayMs > 0 && !started.current) {
      timer = setTimeout(() => {
        started.current = true;
        start();
      }, delayMs);
    } else start();
    state.set({ ...state.get(), running: true });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(repeat);
      state.set({ ...state.get(), running: false });
    };
  }, [on, paused, every, delayMs, single, fired, state]);
  const api = useMemo(
    () => ({
      pause: () => {
        if (on && !state.get().paused) state.set({ ...state.get(), paused: true });
      },
      resume: () => {
        if (state.get().paused) state.set({ ...state.get(), paused: false });
      },
      isPaused: () => state.get().paused,
      isRunning: () => state.get().running && !state.get().paused,
    }),
    [on, state],
  );
  useComponentApi(registerApi, api);
  return null;
}

// --- Queue --------------------------------------------------------------------------

export type QueueItemStatus = "pending" | "started" | "in-progress" | "completed" | "error";

export interface QueueEntry {
  readonly actionItemId: string;
  readonly batchId: string;
  readonly status: QueueItemStatus;
  readonly item: unknown;
  readonly progress?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

type Handler = (...args: unknown[]) => Promise<unknown>;

type QueueProps = {
  clearAfterFinish?: unknown;
  progressFeedback?: TemplateRenderer;
  resultFeedback?: TemplateRenderer;
  onWillProcess?: Handler;
  onProcess?: Handler;
  onDidProcess?: Handler;
  onProcessError?: Handler;
  onComplete?: Handler;
  registerApi?: RegisterApi;
};

let queueIds = 0;
const nextId = () => `q${++queueIds}-${Date.now().toString(36)}`;

/** An error as script sees it: a thrown string or number becomes an Error with that message (XMLUI: error.message). */
const asError = (error: unknown) => (typeof error === "object" && error !== null ? error : new Error(String(error)));

/** The feedback toast's content: the template with the queue's current items (progress) or fixed ones (result). */
function QueueFeedback({ template, entries }: { template: TemplateRenderer; entries: () => readonly QueueEntry[] }): ReactNode {
  const list = entries();
  return template({ $completedItems: list.filter((e) => e.status === "completed"), $queuedItems: list });
}

function LiveFeedback({ template, store }: { template: TemplateRenderer; store: Signal<readonly QueueEntry[]> }) {
  const list = useSignal(store);
  return <QueueFeedback template={template} entries={() => list} />;
}

/**
 * `Queue`: items processed one at a time, first in first out. For each,
 * `willProcess` (false skips it), `process` (its result is kept), then
 * `didProcess`, or `processError(error, …)` (false: the error is not shown);
 * `complete` when the queue empties. `progressFeedback` and `resultFeedback`
 * are toasts with `$completedItems` and `$queuedItems`.
 */
export function Queue(props: QueueProps) {
  const [store] = useState(() => signal<readonly QueueEntry[]>([]));
  const latest = useRef(props);
  latest.current = props;
  const running = useRef(false);
  const mounted = useRef(true);
  const toastId = useRef<string | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const api = useMemo(() => {
    const update = (id: string, patch: Partial<QueueEntry>) =>
      store.set(store.get().map((e) => (e.actionItemId === id ? Object.freeze({ ...e, ...patch }) : e)));
    const remove = (id: unknown) => store.set(store.get().filter((e) => e.actionItemId !== id));
    const call = async (name: "onWillProcess" | "onProcess" | "onDidProcess" | "onProcessError" | "onComplete", ...args: unknown[]) => {
      const handler = latest.current[name];
      return typeof handler === "function" ? handler(...args) : undefined;
    };
    const showProgress = () => {
      const template = latest.current.progressFeedback;
      if (!template || toastId.current) return;
      toastId.current = contentToast("loading", () => <LiveFeedback template={template} store={store} />);
    };
    const finish = async () => {
      await call("onComplete");
      const list = store.get();
      const completed = list.filter((e) => e.status === "completed");
      const template = latest.current.resultFeedback;
      if (template && completed.length > 0) {
        const id = contentToast("success", () => <QueueFeedback template={template} entries={() => list} />, toastId.current ? { id: toastId.current } : undefined);
        toastId.current = undefined;
        void id;
      } else if (toastId.current) {
        removeToast(toastId.current);
        toastId.current = undefined;
      }
      if (isTrue(latest.current.clearAfterFinish)) store.set(store.get().filter((e) => e.status !== "completed" && e.status !== "error"));
    };
    const processOne = async (entry: QueueEntry) => {
      const { actionItemId, item } = entry;
      let processItemContext: Record<string, unknown> = {};
      try {
        const willProcessResult = await call("onWillProcess", { item, actionItemId, processItemContext });
        processItemContext = { ...processItemContext, willProcessResult };
        if (willProcessResult === false) {
          remove(actionItemId);
          return;
        }
        update(actionItemId, { status: "started" });
        const onProgress = (progress: unknown) => update(actionItemId, { status: "in-progress", progress });
        const result = await call("onProcess", { item, actionItemId, processItemContext, onProgress, reportProgress: onProgress });
        processItemContext = { ...processItemContext, processResult: result };
        await call("onDidProcess", { item, actionItemId, processItemContext });
        update(actionItemId, { status: "completed", result });
      } catch (thrown) {
        const error = asError(thrown);
        let shown: unknown;
        try {
          shown = await call("onProcessError", error, { item, actionItemId, processItemContext });
        } catch (handlerError) {
          reportRuntimeError(handlerError);
        }
        update(actionItemId, { status: "error", error });
        if (shown !== false) {
          reportRuntimeError(error);
          toast.error((error as { message?: unknown }).message ?? String(error));
        }
      }
    };
    const run = async () => {
      if (running.current) return;
      running.current = true;
      let processed = 0;
      try {
        for (;;) {
          if (!mounted.current) return;
          const next = store.get().find((e) => e.status === "pending");
          if (!next) break;
          showProgress();
          processed++;
          await processOne(next);
        }
        if (processed > 0) await finish();
      } finally {
        running.current = false;
      }
    };
    const enqueue = (items: readonly unknown[]) => {
      const batchId = nextId();
      const entries = items.map((item) => Object.freeze<QueueEntry>({ actionItemId: nextId(), batchId, status: "pending", item }));
      store.set([...store.get(), ...entries]);
      queueMicrotask(() => void run());
      return entries.map((e) => e.actionItemId);
    };
    return {
      enqueueItem: (item: unknown) => enqueue([item])[0],
      enqueueItems: (items: unknown) => Object.freeze(enqueue(Array.isArray(items) ? items : [])),
      getQueuedItems: () => store.get(),
      getQueueLength: () => store.get().filter((e) => e.status === "pending" || e.status === "started" || e.status === "in-progress").length,
      remove,
      clearCompleted: () => store.set(store.get().filter((e) => e.status !== "completed" && e.status !== "error")),
    };
  }, [store]);
  useComponentApi(props.registerApi, api);
  return null;
}

// --- MessageListener -----------------------------------------------------------------

/**
 * `MessageListener`: `messageReceived(data, message)` for each `postMessage` to
 * this window; `message` is a frozen `{ data, origin }`. Its children render as
 * they are, without a wrapper.
 */
export function MessageListener({ onMessageReceived, children }: { onMessageReceived?: (data: unknown, message: unknown) => unknown; children?: ReactNode }) {
  const handler = useRef(onMessageReceived);
  handler.current = onMessageReceived;
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (typeof handler.current !== "function") return;
      let data: unknown;
      try {
        data = freezeDeep(event.data);
      } catch {
        data = event.data;
      }
      void handler.current(data, Object.freeze({ data, origin: event.origin }));
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);
  return <>{children}</>;
}
