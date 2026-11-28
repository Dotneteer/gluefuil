// TableOfContents and Bookmark (step 32; design: .ai/plan/poc-32-remaining.md).
//
// Headings (text.tsx) and Bookmarks register in a heading registry, one per App
// (a default one outside an App). In the browser they register after commit,
// with their element, and the registry keeps them in document order.
//
// The prerender: a static render can't see headings that render after the
// TableOfContents, so headings also record themselves during a static pass,
// and a TableOfContents renders the previous pass's list, asking for another
// pass when there is none yet, or when that pass waited for code
// (`requestServerRender`). Hydration must render the same list: the
// TableOfContents reads it back from its own prerendered DOM (found by
// `useId`) as useSyncExternalStore's server snapshot, then switches to the
// live registry.
import { requestServerRender, staticRenderInfo, useComponentApi, type RegisterApi, type StaticRenderInfo, useFrameworkText } from "@gluefuil/runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLayout, type LayoutProps } from "./layout";
import { contextMenuHandler } from "./text";

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";

/** A heading or bookmark in the table of contents. */
export interface TocEntry {
  /** The registering instance (React's useId). */
  readonly key: string;
  /** The anchor id (`#id`). */
  readonly id: string;
  readonly level: number;
  readonly text: string;
  /** The element to scroll to (in the browser). */
  readonly element?: HTMLElement;
}

/** Headings and bookmarks in document order; subscribable. */
export class HeadingRegistry {
  private readonly byKey = new Map<string, TocEntry>();
  private readonly listeners = new Set<() => void>();
  private sorted: readonly TocEntry[] = [];

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly entries = () => this.sorted;

  /** Adds or replaces an entry; returns its removal. */
  register(entry: TocEntry): () => void {
    this.byKey.set(entry.key, entry);
    this.changed();
    return () => {
      if (this.byKey.get(entry.key) !== entry) return;
      this.byKey.delete(entry.key);
      this.changed();
    };
  }

  private changed() {
    this.sorted = [...this.byKey.values()].sort((a, b) => {
      if (!a.element || !b.element || a.element === b.element) return 0;
      return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    for (const listener of [...this.listeners]) listener();
  }
}

const defaultRegistry = new HeadingRegistry();

/** The App's heading registry (App provides one; outside an App, a shared default). */
export const HeadingRegistryContext = createContext<HeadingRegistry>(defaultRegistry);

// --- The static passes -----------------------------------------------------------

/** What each recent static pass recorded, by pass number. */
const passes = new Map<number, Map<string, TocEntry>>();

function recordStatic(info: StaticRenderInfo, entry: TocEntry) {
  let recorded = passes.get(info.pass);
  if (!recorded) {
    recorded = new Map();
    passes.set(info.pass, recorded);
    for (const pass of passes.keys()) if (pass < info.pass - 2) passes.delete(pass);
  }
  if (!recorded.has(entry.key)) recorded.set(entry.key, entry);
}

/** The previous pass's entries if it rendered this path completely; else another pass is requested. */
function previousStaticEntries(info: StaticRenderInfo): readonly TocEntry[] {
  const previous = info.previous;
  if (!previous || previous.waited) {
    requestServerRender();
    return [];
  }
  return [...(passes.get(previous.pass)?.values() ?? [])];
}

/**
 * Registers a heading or bookmark: during a static pass it records itself;
 * in the browser it registers its element after commit.
 */
export function useTocEntry(ref: { readonly current: HTMLElement | null }, id: string | undefined, level: number, text: string | undefined, omit: boolean): void {
  const registry = useContext(HeadingRegistryContext);
  const key = useId();
  const label = text ?? id;
  const info = staticRenderInfo();
  if (info && id !== undefined && !omit && label !== undefined) recordStatic(info, { key, id, level, text: label });
  useLayoutEffect(() => {
    if (id === undefined || omit || label === undefined || !ref.current) return undefined;
    return registry.register({ key, id, level, text: label, element: ref.current });
  }, [registry, key, id, level, label, omit, ref]);
}

// --- Bookmark --------------------------------------------------------------------

type BookmarkProps = {
  $$id?: string;
  title?: unknown;
  level?: unknown;
  omitFromToc?: unknown;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

/** The text of children made of strings and numbers. */
function plainText(children: ReactNode): string | undefined {
  if (typeof children === "string" || typeof children === "number") return String(children).trim() || undefined;
  if (Array.isArray(children) && children.length > 0 && children.every((c) => typeof c === "string" || typeof c === "number")) return children.join("").trim() || undefined;
  return undefined;
}

/** `Bookmark`: an anchor (`#id`) around its children; in the table of contents with `title` (else its text, else the id). */
export function Bookmark({ $$id, title, level, omitFromToc, registerApi, children }: BookmarkProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const n = Math.min(6, Math.max(1, Number(level) || 1));
  const label = typeof title === "string" && title !== "" ? title : (plainText(children) ?? $$id);
  useTocEntry(ref, $$id, n, label, isTrue(omitFromToc));
  const api = useMemo(() => ({ scrollIntoView: () => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }), []);
  useComponentApi(registerApi, api);
  return (
    <span ref={ref} id={$$id} className="gfui-Bookmark" data-anchor="">
      {children}
    </span>
  );
}

// --- TableOfContents -------------------------------------------------------------

const SCROLL_STYLES = new Set(["overlay", "whenMouseOver", "whenScrolling"]);
const TAKEOVER_WAIT_MS = 3000;

/** Whether `live` has every entry of `prerendered` (same id, level and text). */
function covers(live: readonly TocEntry[], prerendered: readonly TocEntry[]): boolean {
  return prerendered.every((p) => live.some((l) => l.id === p.id && l.level === p.level && l.text === p.text));
}
const noEntries: readonly TocEntry[] = [];

/** The entries a prerendered TableOfContents shows, read back from its DOM (the hydration snapshot). */
function prerenderedEntries(uid: string): readonly TocEntry[] {
  if (typeof document === "undefined") return noEntries;
  const nav = document.querySelector(`[data-toc="${CSS.escape(uid)}"]`);
  if (!nav) return noEntries;
  return [...nav.querySelectorAll<HTMLAnchorElement>("a[data-id]")].map((a, i) => ({
    key: `prerendered-${i}`,
    id: a.dataset.id!,
    level: Number(a.dataset.level) || 1,
    text: a.textContent ?? "",
  }));
}

type TableOfContentsProps = LayoutProps & {
  maxHeadingLevel?: unknown;
  omitH1?: unknown;
  smoothScrolling?: unknown;
  scrollStyle?: unknown;
  showScrollerFade?: unknown;
  onContextMenu?: unknown;
};

/**
 * `TableOfContents`: the page's headings and bookmarks (up to
 * `maxHeadingLevel`, without H1 if `omitH1`) as links; a click scrolls to one
 * and moves focus there; the one at the top of the view is marked.
 */
export function TableOfContents(props: TableOfContentsProps) {
  const t = useFrameworkText();
  const { maxHeadingLevel, omitH1, smoothScrolling, scrollStyle, showScrollerFade, onContextMenu } = props;
  const layout = useLayout(props);
  const registry = useContext(HeadingRegistryContext);
  const uid = useId();
  // The server snapshot: during a static pass, the previous pass's list; while hydrating, the prerendered list.
  const serverSnapshot = useRef<readonly TocEntry[] | undefined>(undefined);
  const getServerSnapshot = () => {
    if (serverSnapshot.current) return serverSnapshot.current;
    const info = staticRenderInfo();
    serverSnapshot.current = info ? previousStaticEntries(info) : prerenderedEntries(uid);
    return serverSnapshot.current;
  };
  const live = useSyncExternalStore(registry.subscribe, registry.entries, getServerSnapshot);
  // After a takeover the prerendered list stays until the live headings cover it: headings in a
  // lazy chunk (Markdown) hydrate later, and dropping them for a moment would replace nodes.
  // At most for TAKEOVER_WAIT_MS. (While hydrating, `live` is the prerendered list itself.)
  const settled = useRef(false);
  const [, setExpired] = useState(false);
  const prerendered = serverSnapshot.current;
  if (!settled.current && (!prerendered || prerendered.length === 0 || (live !== prerendered && covers(live, prerendered)))) settled.current = true;
  useEffect(() => {
    if (settled.current) return undefined;
    const timer = setTimeout(() => {
      settled.current = true;
      setExpired(true);
    }, TAKEOVER_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const all = settled.current ? live : (prerendered ?? live);
  const max = Math.min(6, Math.max(1, Number(maxHeadingLevel) || 6));
  const noH1 = isTrue(omitH1);
  const entries = useMemo(() => all.filter((e) => e.level <= max && !(noH1 && e.level === 1)), [all, max, noH1]);

  const [active, setActive] = useState<string>();
  const suspended = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const smooth = isTrue(smoothScrolling);
  // The heading at the top of the view (XMLUI: an IntersectionObserver with the bottom 80% cut off).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const elements = new Map<Element, string>();
    for (const e of entries) if (e.element) elements.set(e.element, e.id);
    if (elements.size === 0) return undefined;
    const observer = new IntersectionObserver(
      (records) => {
        if (suspended.current !== undefined) return;
        for (const record of records) if (record.isIntersecting) setActive(elements.get(record.target));
      },
      { rootMargin: "0% 0% -80%" },
    );
    for (const element of elements.keys()) observer.observe(element);
    return () => observer.disconnect();
  }, [entries]);
  useEffect(() => () => clearTimeout(suspended.current), []);

  const list = useRef<HTMLDivElement>(null);
  // The marked item stays in view in a TableOfContents that scrolls.
  useEffect(() => {
    const box = list.current;
    if (!box || active === undefined) return;
    const link = box.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`);
    if (!link) return;
    const top = link.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + link.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: top - box.clientHeight / 2, behavior: smooth ? "smooth" : "auto" });
    }
  }, [active, smooth]);

  const follow = useCallback(
    (entry: TocEntry) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.ctrlKey || event.metaKey) return; // a new tab
      event.preventDefault();
      const target = registry.entries().find((e) => e.key === entry.key)?.element ?? registry.entries().find((e) => e.id === entry.id)?.element;
      if (!target) return;
      setActive(entry.id);
      clearTimeout(suspended.current);
      suspended.current = setTimeout(() => (suspended.current = undefined), smooth ? 800 : 100);
      target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      if (!target.hasAttribute("tabindex") && !target.matches("a[href], button, input, select, textarea")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    },
    [registry, smooth],
  );

  const { fade, edges, onScroll, scrolling } = useScrollFades(list, SCROLL_STYLES.has(String(scrollStyle)) && !isFalse(showScrollerFade), scrollStyle === "whenScrolling", entries.length);
  const styled = SCROLL_STYLES.has(String(scrollStyle));
  return (
    <nav
      className="gfui-TableOfContents"
      aria-label={t("gfui.aria.tableOfContents")}
      data-toc={uid}
      data-fade-top={fade && !edges.top ? "" : undefined}
      data-fade-bottom={fade && !edges.bottom ? "" : undefined}
      onContextMenu={contextMenuHandler(onContextMenu)}
      {...layout.attributes}
      style={layout.style as CSSProperties}
    >
      <div ref={list} className="gfui-TableOfContents-scroll" data-scroll-style={styled ? String(scrollStyle) : undefined} data-scrolling={scrolling ? "" : undefined} onScroll={onScroll}>
        <ul className="gfui-TableOfContents-list">
          {entries.map((entry, i) => (
            // Keyed by position: the prerendered list and the live one reuse the same nodes.
            <li key={`${i}:${entry.id}`} className="gfui-TableOfContentsItem" data-level={entry.level} data-active={entry.id === active ? "" : undefined}>
              <a href={`#${entry.id}`} data-id={entry.id} data-level={entry.level} aria-current={entry.id === active ? "location" : undefined} onClick={follow(entry)}>
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** Fades where a scrolling list has more (showScrollerFade), and the `whenScrolling` state. */
function useScrollFades(box: { readonly current: HTMLElement | null }, enabled: boolean, trackScrolling: boolean, size: number) {
  const [edges, setEdges] = useState({ top: true, bottom: true });
  const update = () => {
    const el = box.current;
    if (!el || !enabled) return;
    const top = el.scrollTop <= 1;
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setEdges((old) => (old.top === top && old.bottom === bottom ? old : { top, bottom }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(update, [enabled, size]);
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onScroll = () => {
    update();
    if (!trackScrolling) return;
    setScrolling(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setScrolling(false), 400);
  };
  return { fade: enabled, edges, onScroll, scrolling };
}
