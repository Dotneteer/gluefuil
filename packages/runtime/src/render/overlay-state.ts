// App-wide overlay state (step 27, .ai/plan/poc-27-overlays.md): the toasts and
// the confirmation queue behind the app globals `toast()` and `confirm()`.
// The runtime holds the state in signals; the components package renders it
// (App: Mantine notifications and a Modal), so the runtime stays free of Mantine.
// One state per page, like the theme and shell state.

import { signal, type ReadonlySignal } from "../reactivity/signals";

// --- Toasts ---------------------------------------------------------------------------

export type ToastKind = "default" | "success" | "error" | "loading";
export const TOAST_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;
export type ToastPosition = (typeof TOAST_POSITIONS)[number];

export interface Toast {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
  /** Milliseconds until it closes itself; `false`: it stays until removed (`loading`). */
  readonly duration: number | false;
  readonly position: ToastPosition | undefined;
  /** Changes when a toast with the same id replaces it (the renderer updates it). */
  readonly version: number;
  /** Step 32: rendered content instead of `message` (a Queue's feedback templates); not reachable from script. */
  readonly content?: () => unknown;
}

/** XMLUI's options object (`pages/globals.md` § toast). */
export interface ToastOptions {
  id?: unknown;
  duration?: unknown;
  position?: unknown;
}

/** XMLUI's defaults (react-hot-toast): 4 s, a success 2 s, loading until removed. */
const DEFAULT_DURATION: Record<ToastKind, number | false> = { default: 4000, success: 2000, error: 4000, loading: false };

const toastList = signal<readonly Toast[]>([]);
let toastCounter = 0;
let versionCounter = 0;

/** The toasts on screen, oldest first. */
export const toasts: ReadonlySignal<readonly Toast[]> = toastList;

function show(kind: ToastKind, message: unknown, options?: unknown, content?: () => unknown): string {
  const o = (typeof options === "object" && options !== null ? options : {}) as ToastOptions;
  const id = o.id === undefined || o.id === null || o.id === "" ? `gfui-toast-${++toastCounter}` : String(o.id);
  const duration = typeof o.duration === "number" && Number.isFinite(o.duration) && o.duration > 0 ? o.duration : DEFAULT_DURATION[kind];
  const position = TOAST_POSITIONS.includes(o.position as ToastPosition) ? (o.position as ToastPosition) : undefined;
  const entry: Toast = Object.freeze({
    id,
    kind,
    message: message === undefined || message === null ? "" : String(message),
    duration,
    position,
    version: ++versionCounter,
    ...(content ? { content } : {}),
  });
  const others = toastList.get().filter((t) => t.id !== id);
  toastList.set([...others, entry]);
  return id;
}

/** Removes a toast (the `toast.remove(id)` global, and the renderer when it closes one). */
export function removeToast(id: unknown): void {
  const key = String(id);
  const list = toastList.get();
  if (list.some((t) => t.id === key)) toastList.set(list.filter((t) => t.id !== key));
}

/**
 * Step 32: a toast showing rendered content (a component's templates, such as a
 * Queue's progressFeedback); `render` returns a React node. Returns the id.
 */
export function contentToast(kind: ToastKind, render: () => unknown, options?: ToastOptions): string {
  return show(kind, "", options, render);
}

export interface ToastFunction {
  (message: unknown, options?: unknown): string;
  success(message: unknown, options?: unknown): string;
  error(message: unknown, options?: unknown): string;
  loading(message: unknown, options?: unknown): string;
  remove(id: unknown): void;
}

/** The `toast` app global: `toast(msg)`, `toast.success`, `.error`, `.loading` (each returns the id), `toast.remove(id)`. */
export const toast: ToastFunction = Object.freeze(
  Object.assign((message: unknown, options?: unknown) => show("default", message, options), {
    success: (message: unknown, options?: unknown) => show("success", message, options),
    error: (message: unknown, options?: unknown) => show("error", message, options),
    loading: (message: unknown, options?: unknown) => show("loading", message, options),
    remove: removeToast,
  }),
);

// --- Confirmation ---------------------------------------------------------------------

export type ConfirmThemeColor = "attention" | "primary" | "secondary";

export interface ConfirmRequest {
  readonly id: number;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly cancelLabel: string;
  readonly width: string | undefined;
  readonly actionThemeColor: ConfirmThemeColor;
}

interface Pending {
  request: ConfirmRequest;
  resolve: (ok: boolean) => void;
}

const pending: Pending[] = [];
const queue = signal<readonly ConfirmRequest[]>([]);
let confirmCounter = 0;

/** The confirmations waiting for an answer; the renderer shows the first (a second waits). */
export const confirmQueue: ReadonlySignal<readonly ConfirmRequest[]> = queue;

const text = (value: unknown, fallback: string) => (value === undefined || value === null || value === "" ? fallback : String(value));

/**
 * The `confirm` app global (XMLUI `pages/globals.md` § confirm): positional
 * `(title, message, actionLabel, cancelLabel, width)` or one options object.
 * Resolves to true (confirmed) or false (cancelled, Escape, the close button).
 */
export function confirm(...args: unknown[]): Promise<boolean> {
  const first = args[0];
  const o =
    typeof first === "object" && first !== null
      ? (first as Record<string, unknown>)
      : { title: args[0], message: args[1], actionLabel: args[2], cancelLabel: args[3], width: args[4] };
  const color = o.actionThemeColor;
  const request: ConfirmRequest = Object.freeze({
    id: ++confirmCounter,
    title: text(o.title, "Confirm Operation"),
    message: text(o.message, "Are you sure you want to perform this operation?"),
    actionLabel: text(o.actionLabel, "Yes"),
    cancelLabel: text(o.cancelLabel, "Cancel"),
    width: o.width === undefined || o.width === null || o.width === "" ? undefined : String(o.width),
    actionThemeColor: color === "primary" || color === "secondary" ? color : "attention",
  });
  return new Promise<boolean>((resolve) => {
    pending.push({ request, resolve });
    queue.set(pending.map((p) => p.request));
  });
}

/** Answers a confirmation (the renderer's buttons, Escape): resolves its promise and shows the next. */
export function answerConfirm(id: number, ok: boolean): void {
  const index = pending.findIndex((p) => p.request.id === id);
  if (index < 0) return;
  const [entry] = pending.splice(index, 1);
  queue.set(pending.map((p) => p.request));
  entry!.resolve(ok);
}

/** Back to the initial state (tests): no toasts; pending confirmations resolve false. */
export function resetOverlayState(): void {
  toastList.set([]);
  for (const p of pending.splice(0)) p.resolve(false);
  queue.set([]);
}
