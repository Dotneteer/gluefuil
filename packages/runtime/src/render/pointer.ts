// The pointer snapshot (step 27, .ai/plan/poc-27-overlays.md decision 1): what a
// `click`, `doubleClick` or `contextMenu` handler receives instead of the DOM
// event. Plain frozen data: no platform object reaches script (the sandbox
// invariant), but `ev => menu.openAt(ev)` works as in XMLUI.

/** A pointer event as script sees it. */
export interface PointerData {
  readonly clientX: number;
  readonly clientY: number;
  /** 0 main, 1 middle, 2 secondary; -1 for a keyboard activation. */
  readonly button: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

interface EventLike {
  clientX?: number;
  clientY?: number;
  button?: number;
  /** A click's count; 0 for a click synthesized from the keyboard. */
  detail?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  currentTarget?: unknown;
  target?: unknown;
  nativeEvent?: unknown;
}

/**
 * The snapshot of a mouse or keyboard event (React's or the DOM's). A keyboard
 * activation (Enter, Space, the menu key) has no position: the element's
 * center stands in, as browsers do for a keyboard `contextmenu`.
 */
export function pointerData(event: unknown): PointerData {
  const e = (event ?? {}) as EventLike;
  let x = typeof e.clientX === "number" ? e.clientX : undefined;
  let y = typeof e.clientY === "number" ? e.clientY : undefined;
  const keyboard = x === undefined || y === undefined || (x === 0 && y === 0 && (e.detail === 0 || e.button === undefined));
  if (keyboard) {
    const element = (e.currentTarget ?? e.target) as { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } } | undefined;
    const rect = element?.getBoundingClientRect?.();
    x = rect ? rect.left + rect.width / 2 : 0;
    y = rect ? rect.top + rect.height / 2 : 0;
  }
  return Object.freeze({
    clientX: x ?? 0,
    clientY: y ?? 0,
    button: keyboard ? -1 : (e.button ?? 0),
    shiftKey: e.shiftKey === true,
    ctrlKey: e.ctrlKey === true,
    altKey: e.altKey === true,
    metaKey: e.metaKey === true,
  });
}

/** Whether a value is a pointer snapshot (or looks like one: `openAt` also takes `{ clientX, clientY }`). */
export function isPointerLike(value: unknown): value is { clientX: number; clientY: number } {
  return typeof value === "object" && value !== null && typeof (value as EventLike).clientX === "number" && typeof (value as EventLike).clientY === "number";
}
