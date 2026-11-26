// The virtualizer setup shared by List (step 29) and, later, Table, Tree and
// TileGrid: TanStack Virtual (step 29 decision 1, .ai/plan/poc-29-list.md).
//
//   scrollContainer   where a component without a height of its own scrolls:
//                     the nearest scrolling ancestor, or the window
//   scrollObservers   TanStack's element or window observers, chosen per
//                     instance (the scroll target is found after mount, and
//                     TanStack re-reads it on every update)
//   renderCache       the keys of recently seen rows, kept mounted (LRU)
//   userScrollTracker whether a scroll comes from the user (wheel, touch,
//                     keys, a pointer on the scrollbar) or from code
import {
  defaultRangeExtractor,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  windowScroll,
  type Range,
  type Virtualizer,
} from "@tanstack/react-virtual";

export type ScrollTarget = HTMLElement | Window;

export const isWindow = (target: unknown): target is Window => typeof window !== "undefined" && target === window;

const SCROLLING = /^(auto|scroll|overlay)$/;

/** The nearest ancestor that scrolls vertically, or the window. */
export function scrollContainer(element: HTMLElement): ScrollTarget {
  for (let node = element.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (SCROLLING.test(getComputedStyle(node).overflowY)) return node;
  }
  return window;
}

/** The element's offset from the start of its scroll target's content (TanStack's `scrollMargin`). */
export function offsetIn(element: HTMLElement, target: ScrollTarget): number {
  const top = element.getBoundingClientRect().top;
  if (isWindow(target)) return Math.round(top + window.scrollY);
  return Math.round(top - target.getBoundingClientRect().top + target.scrollTop);
}

type AnyVirtualizer = Virtualizer<Element, Element>;

/** TanStack's observers and scroll function for an element or the window, decided per call. */
export const scrollObservers = {
  observeElementRect: (instance: AnyVirtualizer, cb: Parameters<typeof observeElementRect>[1]) =>
    isWindow(instance.scrollElement) ? observeWindowRect(instance as unknown as Virtualizer<Window, Element>, cb) : observeElementRect(instance, cb),
  observeElementOffset: (instance: AnyVirtualizer, cb: Parameters<typeof observeElementOffset>[1]) =>
    isWindow(instance.scrollElement) ? observeWindowOffset(instance as unknown as Virtualizer<Window, Element>, cb) : observeElementOffset(instance, cb),
  scrollToFn: (offset: number, options: { adjustments?: number; behavior?: ScrollBehavior }, instance: AnyVirtualizer) =>
    isWindow(instance.scrollElement)
      ? windowScroll(offset, options, instance as unknown as Virtualizer<Window, Element>)
      : elementScroll(offset, options, instance),
};

/**
 * The render cache (XMLUI `renderCache`, `renderCacheSize`): the keys of the
 * rows most recently in range, at most `size`, newest last. The range
 * extractor adds the cached rows that still exist to TanStack's range, so
 * they stay mounted (no remount and no re-measuring when the user scrolls
 * back).
 */
export class RenderCache {
  private readonly keys = new Map<string, true>();

  constructor(public size: number) {}

  /** Notes the keys now in range. */
  touch(keys: Iterable<string>): void {
    for (const key of keys) {
      this.keys.delete(key);
      this.keys.set(key, true);
    }
    while (this.keys.size > this.size) this.keys.delete(this.keys.keys().next().value!);
  }

  /** TanStack's range, plus the cached rows (their indexes from `indexOf`), sorted. */
  extract(range: Range, keyAt: (index: number) => string | undefined, indexOf: ReadonlyMap<string, number>): number[] {
    const base = defaultRangeExtractor(range);
    this.touch(base.map(keyAt).filter((k): k is string => k !== undefined));
    if (this.size === 0) return base;
    const all = new Set(base);
    for (const key of this.keys.keys()) {
      const index = indexOf.get(key);
      if (index !== undefined) all.add(index);
    }
    return all.size === base.length ? base : [...all].sort((a, b) => a - b);
  }

  get count(): number {
    return this.keys.size;
  }
}

/** How long after an input a scroll still counts as the user's (wheel momentum, a drag). */
const USER_SCROLL_MS = 600;

/**
 * Tells user scrolls from programmatic ones (XMLUI's `scroll` event is for user
 * scrolls only; TanStack's own scroll classification is private). Input on the
 * target (or, for the window, the document) marks the next scrolls as the
 * user's; a held pointer (a scrollbar drag) until it is released.
 */
export function userScrollTracker(target: ScrollTarget): { isUser: () => boolean; dispose: () => void } {
  let last = -Infinity;
  let held = false;
  const mark = () => {
    last = performance.now();
  };
  const down = () => {
    held = true;
    mark();
  };
  // Only a pointer pressed on the target (its scrollbar) counts: a click elsewhere is no scroll.
  const up = () => {
    if (!held) return;
    held = false;
    mark();
  };
  const host: EventTarget = isWindow(target) ? document : target;
  const events: [EventTarget, string, () => void][] = [
    [host, "wheel", mark],
    [host, "touchmove", mark],
    [host, "keydown", mark],
    [host, "pointerdown", down],
    [window, "pointerup", up],
  ];
  for (const [t, name, fn] of events) t.addEventListener(name, fn, { passive: true, capture: true });
  return {
    isUser: () => held || performance.now() - last < USER_SCROLL_MS,
    dispose: () => {
      for (const [t, name, fn] of events) t.removeEventListener(name, fn, { capture: true });
    },
  };
}
