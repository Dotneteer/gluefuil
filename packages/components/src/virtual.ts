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
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  defaultRangeExtractor,
  useVirtualizer,
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

/** Rows in the static window (the server render, and while there is no layout); XMLUI's virtua `ssrCount` plays this part. */
export const STATIC_ROWS = 20;

/** The new rows keep the old first or last key at their edge: rows added or removed, not a sort or new data. */
export function keepsAnEdge(old: readonly string[], keys: readonly string[]): boolean {
  if (old.length === 0 || keys.length === 0) return true;
  return old[0] === keys[0] || old[old.length - 1] === keys[keys.length - 1];
}

export interface VirtualRowsOptions {
  /** The rows' keys, in order. */
  keys: readonly string[];
  /** The component is its own scroll box (it has a height); otherwise it scrolls with its container. */
  own: boolean;
  /** The component's root, and the box the rows are placed in. */
  root: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  estimate: number;
  overscan: number;
  /** Recently seen rows kept mounted (0: none). */
  cacheSize: number;
  /** Start at the end and follow appends (List scrollAnchor="bottom"). */
  bottom?: boolean;
  /** A user scroll (wheel, touch, keys, the scrollbar), with the state at that moment. */
  onUserScroll?: () => void;
  /** A row kept mounted wherever the view is (step 31: the Tree's focused row, its one tab stop). */
  pinned?: string;
}

export interface VirtualRows {
  virtualizer: ReturnType<typeof useVirtualizer<Element, HTMLElement>>;
  /** Virtual mode: a scroll container with a size. Otherwise the static window. */
  virtual: boolean;
  target: ScrollTarget | null;
  /** The rows' offset in the scroll container (TanStack's scrollMargin). */
  margin: number;
  /** The static window: [start, end) of the rows. */
  staticStart: number;
  staticEnd: number;
  /** The rows in view, inclusive ({ -1, -1 } when there are none). */
  visibleRange(): { startIndex: number; endIndex: number };
  /** The scroll position relative to the rows: scrollTop, scrollHeight, viewportSize, atEnd. */
  scrollPosition(): { scrollTop: number; scrollHeight: number; viewportSize: number; atEnd: boolean };
}

/**
 * Step 29 (List), shared with step 30's Table: the rows of a component on
 * TanStack Virtual. Attaches to its own box or its scroll container once it has
 * a layout box; measures its offset there; keeps recently seen rows mounted;
 * anchors when rows are added before the view (not after a sort); reports
 * user scrolls. Until attached, the static window (the first STATIC_ROWS, the
 * last with `bottom`) is what renders: on the server and in jsdom.
 */
export function useVirtualRows(options: VirtualRowsOptions): VirtualRows {
  const { keys, own, root, content, bottom = false } = options;
  const [target, setTarget] = useState<ScrollTarget | null>(null);
  // Attached once the component has a layout box (not in jsdom, nor while hidden: then it stays static).
  useLayoutEffect(() => {
    const element = root.current!;
    const attach = () => {
      if (element.offsetWidth === 0 && element.offsetHeight === 0) return false;
      setTarget(own ? element : scrollContainer(element));
      return true;
    };
    if (attach() || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (attach()) observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [own, root]);
  // The rows' offset in the scroll container (TanStack's scrollMargin): content above them (a
  // Table's header, or the page above a List). Measured after each render, and whenever an
  // ancestor up to the container resizes (another List's rows measured, text wrapped).
  const [margin, setMargin] = useState(0);
  const measureMargin = useCallback(() => {
    const next = target && content.current ? offsetIn(content.current, target) : 0;
    setMargin((old) => (old === next ? old : next));
  }, [target, content]);
  useLayoutEffect(measureMargin);
  useEffect(() => {
    if (!target || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureMargin());
    if (target === root.current) {
      for (const child of Array.from(root.current.children)) if (child !== content.current) observer.observe(child);
    } else {
      const stop = isWindow(target) ? document.body : target;
      for (let node = root.current?.parentElement; node && node !== stop.parentElement; node = node.parentElement) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [target, measureMargin, root, content]);

  // Anchoring keeps the visible row in place when rows are added or removed before it (XMLUI's
  // virtua `shift`, ListReact.tsx 684–720). Only when an edge survives: a sort or a new data set
  // keeps the scroll offset instead (XMLUI #3936). Decided during render, as TanStack compares
  // the options with the previous render's.
  const previousKeys = useRef(keys);
  const anchorTo = useRef<"start" | "end">("end");
  if (previousKeys.current !== keys) {
    anchorTo.current = keepsAnEdge(previousKeys.current, keys) ? "end" : "start";
    previousKeys.current = keys;
  }
  const cache = useRef<RenderCache>(null as unknown as RenderCache);
  cache.current ??= new RenderCache(options.cacheSize);
  cache.current.size = options.cacheSize;
  const indexOf = useMemoMap(keys);
  const getItemKey = useCallback((index: number) => keys[index] ?? index, [keys]);
  const estimate = options.estimate;
  const estimateSize = useCallback(() => estimate, [estimate]);
  const pinned = options.pinned;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = cache.current.extract(range, (i) => keys[i], indexOf);
      const at = pinned === undefined ? undefined : indexOf.get(pinned);
      return at === undefined || indexes.includes(at) ? indexes : [...indexes, at].sort((a, b) => a - b);
    },
    [keys, indexOf, pinned],
  );
  const virtualizer = useVirtualizer<Element, HTMLElement>({
    count: keys.length,
    getScrollElement: () => target as Element | null,
    estimateSize,
    getItemKey,
    overscan: options.overscan,
    scrollMargin: margin,
    // In its own box, what sits above the rows (a Table's sticky header) covers the viewport's top:
    // scrolling to a row keeps it below.
    scrollPaddingStart: own ? margin : 0,
    anchorTo: anchorTo.current,
    followOnAppend: bottom,
    rangeExtractor,
    enabled: target !== null,
    ...(scrollObservers as unknown as Pick<Parameters<typeof useVirtualizer<Element, HTMLElement>>[0], "observeElementRect" | "observeElementOffset" | "scrollToFn">),
  });
  const virtual = target !== null && (virtualizer.scrollRect?.height ?? 0) > 0 && keys.length > 0;
  // bottom: start at the end once there is a viewport (then followOnAppend and anchorTo keep it there).
  const atEndOnce = useRef(false);
  useLayoutEffect(() => {
    if (!bottom || !virtual || atEndOnce.current) return;
    atEndOnce.current = true;
    virtualizer.scrollToEnd();
  }, [bottom, virtual, virtualizer]);

  const staticStart = bottom ? Math.max(0, keys.length - STATIC_ROWS) : 0;
  const staticEnd = Math.min(keys.length, staticStart + STATIC_ROWS);
  const visibleRange = () => {
    if (keys.length === 0) return { startIndex: -1, endIndex: -1 };
    if (!virtual) return { startIndex: staticStart, endIndex: staticEnd - 1 };
    const range = virtualizer.range;
    return range ? { startIndex: range.startIndex, endIndex: range.endIndex } : { startIndex: -1, endIndex: -1 };
  };
  const scrollPosition = () => {
    const total = virtual ? virtualizer.getTotalSize() : (content.current?.offsetHeight ?? 0);
    const viewportSize = Math.max(0, (virtualizer.scrollRect?.height ?? 0) - (own ? margin : 0));
    const scrollTop = Math.max(0, (virtualizer.scrollOffset ?? 0) - (own ? 0 : margin));
    return { scrollTop, scrollHeight: total, viewportSize, atEnd: scrollTop + viewportSize >= total - 1.5 };
  };
  const onUserScroll = useRef(options.onUserScroll);
  onUserScroll.current = options.onUserScroll;
  useEffect(() => {
    if (!target) return undefined;
    const tracker = userScrollTracker(target);
    const onScroll = () => {
      if (tracker.isUser()) onUserScroll.current?.();
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      tracker.dispose();
    };
  }, [target]);
  return { virtualizer, virtual, target, margin, staticStart, staticEnd, visibleRange, scrollPosition };
}

function useMemoMap(keys: readonly string[]): ReadonlyMap<string, number> {
  const memo = useRef<{ keys: readonly string[]; map: Map<string, number> } | null>(null);
  if (memo.current?.keys !== keys) memo.current = { keys, map: new Map(keys.map((k, i) => [k, i])) };
  return memo.current.map;
}

/** A virtual row's placement: its offset in the rows' box. */
export const rowOffset = (start: number, margin: number) => start - margin;
