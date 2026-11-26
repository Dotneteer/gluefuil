// Structure components (step 28, .ai/plan/poc-28-structure.md): Tabs and
// TabItem, ExpandableItem, Stepper and Step, Splitter, ScrollViewer,
// StickyBox, StickySection, ResponsiveBar. Their look comes from theme
// variables only (styles.ts STRUCTURE).
//
// Tabs and Stepper get their headers as data (`$$headers`, compiled from the
// TabItem/Step children, `childrenAsHeaders`); the children render in place and
// show their content while their `$$key` is the active one.

import {
  ChildContextValues,
  pointerData,
  signal,
  templateRenderer,
  useComponentApi,
  useSignal,
  type RegisterApi,
  type TemplateFunction,
  type TemplateRenderer,
} from "@gluefuil/runtime";
import { Accordion, Collapse, ScrollArea, Switch, Tabs as MantineTabs } from "@mantine/core";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Glyph } from "./icons";
import { layoutCss } from "./layout-metadata";
import { Stack, useLayout, type LayoutProps } from "./layout";
import { DropdownMenu } from "./overlays";

type Handler = ((...args: unknown[]) => unknown) | undefined;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown): string | undefined => (value === undefined || value === null || value === "" ? undefined : String(value));
const integer = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

/** A compiled header (`$$headers`): the item's key, props and `id`, and its own header template. */
interface Header {
  $$key: string;
  id?: unknown;
  label?: unknown;
  $$headerTemplate?: TemplateFunction;
  $$scope?: object;
  [name: string]: unknown;
}

const headersOf = (value: unknown): Header[] => (Array.isArray(value) ? (value as Header[]).filter((h) => h && typeof h.$$key === "string") : []);

/**
 * The active item of a Tabs or Stepper: a key, chosen by index from props and the API.
 * `initial` (activeTab, activeStep) is applied again when it changes, as in XMLUI.
 * A key that disappears (its item removed) falls back to the same index.
 */
function useActiveKey(headers: Header[], initial: unknown, onChange: (index: number) => void) {
  const [active, setActive] = useState(() => headers[Math.max(0, integer(initial) ?? 0)]?.$$key);
  const index = headers.findIndex((h) => h.$$key === active);
  const lastIndex = useRef(index);
  if (index >= 0) lastIndex.current = index;
  // A removed item: the one now at its index (or the last).
  const resolved = index >= 0 ? active : headers[Math.min(lastIndex.current, headers.length - 1)]?.$$key;
  const resolvedIndex = headers.findIndex((h) => h.$$key === resolved);
  const initialIndex = integer(initial);
  const previousInitial = useRef(initialIndex);
  useEffect(() => {
    if (previousInitial.current === initialIndex) return;
    previousInitial.current = initialIndex;
    const key = headers[initialIndex ?? 0]?.$$key;
    if (key !== undefined) setActive(key);
  });
  const latest = useRef({ headers, resolvedIndex, onChange });
  latest.current = { headers, resolvedIndex, onChange };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (resolvedIndex >= 0) latest.current.onChange(resolvedIndex);
  }, [resolved]);
  const select = useMemo(() => (i: unknown) => {
    const n = integer(i);
    const key = n === undefined ? undefined : latest.current.headers[n]?.$$key;
    if (key !== undefined) setActive(key);
  }, []);
  return { activeKey: resolved, activeIndex: resolvedIndex, select, latest };
}

// --- Tabs -------------------------------------------------------------------------------

interface TabsContextValue {
  activeKey: string | undefined;
  accordion: boolean;
  keepMounted: boolean;
  header: (key: string) => { header: Header; index: number } | undefined;
  renderHeader: (header: Header, index: number) => ReactNode;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

export type TabsProps = LayoutProps & {
  activeTab?: unknown;
  orientation?: unknown;
  tabAlignment?: unknown;
  distributeEvenly?: unknown;
  accordionView?: unknown;
  keepMounted?: unknown;
  gap?: unknown;
  headerTemplate?: TemplateRenderer;
  $$headers?: unknown;
  onDidChange?: Handler;
  onContextMenu?: Handler;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

const TAB_JUSTIFY: Record<string, CSSProperties["justifyContent"]> = { start: "flex-start", end: "flex-end", center: "center" };

/** Tabs (XMLUI Tabs): headers from `$$headers`, the TabItem children show their panels. */
export function Tabs(props: TabsProps) {
  const headers = headersOf(props.$$headers);
  const latestProps = useRef(props);
  latestProps.current = props;
  const { activeKey, activeIndex, select, latest } = useActiveKey(headers, props.activeTab, (index) => {
    const header = latest.current.headers[index];
    void latestProps.current.onDidChange?.(index, text(header?.id) ?? header?.$$key, text(header?.label));
  });
  const [activeSignal] = useState(() => signal(activeIndex));
  useEffect(() => activeSignal.set(activeIndex), [activeSignal, activeIndex]);
  const api = useMemo(
    () => ({
      next: () => select(Math.min(latest.current.resolvedIndex + 1, latest.current.headers.length - 1)),
      prev: () => select(Math.max(latest.current.resolvedIndex - 1, 0)),
      setActiveTabIndex: (index: unknown) => select(index),
      setActiveTabById: (id: unknown) => select(latest.current.headers.findIndex((h) => String(h.id ?? h.$$key) === String(id))),
      get activeTabIndex() {
        return activeSignal.get();
      },
    }),
    [select, latest, activeSignal],
  );
  useComponentApi(props.registerApi, api);
  const layout = useLayout(props);
  const accordion = isTrue(props.accordionView);
  const vertical = props.orientation === "vertical" && !accordion;
  const renderHeader = (header: Header, index: number): ReactNode => {
    const $header = { id: text(header.id) ?? header.$$key, index, label: text(header.label), isActive: header.$$key === activeKey };
    if (header.$$headerTemplate && header.$$scope) return templateRenderer(header.$$scope, header.$$headerTemplate)({ $header });
    if (props.headerTemplate) return props.headerTemplate({ $header });
    return $header.label ?? "";
  };
  const context: TabsContextValue = {
    activeKey,
    accordion,
    keepMounted: isTrue(props.keepMounted),
    header: (key) => {
      const index = headers.findIndex((h) => h.$$key === key);
      return index < 0 ? undefined : { header: headers[index]!, index };
    },
    renderHeader,
  };
  const style = { ...layout.style, ...(props.gap === undefined ? {} : { "--gfui-gap-Tabs": layoutCss(props.gap) }) } as CSSProperties;
  const onContextMenu = props.onContextMenu
    ? (event: { preventDefault(): void }) => {
        event.preventDefault();
        void props.onContextMenu!(pointerData(event));
      }
    : undefined;
  if (accordion) {
    return (
      <TabsContext.Provider value={context}>
        <Accordion
          className="gfui-Tabs"
          data-accordion=""
          value={activeKey ?? null}
          onChange={(value) => {
            if (value !== null) select(headers.findIndex((h) => h.$$key === value));
          }}
          {...layout.attributes}
          style={style}
          onContextMenu={onContextMenu}
        >
          {props.children}
        </Accordion>
      </TabsContext.Provider>
    );
  }
  const alignment = isTrue(props.distributeEvenly) ? "stretch" : String(props.tabAlignment ?? "start");
  return (
    <TabsContext.Provider value={context}>
      <MantineTabs
        className="gfui-Tabs"
        value={activeKey ?? null}
        onChange={(value) => select(headers.findIndex((h) => h.$$key === value))}
        orientation={vertical ? "vertical" : "horizontal"}
        keepMounted={isTrue(props.keepMounted)}
        {...layout.attributes}
        style={style}
        onContextMenu={onContextMenu}
      >
        <MantineTabs.List className="gfui-Tabs-list" grow={alignment === "stretch" && !vertical} justify={vertical ? undefined : TAB_JUSTIFY[alignment]}>
          {headers.map((header, index) => (
            <MantineTabs.Tab key={header.$$key} value={header.$$key} className="gfui-Tabs-tab">
              {renderHeader(header, index)}
            </MantineTabs.Tab>
          ))}
        </MantineTabs.List>
        {props.children}
      </MantineTabs>
    </TabsContext.Provider>
  );
}

export interface TabItemProps {
  label?: unknown;
  headerTemplate?: TemplateRenderer;
  $$key?: unknown;
  onActivated?: Handler;
  onDeactivated?: Handler;
  children?: ReactNode;
}

/** A tab's panel: its content while it is the active one (always, hidden, with keepMounted). */
export function TabItem(props: TabItemProps) {
  const tabs = useContext(TabsContext);
  const key = typeof props.$$key === "string" ? props.$$key : undefined;
  const active = tabs !== undefined && key !== undefined && tabs.activeKey === key;
  useActivation(active, props.onActivated, props.onDeactivated);
  if (!tabs || key === undefined) return null;
  if (tabs.accordion) {
    const found = tabs.header(key);
    return (
      <Accordion.Item value={key} className="gfui-Tabs-item">
        <Accordion.Control className="gfui-Tabs-tab">{found ? tabs.renderHeader(found.header, found.index) : null}</Accordion.Control>
        <Accordion.Panel className="gfui-Tabs-panel">{active || tabs.keepMounted ? props.children : null}</Accordion.Panel>
      </Accordion.Item>
    );
  }
  return (
    <MantineTabs.Panel value={key} className="gfui-Tabs-panel">
      {props.children}
    </MantineTabs.Panel>
  );
}

/** `activated` when the item becomes active (also when it mounts active, as XMLUI), `deactivated` when it stops. */
function useActivation(active: boolean, onActivated: Handler, onDeactivated: Handler) {
  const was = useRef(false);
  const handlers = useRef({ onActivated, onDeactivated });
  handlers.current = { onActivated, onDeactivated };
  useEffect(() => {
    if (active && !was.current) void handlers.current.onActivated?.();
    if (!active && was.current) void handlers.current.onDeactivated?.();
    was.current = active;
  }, [active]);
}

// --- ExpandableItem ---------------------------------------------------------------------

export type ExpandableItemProps = LayoutProps & {
  summary?: unknown;
  initiallyExpanded?: unknown;
  enabled?: unknown;
  iconExpanded?: unknown;
  iconCollapsed?: unknown;
  iconPosition?: unknown;
  withSwitch?: unknown;
  fullWidthSummary?: unknown;
  contentWidth?: unknown;
  onExpandedChange?: Handler;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

/** A summary that opens and closes its content (XMLUI ExpandableItem). */
export function ExpandableItem(props: ExpandableItemProps) {
  const [expanded] = useState(() => signal(isTrue(props.initiallyExpanded)));
  const open = useSignal(expanded);
  const latest = useRef(props);
  latest.current = props;
  const api = useMemo(() => {
    const set = (value: boolean) => {
      if (expanded.peek() === value) return;
      expanded.set(value);
      void latest.current.onExpandedChange?.(value);
    };
    return {
      expand: () => set(true),
      collapse: () => set(false),
      toggle: () => set(!expanded.peek()),
      get isExpanded() {
        return expanded.get();
      },
      set,
    };
  }, [expanded]);
  useComponentApi(props.registerApi, { expand: api.expand, collapse: api.collapse, toggle: api.toggle, get isExpanded() { return api.isExpanded; } });
  const layout = useLayout(props);
  const enabled = !isFalse(props.enabled);
  const summary = typeof props.summary === "function" ? (props.summary as TemplateRenderer)({}) : text(props.summary);
  const iconEnd = props.iconPosition !== "start";
  const indicator = isTrue(props.withSwitch) ? (
    <Switch checked={open} disabled={!enabled} onChange={() => api.toggle()} aria-label={typeof summary === "string" ? summary : "Expand"} className="gfui-ExpandableItem-switch" />
  ) : (
    <Glyph name={open ? (text(props.iconExpanded) ?? "chevrondown") : (text(props.iconCollapsed) ?? "chevronright")} className="gfui-ExpandableItem-icon" />
  );
  const id = `gfui-expandable-${useStableId()}`;
  return (
    <div className="gfui-ExpandableItem" data-expanded={open ? "" : undefined} {...layout.attributes} style={layout.style}>
      <div className="gfui-ExpandableItem-summary" data-full-width={isTrue(props.fullWidthSummary) ? "" : undefined} data-icon-position={iconEnd ? "end" : "start"}>
        {isTrue(props.withSwitch) ? (
          <>
            <span className="gfui-ExpandableItem-label">{summary}</span>
            {indicator}
          </>
        ) : (
          <button type="button" className="gfui-ExpandableItem-toggle" aria-expanded={open} aria-controls={id} disabled={!enabled} onClick={() => api.toggle()}>
            {iconEnd ? null : indicator}
            <span className="gfui-ExpandableItem-label">{summary}</span>
            {iconEnd ? indicator : null}
          </button>
        )}
      </div>
      <Collapse expanded={open} id={id} transitionDuration={150} className="gfui-ExpandableItem-content" style={{ width: layoutCss(props.contentWidth) ?? "100%" }}>
        {props.children}
      </Collapse>
    </div>
  );
}

let stableIds = 0;
/** An id stable for the component's life (React's useId has colons, awkward in selectors). */
function useStableId(): number {
  const [id] = useState(() => ++stableIds);
  return id;
}

// --- Stepper ----------------------------------------------------------------------------

interface StepperContextValue {
  activeKey: string | undefined;
  vertical: boolean;
  header: (key: string) => { header: Header; index: number } | undefined;
  renderStepHeader: (header: Header, index: number) => ReactNode;
}

const StepperContext = createContext<StepperContextValue | undefined>(undefined);

export type StepperProps = LayoutProps & {
  activeStep?: unknown;
  orientation?: unknown;
  nonLinear?: unknown;
  stackedLabel?: unknown;
  $$headers?: unknown;
  onDidChange?: Handler;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

/** A Stepper (XMLUI Stepper): step headers from `$$headers`; the active Step shows its content. */
export function Stepper(props: StepperProps) {
  const headers = headersOf(props.$$headers);
  const latestProps = useRef(props);
  latestProps.current = props;
  const { activeKey, activeIndex, select, latest } = useActiveKey(headers, props.activeStep, (index) => void latestProps.current.onDidChange?.(index));
  const [activeSignal] = useState(() => signal(activeIndex));
  useEffect(() => activeSignal.set(activeIndex), [activeSignal, activeIndex]);
  const api = useMemo(
    () => ({
      next: () => select(Math.min(latest.current.resolvedIndex + 1, latest.current.headers.length - 1)),
      prev: () => select(Math.max(latest.current.resolvedIndex - 1, 0)),
      reset: () => select(0),
      setActiveStep: (index: unknown) => select(index),
      get activeStep() {
        return activeSignal.get();
      },
    }),
    [select, latest, activeSignal],
  );
  useComponentApi(props.registerApi, api);
  const layout = useLayout(props);
  const vertical = props.orientation === "vertical";
  const nonLinear = isTrue(props.nonLinear);
  const renderStepHeader = (header: Header, index: number): ReactNode => {
    const state = isTrue(header.error) ? "error" : isTrue(header.completed) ? "completed" : header.$$key === activeKey ? "active" : index < activeIndex ? "past" : "upcoming";
    const indicator = state === "error" ? "!" : state === "completed" ? <Glyph name="checkmark" /> : header.icon !== undefined ? <Glyph name={header.icon} /> : String(index + 1);
    const content = (
      <>
        <span className="gfui-Step-indicator" aria-hidden>
          {indicator}
        </span>
        <span className="gfui-Step-labels">
          {text(header.label) === undefined ? null : <span className="gfui-Step-label">{text(header.label)}</span>}
          {text(header.description) === undefined ? null : <span className="gfui-Step-description">{text(header.description)}</span>}
        </span>
      </>
    );
    const attributes = { className: "gfui-Step-header", "data-state": state, "aria-current": header.$$key === activeKey ? ("step" as const) : undefined };
    return nonLinear ? (
      <button type="button" {...attributes} onClick={() => select(index)}>
        {content}
      </button>
    ) : (
      <div {...attributes}>{content}</div>
    );
  };
  const context: StepperContextValue = {
    activeKey,
    vertical,
    header: (key) => {
      const index = headers.findIndex((h) => h.$$key === key);
      return index < 0 ? undefined : { header: headers[index]!, index };
    },
    renderStepHeader,
  };
  return (
    <StepperContext.Provider value={context}>
      <div className="gfui-Stepper" data-orientation={vertical ? "vertical" : "horizontal"} data-stacked-label={isTrue(props.stackedLabel) ? "" : undefined} {...layout.attributes} style={layout.style}>
        {vertical ? null : (
          <ol className="gfui-Stepper-headers">
            {headers.map((header, index) => (
              <li key={header.$$key} className="gfui-Stepper-step">
                {renderStepHeader(header, index)}
              </li>
            ))}
          </ol>
        )}
        {vertical ? <ol className="gfui-Stepper-headers">{props.children}</ol> : props.children}
      </div>
    </StepperContext.Provider>
  );
}

export interface StepProps {
  label?: unknown;
  description?: unknown;
  icon?: unknown;
  completed?: unknown;
  error?: unknown;
  $$key?: unknown;
  onActivated?: Handler;
  children?: ReactNode;
}

/** A step: its content while it is the active one; in a vertical Stepper also its header. */
export function Step(props: StepProps) {
  const stepper = useContext(StepperContext);
  const key = typeof props.$$key === "string" ? props.$$key : undefined;
  const active = stepper !== undefined && key !== undefined && stepper.activeKey === key;
  useActivation(active, props.onActivated, undefined);
  if (!stepper || key === undefined) return null;
  const content = active && props.children !== undefined ? <div className="gfui-Step-content">{props.children}</div> : null;
  if (!stepper.vertical) return content;
  const found = stepper.header(key);
  return (
    <li className="gfui-Stepper-step">
      {found ? stepper.renderStepHeader(found.header, found.index) : null}
      {content}
    </li>
  );
}

// --- Splitter ---------------------------------------------------------------------------

export type SplitterProps = LayoutProps & {
  orientation?: unknown;
  initialPrimarySize?: unknown;
  minPrimarySize?: unknown;
  maxPrimarySize?: unknown;
  resizeMode?: unknown;
  swapped?: unknown;
  floating?: unknown;
  splitterTemplate?: TemplateRenderer;
  onResize?: Handler;
  children?: ReactNode;
};

/** A size limit as CSS: `30%`, `200px`; a negative one counts from the end (`-200px` → `calc(100% - 200px)`). */
export function splitterSize(value: unknown, fallback: string): string {
  const raw = text(value)?.trim() ?? fallback;
  const negative = /^-\s*(\d+(\.\d+)?)(px|%)?$/.exec(raw);
  if (negative) return negative[3] === "%" ? `${100 - Number(negative[1])}%` : `calc(100% - ${negative[1]}px)`;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  return raw;
}

/**
 * The primary pane's size after a drag, as CSS that keeps `resizeMode` when the
 * splitter itself resizes: a percentage (the ratio), px (the primary pane), or
 * `100% - px` (the secondary pane).
 */
export function splitterSizeAfterDrag(primary: number, total: number, mode: unknown): string {
  if (mode === "preservePrimary") return `${Math.round(primary)}px`;
  if (mode === "preserveSecondary") return `calc(100% - ${Math.round(total - primary)}px)`;
  return `${total > 0 ? Number(((primary / total) * 100).toFixed(3)) : 50}%`;
}

const KEY_STEP = 10;

/**
 * Two panes with a draggable bar (XMLUI Splitter): the first two children. The
 * primary pane's size is CSS (initialPrimarySize, then what a drag left), clamped
 * by min/max in CSS; an empty pane (its child hidden by `when`) hides the bar.
 */
export function Splitter(props: SplitterProps) {
  const layout = useLayout(props);
  const horizontal = props.orientation === "horizontal";
  const swapped = isTrue(props.swapped);
  const [size, setSize] = useState(() => splitterSize(props.initialPrimarySize, "50%"));
  const root = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const panes = Children.toArray(props.children).filter(isValidElement).slice(0, 2) as ReactElement[];
  const sizeProp = horizontal ? "width" : "height";
  const measure = () => {
    const box = root.current?.getBoundingClientRect();
    const pane = primary.current?.getBoundingClientRect();
    return { total: box ? (horizontal ? box.width : box.height) : 0, current: pane ? (horizontal ? pane.width : pane.height) : 0 };
  };
  // The size a pointer position asks for: from the primary pane's start edge.
  const resizeTo = (wanted: number) => {
    const { total } = measure();
    setSize(splitterSizeAfterDrag(Math.max(0, Math.min(total, wanted)), total, latest.current.resizeMode));
  };
  const finish = () => {
    const { current } = measure();
    void latest.current.onResize?.(Math.round(current));
  };
  // Where in the bar it was grabbed: the bar keeps that point under the pointer (no jump).
  const grab = useRef(0);
  const pointerSize = (event: PointerEvent<HTMLDivElement>) => {
    const box = root.current!.getBoundingClientRect();
    const position = horizontal ? event.clientX - box.left : event.clientY - box.top;
    const length = horizontal ? box.width : box.height;
    return swapped ? length - position : position;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!root.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = pointerSize(event) - measure().current;
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !primary.current || !root.current) return;
    resizeTo(pointerSize(event) - grab.current);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    // After the last size is applied.
    requestAnimationFrame(finish);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const grow: Record<string, number> = horizontal ? { ArrowRight: step, ArrowLeft: -step } : { ArrowDown: step, ArrowUp: -step };
    const delta = grow[event.key];
    const { total, current } = measure();
    let next: number | undefined;
    if (delta !== undefined) next = current + (swapped ? -delta : delta);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = total;
    if (next === undefined) return;
    event.preventDefault();
    resizeTo(next);
    requestAnimationFrame(finish);
  };
  const [valueNow, setValueNow] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const { total, current } = measure();
    if (total > 0) setValueNow(Math.round((current / total) * 100));
  });
  const primaryStyle: CSSProperties = {
    flex: `0 0 ${size}`,
    [horizontal ? "minWidth" : "minHeight"]: splitterSize(props.minPrimarySize, "0%"),
    [horizontal ? "maxWidth" : "maxHeight"]: splitterSize(props.maxPrimarySize, "100%"),
  };
  return (
    <div
      ref={root}
      className="gfui-Splitter"
      data-orientation={horizontal ? "horizontal" : "vertical"}
      data-swapped={swapped ? "" : undefined}
      data-floating={isTrue(props.floating) ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      {...layout.attributes}
      style={layout.style}
    >
      <div ref={primary} className="gfui-Splitter-pane" data-pane="primary" style={primaryStyle}>
        {panes[0]}
      </div>
      <div
        className="gfui-Splitter-resizer"
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuenow={valueNow}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {props.splitterTemplate ? props.splitterTemplate({}) : null}
      </div>
      <div className="gfui-Splitter-pane" data-pane="secondary" style={{ [sizeProp === "width" ? "minWidth" : "minHeight"]: 0 }}>
        {panes[1]}
      </div>
    </div>
  );
}

// --- ScrollViewer -----------------------------------------------------------------------

export type ScrollViewerProps = LayoutProps & {
  scrollStyle?: unknown;
  showScrollerFade?: unknown;
  headerTemplate?: TemplateRenderer;
  footerTemplate?: TemplateRenderer;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

const SCROLL_TYPES: Record<string, "always" | "hover" | "scroll"> = { overlay: "always", whenMouseOver: "hover", whenScrolling: "scroll" };

/**
 * Fills its parent and scrolls (XMLUI ScrollViewer); its content is a vertical
 * Stack (the spacing ladder). `normal` is the browser's
 * scrollbar; the other styles are Mantine's ScrollArea. Fades show where there is
 * more to scroll (not with `normal`).
 */
export function ScrollViewer(props: ScrollViewerProps) {
  const layout = useLayout(props);
  const viewport = useRef<HTMLDivElement>(null);
  const type = SCROLL_TYPES[String(props.scrollStyle)];
  const fade = type !== undefined && !isFalse(props.showScrollerFade);
  const [edges, setEdges] = useState({ top: true, bottom: true });
  const update = () => {
    const el = viewport.current;
    if (!el) return;
    const top = el.scrollTop <= 1;
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setEdges((old) => (old.top === top && old.bottom === bottom ? old : { top, bottom }));
  };
  useLayoutEffect(update);
  const api = useMemo(
    () => ({
      scrollToTop: () => viewport.current?.scrollTo({ top: 0, behavior: "smooth" }),
      scrollToBottom: () => viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" }),
    }),
    [],
  );
  useComponentApi(props.registerApi, api);
  return (
    <div className="gfui-ScrollViewer" {...layout.attributes} style={layout.style}>
      {props.headerTemplate ? <div className="gfui-ScrollViewer-header">{props.headerTemplate({})}</div> : null}
      <div className="gfui-ScrollViewer-body" data-fade-top={fade && !edges.top ? "" : undefined} data-fade-bottom={fade && !edges.bottom ? "" : undefined}>
        {type === undefined ? (
          <div ref={viewport} className="gfui-ScrollViewer-viewport" onScroll={update}>
            <Stack>{props.children}</Stack>
          </div>
        ) : (
          <ScrollArea type={type} viewportRef={viewport} scrollHideDelay={type === "scroll" ? 400 : 200} onScrollPositionChange={update} className="gfui-ScrollViewer-area" classNames={{ viewport: "gfui-ScrollViewer-viewport", thumb: "gfui-ScrollViewer-thumb" }}>
            <Stack>{props.children}</Stack>
          </ScrollArea>
        )}
      </div>
      {props.footerTemplate ? <div className="gfui-ScrollViewer-footer">{props.footerTemplate({})}</div> : null}
    </div>
  );
}

// --- StickyBox, StickySection -----------------------------------------------------------

/** Sticks to the top (under a sticky AppHeader) or the bottom of its scroll container (CSS sticky). */
export function StickyBox(props: LayoutProps & { to?: unknown; children?: ReactNode }) {
  const layout = useLayout(props);
  return (
    <div className="gfui-StickyBox" data-to={props.to === "bottom" ? "bottom" : "top"} {...layout.attributes} style={layout.style}>
      {props.children}
    </div>
  );
}

/** Stays at an edge of its scroll container; a later section covers an earlier one (document order). */
export function StickySection(props: LayoutProps & { stickTo?: unknown; children?: ReactNode }) {
  const layout = useLayout(props);
  return (
    <div className="gfui-StickySection" data-to={props.stickTo === "bottom" ? "bottom" : "top"} {...layout.attributes} style={layout.style}>
      {props.children}
    </div>
  );
}

// --- ResponsiveBar ----------------------------------------------------------------------

export type ResponsiveBarProps = LayoutProps & {
  orientation?: unknown;
  reverse?: unknown;
  gap?: unknown;
  overflowIcon?: unknown;
  dropdownText?: unknown;
  dropdownAlignment?: unknown;
  triggerTemplate?: TemplateRenderer;
  onClick?: Handler;
  onWillOpen?: Handler;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

const IN_BAR = Object.freeze({ $overflow: false });
const IN_MENU = Object.freeze({ $overflow: true });
/** The menu button's size before it was measured. */
const TRIGGER_ESTIMATE = 40;

/**
 * How many children fit: all, if their sizes (with the gaps) fit; else as many as fit
 * with the menu button after them.
 */
export function fittingCount(sizes: readonly number[], available: number, gap: number, trigger: number): number {
  const total = sizes.reduce((sum, size, i) => sum + size + (i > 0 ? gap : 0), 0);
  if (total <= available + 0.5) return sizes.length;
  let used = trigger;
  let count = 0;
  for (const size of sizes) {
    const next = used + size + gap;
    if (next > available + 0.5) break;
    used = next;
    count++;
  }
  return count;
}

/**
 * A bar whose children that don't fit move into a dropdown menu (XMLUI
 * ResponsiveBar). It measures each child once while all are in the bar (and again
 * when the children change), then splits them on every resize. A child sees
 * `$overflow` (ChildContextValues; the compiler gives each its own scope). A
 * server render has every child in the bar (clipped).
 */
export function ResponsiveBar(props: ResponsiveBarProps) {
  const items = Children.toArray(props.children).filter(isValidElement) as ReactElement[];
  const count = items.length;
  const vertical = props.orientation === "vertical";
  const bar = useRef<HTMLDivElement>(null);
  const sizes = useRef<number[] | undefined>(undefined);
  const triggerSize = useRef(TRIGGER_ESTIMATE);
  const [visible, setVisible] = useState(count);
  const [hasOverflow] = useState(() => signal(false));
  const latest = useRef(props);
  latest.current = props;
  const menu = useRef<{ open?: () => void; close?: () => void }>({});
  const gapCss = layoutCss(props.gap) ?? "0px";

  // The children changed: all back in the bar, to be measured.
  const previousCount = useRef(count);
  if (previousCount.current !== count) {
    previousCount.current = count;
    sizes.current = undefined;
    if (visible !== count) setVisible(count);
  }

  const split = () => {
    const element = bar.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const gap = Number.parseFloat(vertical ? style.rowGap : style.columnGap) || 0;
    if (sizes.current === undefined) {
      const children = [...element.querySelectorAll<HTMLElement>(":scope > .gfui-ResponsiveBar-item")];
      if (children.length !== count) return;
      sizes.current = children.map((child) => (vertical ? child.offsetHeight : child.offsetWidth));
    }
    const trigger = element.querySelector<HTMLElement>(":scope > .gfui-ResponsiveBar-overflow");
    if (trigger) triggerSize.current = vertical ? trigger.offsetHeight : trigger.offsetWidth;
    const available = vertical ? element.clientHeight : element.clientWidth;
    // No layout (a server render, jsdom): everything stays in the bar.
    if (available === 0) return;
    const next = fittingCount(sizes.current, available, gap, triggerSize.current + gap);
    setVisible((old) => (old === next ? old : next));
  };
  useLayoutEffect(split);
  useEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => split());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => hasOverflow.set(visible < count), [hasOverflow, visible, count]);

  const api = useMemo(
    () => ({
      open: () => menu.current.open?.(),
      close: () => menu.current.close?.(),
      get hasOverflow() {
        return hasOverflow.get();
      },
    }),
    [hasOverflow],
  );
  useComponentApi(props.registerApi, api);
  const layout = useLayout(props);
  const reverse = isTrue(props.reverse);
  const shown = items.slice(0, visible);
  const overflow = items.slice(visible);
  return (
    <div
      ref={bar}
      className="gfui-ResponsiveBar"
      data-orientation={vertical ? "vertical" : "horizontal"}
      data-reverse={reverse ? "" : undefined}
      {...layout.attributes}
      style={{ ...layout.style, "--gfui-gap-ResponsiveBar": gapCss } as CSSProperties}
      onClick={props.onClick ? (event) => void props.onClick!(pointerData(event)) : undefined}
    >
      {shown.map((child, index) => (
        <div key={child.key ?? index} className="gfui-ResponsiveBar-item">
          <ChildContextValues.Provider value={IN_BAR}>{child}</ChildContextValues.Provider>
        </div>
      ))}
      {overflow.length > 0 ? (
        <div className="gfui-ResponsiveBar-overflow">
          <DropdownMenu
            label={undefined}
            triggerButtonIcon={text(props.overflowIcon) ?? "dotmenuhorizontal"}
            triggerButtonIconPosition="start"
            aria-label={text(props.dropdownText) ?? "More options"}
            alignment={text(props.dropdownAlignment) ?? (reverse ? "start" : "end")}
            triggerTemplate={props.triggerTemplate}
            onWillOpen={props.onWillOpen}
            registerApi={(value) => {
              menu.current = (value ?? {}) as typeof menu.current;
            }}
          >
            {overflow.map((child, index) => (
              <div key={child.key ?? index} className="gfui-ResponsiveBar-menuItem">
                <ChildContextValues.Provider value={IN_MENU}>{child}</ChildContextValues.Provider>
              </div>
            ))}
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}
