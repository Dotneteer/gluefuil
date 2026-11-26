// Overlays and menus (step 27, .ai/plan/poc-27-overlays.md): ModalDialog,
// Drawer, DropdownMenu, MenuItem, SubMenuItem, MenuSeparator, ContextMenu,
// Tooltip, and the App's renderers of toast() and confirm(), on Mantine's
// Modal, Drawer, Menu, Tooltip and notifications. Their look comes from theme
// variables only (styles.ts OVERLAYS).
//
// Every overlay portals into the overlay layer of the App or the nearest Theme
// (overlay-context.tsx); only the topmost open one closes on Escape.

import {
  answerConfirm,
  confirm,
  confirmQueue,
  isPointerLike,
  navigate,
  pointerData,
  provideContext,
  removeToast,
  signal,
  toasts,
  useComponentApi,
  useComputed,
  useSignal,
  type ConfirmRequest,
  type RegisterApi,
  type TemplateRenderer,
  type Toast,
} from "@gluefuil/runtime";
import { Button as MantineButton, Drawer as MantineDrawer, Menu, Modal, Tooltip as MantineTooltip, type FloatingPosition } from "@mantine/core";
import { createNotificationsStore, hideNotification, Notifications, showNotification, updateNotification, type NotificationData } from "@mantine/notifications";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Glyph } from "./icons";
import { pageScope, LayoutScope, Stack, useLayout, type LayoutProps } from "./layout";
import { Button, buttonVars } from "./mantine";
import { Markdown } from "./markdown";
import { DialogContext, useOverlayTarget, useTopmostOverlay, type DialogHost } from "./overlay-context";
import { isExternalUrl } from "./routing";

type Handler = ((...args: unknown[]) => unknown) | undefined;

const isTrue = (value: unknown) => value === true || value === "true";
const isFalse = (value: unknown) => value === false || value === "false";
const text = (value: unknown): string | undefined => (value === undefined || value === null || value === "" ? undefined : String(value));
const number = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** The content of a dialog or drawer: a surface of the spacing ladder at level 1, like a Card on the page. */
const BODY_SCOPE = pageScope(false);
const SURFACE = Object.freeze({ "data-surface": "" });

function Body({ className, children }: { className: string; children?: ReactNode }) {
  return (
    <LayoutScope value={BODY_SCOPE}>
      <Stack $$className={className} $$element={SURFACE}>
        {children}
      </Stack>
    </LayoutScope>
  );
}

// --- ModalDialog ------------------------------------------------------------------------

export type ModalDialogProps = LayoutProps & {
  title?: unknown;
  titleTemplate?: TemplateRenderer;
  closeButtonVisible?: unknown;
  closeOnClickAway?: unknown;
  fullScreen?: unknown;
  skipDirtyConfirmation?: unknown;
  confirmCloseTitle?: unknown;
  canCloseMessage?: unknown;
  confirmCloseLabel?: unknown;
  cancelCloseLabel?: unknown;
  /** The element has `when` (the compiler, `openedByWhen`): open as it mounts. */
  $$whenOpen?: boolean;
  onOpen?: Handler;
  onClose?: Handler;
  onWillClose?: Handler;
  onDirtyChanged?: Handler;
  contextScope?: unknown;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

/**
 * A modal dialog (XMLUI ModalDialog): `open(...params)` or `when`; `$param` and
 * `$params` inside. Closing runs `willClose` (false keeps it open), else asks
 * first when the dialog (or a Form in it) is dirty, then fires `close`. Its
 * content unmounts when it closes, so it starts fresh on the next open.
 */
export function ModalDialog(props: ModalDialogProps) {
  const latest = useRef(props);
  latest.current = props;
  const [state] = useState(() => ({
    open: signal(props.$$whenOpen === true),
    params: signal<readonly unknown[]>(Object.freeze([])),
    ownDirty: signal(false),
    forms: signal<ReadonlyMap<object, boolean>>(new Map()),
    closing: false,
  }));
  const dirty = useComputed(() => state.ownDirty.get() || [...state.forms.get().values()].some(Boolean), [state]);
  provideContext(props.contextScope, { $param: () => state.params.get()[0], $params: () => state.params.get() });

  // dirtyChanged: on each transition of the combined state.
  const previousDirty = useRef(dirty);
  useEffect(() => {
    if (previousDirty.current === dirty) return;
    previousDirty.current = dirty;
    void latest.current.onDirtyChanged?.(dirty);
  }, [dirty]);

  // Opened by `when`: the open event as it mounts.
  useEffect(() => {
    if (latest.current.$$whenOpen === true) void latest.current.onOpen?.();
  }, []);

  const host = useMemo(() => {
    const isDirty = () => state.ownDirty.peek() || [...state.forms.peek().values()].some(Boolean);
    const requestClose = async (): Promise<void> => {
      if (!state.open.peek() || state.closing) return;
      state.closing = true;
      try {
        const p = latest.current;
        if (p.onWillClose) {
          if ((await p.onWillClose()) === false) return;
        } else if (isDirty() && !isTrue(p.skipDirtyConfirmation)) {
          const ok = await confirm({
            title: text(p.confirmCloseTitle) ?? "Unsaved changes",
            message: text(p.canCloseMessage) ?? "You have unsaved changes. Are you sure you want to close this dialog?",
            actionLabel: text(p.confirmCloseLabel) ?? "Close",
            cancelLabel: text(p.cancelCloseLabel) ?? "Cancel",
          });
          if (!ok) return;
        }
        state.open.set(false);
        state.ownDirty.set(false);
        state.forms.set(new Map());
        await p.onClose?.();
      } finally {
        state.closing = false;
      }
    };
    const dialog: DialogHost = {
      requestClose,
      setFormDirty: (form, value) => {
        if (state.forms.peek().get(form) === value) return;
        state.forms.set(new Map(state.forms.peek()).set(form, value));
      },
      removeForm: (form) => {
        if (!state.forms.peek().has(form)) return;
        const next = new Map(state.forms.peek());
        next.delete(form);
        state.forms.set(next);
      },
    };
    const api = {
      open: (...params: unknown[]) => {
        state.params.set(Object.freeze([...params]));
        state.open.set(true);
        void latest.current.onOpen?.(...params);
      },
      close: () => requestClose(),
      setDirty: (value: unknown) => state.ownDirty.set(value === true),
      // Reactive, so `{dlg.getDirty()}` in markup follows it.
      getDirty: () => state.ownDirty.get() || [...state.forms.get().values()].some(Boolean),
      get isOpen() {
        return state.open.get();
      },
    };
    return { dialog, api };
  }, [state]);
  useComponentApi(props.registerApi, host.api);

  const target = useOverlayTarget();
  const opened = useSignal(state.open) && target !== null;
  const topmost = useTopmostOverlay(opened);
  const layout = useLayout(props);
  const title = props.titleTemplate ? props.titleTemplate({}) : text(props.title);
  return (
    <Modal
      opened={opened}
      onClose={() => void host.dialog.requestClose()}
      title={title}
      withCloseButton={!isFalse(props.closeButtonVisible)}
      closeButtonProps={{ "aria-label": "Close" }}
      closeOnClickOutside={!isFalse(props.closeOnClickAway)}
      closeOnEscape={topmost}
      fullScreen={isTrue(props.fullScreen)}
      size="auto"
      padding={0}
      portalProps={{ target: target ?? undefined }}
      transitionProps={{ duration: 150 }}
      className="gfui-ModalDialog"
      classNames={{ content: "gfui-ModalDialog-content", header: "gfui-ModalDialog-header", title: "gfui-ModalDialog-title", body: "gfui-ModalDialog-body", overlay: "gfui-ModalDialog-overlay" }}
      styles={{ content: layout.style }}
    >
      <DialogContext.Provider value={host.dialog}>
        <Body className="gfui-ModalDialog-stack">{props.children}</Body>
      </DialogContext.Provider>
    </Modal>
  );
}

// --- Drawer -----------------------------------------------------------------------------

export type DrawerProps = LayoutProps & {
  position?: unknown;
  hasBackdrop?: unknown;
  closeOnClickAway?: unknown;
  closeButtonVisible?: unknown;
  initiallyOpen?: unknown;
  headerTemplate?: TemplateRenderer;
  onOpen?: Handler;
  onClose?: Handler;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

const DRAWER_POSITIONS = new Set(["left", "right", "top", "bottom"]);

/** A panel sliding in from an edge (XMLUI Drawer): open(), close(), isOpen. */
export function Drawer(props: DrawerProps) {
  const latest = useRef(props);
  latest.current = props;
  const [open] = useState(() => signal(isTrue(props.initiallyOpen)));
  const api = useMemo(
    () => ({
      open: () => {
        if (open.peek()) return;
        open.set(true);
        void latest.current.onOpen?.();
      },
      close: () => {
        if (!open.peek()) return;
        open.set(false);
        void latest.current.onClose?.();
      },
      get isOpen() {
        return open.get();
      },
    }),
    [open],
  );
  useComponentApi(props.registerApi, api);
  const target = useOverlayTarget();
  const opened = useSignal(open) && target !== null;
  const topmost = useTopmostOverlay(opened);
  const position = typeof props.position === "string" && DRAWER_POSITIONS.has(props.position) ? (props.position as "left") : "left";
  const backdrop = !isFalse(props.hasBackdrop);
  const layout = useLayout(props);
  return (
    <MantineDrawer
      opened={opened}
      onClose={api.close}
      position={position}
      size={position === "left" || position === "right" ? "var(--gfui-width-Drawer)" : "var(--gfui-height-Drawer)"}
      title={props.headerTemplate ? props.headerTemplate({}) : undefined}
      withCloseButton={!isFalse(props.closeButtonVisible)}
      closeButtonProps={{ "aria-label": "Close" }}
      withOverlay={backdrop}
      closeOnClickOutside={backdrop && !isFalse(props.closeOnClickAway)}
      closeOnEscape={topmost}
      trapFocus={backdrop}
      lockScroll={backdrop}
      padding={0}
      portalProps={{ target: target ?? undefined }}
      className="gfui-Drawer"
      data-position={position}
      classNames={{ content: "gfui-Drawer-content", header: "gfui-Drawer-header", title: "gfui-Drawer-title", body: "gfui-Drawer-body", overlay: "gfui-Drawer-overlay" }}
      styles={{ content: layout.style }}
    >
      <Body className="gfui-Drawer-stack">{props.children}</Body>
    </MantineDrawer>
  );
}

// --- Menus ------------------------------------------------------------------------------

const MENU_CLASSES = {
  dropdown: "gfui-DropdownMenu",
  item: "gfui-MenuItem",
  itemSection: "gfui-MenuItem-icon",
  divider: "gfui-MenuSeparator",
};

export type DropdownMenuProps = LayoutProps & {
  label?: unknown;
  alignment?: unknown;
  enabled?: unknown;
  triggerButtonIcon?: unknown;
  triggerButtonIconPosition?: unknown;
  triggerButtonThemeColor?: unknown;
  triggerButtonVariant?: unknown;
  triggerTemplate?: TemplateRenderer;
  onWillOpen?: Handler;
  registerApi?: RegisterApi;
  children?: ReactNode;
};

const MENU_POSITIONS: Record<string, FloatingPosition> = { start: "bottom-start", end: "bottom-end", center: "bottom" };

/** A button that opens a menu (XMLUI DropdownMenu); `willOpen` false keeps it closed. */
export function DropdownMenu(props: DropdownMenuProps) {
  const latest = useRef(props);
  latest.current = props;
  const [opened, setOpened] = useState(false);
  const api = useMemo(() => {
    const open = async () => {
      const answer = await latest.current.onWillOpen?.();
      if (answer !== false) setOpened(true);
    };
    return { open: () => void open(), close: () => setOpened(false), openAsync: open };
  }, []);
  useComponentApi(props.registerApi, { open: api.open, close: api.close });
  const target = useOverlayTarget();
  const layout = useLayout(props);
  const disabled = isFalse(props.enabled);
  const iconName = text(props.triggerButtonIcon) ?? "chevrondown";
  const glyph = <Glyph name={iconName} />;
  const iconStart = props.triggerButtonIconPosition === "start";
  const trigger: ReactElement = props.triggerTemplate ? (
    <span className="gfui-DropdownMenu-trigger" {...layout.attributes} style={layout.style}>
      {props.triggerTemplate({})}
    </span>
  ) : (
    <MantineButton
      className="gfui-Button gfui-DropdownMenu-button"
      vars={buttonVars}
      disabled={disabled}
      leftSection={iconStart ? glyph : undefined}
      rightSection={iconStart ? undefined : glyph}
      {...layout.attributes}
      style={layout.style}
    >
      {text(props.label) ?? ""}
    </MantineButton>
  );
  return (
    <Menu
      opened={opened}
      onChange={(next) => (next ? void api.openAsync() : setOpened(false))}
      position={MENU_POSITIONS[String(props.alignment)] ?? "bottom-start"}
      offset={4}
      withinPortal={target !== null}
      portalProps={{ target: target ?? undefined }}
      classNames={MENU_CLASSES}
      disabled={disabled}
    >
      <Menu.Target>{trigger}</Menu.Target>
      <Menu.Dropdown>{props.children}</Menu.Dropdown>
    </Menu>
  );
}

export interface MenuItemProps {
  label?: unknown;
  icon?: unknown;
  iconPosition?: unknown;
  active?: unknown;
  enabled?: unknown;
  to?: unknown;
  onClick?: Handler;
  children?: ReactNode;
}

/** An item of a menu (XMLUI MenuItem): a click runs `onClick` (with the pointer), or navigates to `to`; the menu closes. */
export function MenuItem(props: MenuItemProps) {
  const glyph = props.icon === undefined ? undefined : <Glyph name={props.icon} />;
  const end = props.iconPosition === "end";
  const to = text(props.to);
  return (
    <Menu.Item
      leftSection={end ? undefined : glyph}
      rightSection={end ? glyph : undefined}
      disabled={isFalse(props.enabled)}
      data-active={isTrue(props.active) ? "" : undefined}
      onClick={(event) => {
        void props.onClick?.(pointerData(event));
        if (to !== undefined) void navigate(to, isExternalUrl(to) ? { target: "_blank" } : undefined);
      }}
    >
      {text(props.label) ?? props.children}
    </Menu.Item>
  );
}

export interface SubMenuItemProps {
  label?: unknown;
  icon?: unknown;
  iconPosition?: unknown;
  triggerTemplate?: TemplateRenderer;
  children?: ReactNode;
}

/** An item that opens a nested menu (XMLUI SubMenuItem): hover, a click, or the right arrow key. */
export function SubMenuItem(props: SubMenuItemProps) {
  const glyph = props.icon === undefined ? undefined : <Glyph name={props.icon} />;
  const end = props.iconPosition === "end";
  return (
    <Menu.Sub>
      <Menu.Sub.Target>
        <Menu.Sub.Item className="gfui-MenuItem gfui-SubMenuItem" leftSection={end ? undefined : glyph}>
          {props.triggerTemplate ? props.triggerTemplate({}) : text(props.label)}
        </Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown className="gfui-DropdownMenu">{props.children}</Menu.Sub.Dropdown>
    </Menu.Sub>
  );
}

/** A line between menu items. */
export function MenuSeparator() {
  return <Menu.Divider />;
}

// --- ContextMenu ------------------------------------------------------------------------

export interface ContextMenuProps {
  menuWidth?: unknown;
  contextScope?: unknown;
  registerApi?: RegisterApi;
  children?: ReactNode;
}

/** Where the last right click was: `openAt()` without a pointer opens there. */
let lastContextPoint: { clientX: number; clientY: number } | undefined;
let contextListeners = 0;
const recordContextPoint = (event: MouseEvent) => {
  lastContextPoint = { clientX: event.clientX, clientY: event.clientY };
};

/**
 * A menu without a trigger (XMLUI ContextMenu): `openAt(ev, context)` opens it
 * at the pointer; the items see `context` as `$context`. It anchors to a
 * zero-size fixed point at the pointer.
 */
export function ContextMenu(props: ContextMenuProps) {
  const [context] = useState(() => signal<unknown>(undefined));
  provideContext(props.contextScope, { $context: () => context.get() });
  const [at, setAt] = useState<{ x: number; y: number; opened: boolean; n: number }>({ x: 0, y: 0, opened: false, n: 0 });
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (contextListeners++ === 0) document.addEventListener("contextmenu", recordContextPoint, true);
    return () => {
      if (--contextListeners === 0) document.removeEventListener("contextmenu", recordContextPoint, true);
    };
  }, []);
  const api = useMemo(
    () => ({
      openAt: (ev?: unknown, value?: unknown) => {
        const point = isPointerLike(ev) ? ev : (lastContextPoint ?? { clientX: 0, clientY: 0 });
        context.set(value);
        // A new key re-creates the menu; it opens once the anchor is in place (below).
        setAt((old) => ({ x: point.clientX, y: point.clientY, opened: false, n: old.n + 1 }));
      },
      close: () => setAt((old) => (old.opened ? { ...old, opened: false } : old)),
    }),
    [context],
  );
  useComponentApi(props.registerApi, api);
  // The anchor is fixed at the pointer; an ancestor with a transform, a filter or
  // containment (an app's own CSS) would be the containing block of fixed elements and
  // shift it. So: measure where it landed, move it by the difference, then open the
  // menu, which positions itself on the anchor.
  useLayoutEffect(() => {
    const element = anchor.current;
    if (at.n === 0 || at.opened || !element) return;
    element.style.left = `${at.x}px`;
    element.style.top = `${at.y}px`;
    const rect = element.getBoundingClientRect();
    // (0, 0) for a point elsewhere: no layout (jsdom); nothing to correct.
    const measured = rect.left !== 0 || rect.top !== 0 || (at.x === 0 && at.y === 0);
    if (measured) {
      element.style.left = `${at.x - (rect.left - at.x)}px`;
      element.style.top = `${at.y - (rect.top - at.y)}px`;
    }
    setAt((old) => (old.n === at.n ? { ...old, opened: true } : old));
  }, [at]);
  const target = useOverlayTarget();
  const width = text(props.menuWidth);
  return (
    <Menu
      key={at.n}
      opened={at.opened && target !== null}
      onChange={(next) => (next ? undefined : api.close())}
      position="bottom-start"
      offset={0}
      width={width}
      withinPortal={target !== null}
      portalProps={{ target: target ?? undefined }}
      classNames={MENU_CLASSES}
    >
      <Menu.Target>
        <span ref={anchor} className="gfui-ContextMenu-anchor" aria-hidden style={{ position: "fixed", left: at.x, top: at.y, width: 0, height: 0 }} />
      </Menu.Target>
      <Menu.Dropdown>{props.children}</Menu.Dropdown>
    </Menu>
  );
}

// --- Tooltip ----------------------------------------------------------------------------

const SIDES = new Set(["top", "right", "bottom", "left"]);
const ALIGNS = new Set(["start", "center", "end"]);

export interface TooltipOptions {
  side?: unknown;
  align?: unknown;
  sideOffset?: unknown;
  alignOffset?: unknown;
  showArrow?: unknown;
  avoidCollisions?: unknown;
  delayDuration?: unknown;
  skipDelayDuration?: unknown;
  defaultOpen?: unknown;
}

/**
 * `tooltipOptions` (XMLUI Tooltip.md): an object, or a string of `;`-separated
 * parts: a side or an align value alone (`left`, `start`), a boolean option by
 * name (`showArrow`) or negated (`!showArrow`), or `name: number`.
 */
export function parseTooltipOptions(value: unknown): TooltipOptions {
  if (typeof value === "object" && value !== null) return value as TooltipOptions;
  if (typeof value !== "string") return {};
  const options: Record<string, unknown> = {};
  for (const raw of value.split(";")) {
    const part = raw.trim();
    if (part === "") continue;
    const colon = part.indexOf(":");
    if (colon >= 0) {
      const name = part.slice(0, colon).trim();
      const v = part.slice(colon + 1).trim();
      options[name] = number(v) ?? v;
    } else if (SIDES.has(part)) options.side = part;
    else if (ALIGNS.has(part)) options.align = part;
    else if (part.startsWith("!")) options[part.slice(1).trim()] = false;
    else options[part] = true;
  }
  return options;
}

/** Mantine's position from XMLUI's side and align: `bottom` + `start` → `bottom-start`. */
function tooltipPosition(options: TooltipOptions): FloatingPosition {
  const side = typeof options.side === "string" && SIDES.has(options.side) ? options.side : "top";
  const align = options.align === "start" || options.align === "end" ? `-${options.align}` : "";
  return `${side}${align}` as FloatingPosition;
}

/**
 * A tooltip over one anchor element (the Tooltip component's and the tooltip
 * behavior's): shown on hover and focus after `delayDuration` (700 ms, XMLUI's
 * default), placed by `side`/`align`, flipped to stay visible.
 */
function TooltipView({ content, options, children }: { content: ReactNode; options: TooltipOptions; children: ReactElement }) {
  const target = useOverlayTarget();
  const avoid = !isFalse(options.avoidCollisions);
  return (
    <MantineTooltip
      label={content}
      position={tooltipPosition(options)}
      offset={{ mainAxis: number(options.sideOffset) ?? 4, crossAxis: number(options.alignOffset) ?? 0 }}
      withArrow={isTrue(options.showArrow)}
      openDelay={number(options.delayDuration) ?? 700}
      defaultOpened={isTrue(options.defaultOpen)}
      middlewares={{ flip: avoid, shift: avoid }}
      events={{ hover: true, focus: true, touch: false }}
      withinPortal={target !== null}
      portalProps={{ target: target ?? undefined }}
      multiline
      classNames={{ tooltip: "gfui-Tooltip", arrow: "gfui-Tooltip-arrow" }}
    >
      {children}
    </MantineTooltip>
  );
}

export type TooltipProps = TooltipOptions & {
  text?: unknown;
  markdown?: unknown;
  tooltipTemplate?: TemplateRenderer;
  children?: ReactNode;
};

/** The Tooltip component (XMLUI Tooltip): one tooltip for its children. */
export function Tooltip(props: TooltipProps) {
  const markdown = text(props.markdown);
  const content = props.tooltipTemplate ? props.tooltipTemplate({}) : markdown !== undefined ? <Markdown content={markdown} /> : text(props.text);
  const anchor = <span className="gfui-TooltipAnchor">{props.children}</span>;
  if (content === undefined || content === null) return anchor;
  return (
    <TooltipView content={content} options={props}>
      {anchor}
    </TooltipView>
  );
}

/** `tooltip`, `tooltipMarkdown`, `tooltipOptions` (the tooltip behavior): a Tooltip around the component. */
export function TooltipBehavior({ tooltip, tooltipMarkdown, tooltipOptions, children }: { tooltip?: unknown; tooltipMarkdown?: unknown; tooltipOptions?: unknown; children?: ReactNode }) {
  const markdown = text(tooltipMarkdown);
  const content = markdown !== undefined ? <Markdown content={markdown} /> : text(tooltip);
  const anchor = <span className="gfui-TooltipAnchor">{children}</span>;
  if (content === undefined) return anchor;
  return (
    <TooltipView content={content} options={parseTooltipOptions(tooltipOptions)}>
      {anchor}
    </TooltipView>
  );
}

// --- toast() and confirm(): rendered by the App -----------------------------------------

/** The toasts (runtime `toasts`), mirrored into a Mantine notifications store of this App's own. */
function Toasts() {
  const [store] = useState(createNotificationsStore);
  const list = useSignal(toasts);
  const shown = useRef(new Map<string, number>());
  useEffect(() => {
    const ids = new Set(list.map((t) => t.id));
    for (const id of [...shown.current.keys()]) {
      if (ids.has(id)) continue;
      shown.current.delete(id);
      hideNotification(id, store);
    }
    for (const toast of list) {
      const version = shown.current.get(toast.id);
      if (version === toast.version) continue;
      shown.current.set(toast.id, toast.version);
      const data = notification(toast);
      if (version === undefined) showNotification(data, store);
      else updateNotification(data, store);
    }
  }, [list, store]);
  return <Notifications store={store} withinPortal={false} position="top-center" zIndex={400} limit={8} className="gfui-Toasts" />;
}

function notification(toast: Toast): NotificationData {
  return {
    id: toast.id,
    message: toast.message,
    loading: toast.kind === "loading",
    autoClose: toast.duration,
    withCloseButton: true,
    closeButtonProps: { "aria-label": "Close" },
    className: "gfui-Toast",
    "data-kind": toast.kind,
    role: toast.kind === "error" ? "alert" : "status",
    ...(toast.position ? { position: toast.position } : {}),
    // Closed by its timer or its close button (or hidden after a remove: then a no-op).
    onClose: () => removeToast(toast.id),
  } as NotificationData;
}

/** The pending `confirm()`s, one at a time (the runtime queue). */
function ConfirmHost() {
  const queue = useSignal(confirmQueue);
  const request = queue[0];
  // The last request stays on screen while the dialog fades out.
  const shown = useRef<ConfirmRequest | undefined>(undefined);
  if (request) shown.current = request;
  const view = shown.current;
  const topmost = useTopmostOverlay(request !== undefined);
  const answer = (ok: boolean) => {
    if (request) answerConfirm(request.id, ok);
  };
  return (
    <Modal
      opened={request !== undefined}
      onClose={() => answer(false)}
      title={view?.title}
      withinPortal={false}
      closeOnEscape={topmost}
      closeOnClickOutside={false}
      closeButtonProps={{ "aria-label": "Close" }}
      size={view?.width ?? "auto"}
      padding={0}
      transitionProps={{ duration: 150 }}
      zIndex={300}
      className="gfui-ModalDialog gfui-Confirm"
      classNames={{ content: "gfui-ModalDialog-content", header: "gfui-ModalDialog-header", title: "gfui-ModalDialog-title", body: "gfui-ModalDialog-body", overlay: "gfui-ModalDialog-overlay" }}
    >
      <Body className="gfui-ModalDialog-stack">
        <div className="gfui-Confirm-message">{view?.message}</div>
        <div className="gfui-Confirm-buttons" data-action-color={view?.actionThemeColor}>
          <span className="gfui-Confirm-cancel">
            <Button label={view?.cancelLabel} onClick={() => answer(false)} />
          </span>
          <span className="gfui-Confirm-action">
            <Button label={view?.actionLabel} onClick={() => answer(true)} data-autofocus="" />
          </span>
        </div>
      </Body>
    </Modal>
  );
}

/** The App's overlays of its own: the toasts and the confirmation dialog. */
export function AppOverlays() {
  return (
    <>
      <Toasts />
      <ConfirmHost />
    </>
  );
}
