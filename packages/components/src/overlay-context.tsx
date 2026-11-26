// What overlays share (step 27, .ai/plan/poc-27-overlays.md): the layer they
// render into, the stack that decides which one Escape closes, and the dialog
// host a Form inside a ModalDialog talks to. Separate from overlays.tsx so
// forms.tsx and theme.tsx can use it without importing the overlay components.

import { signal, useSignal } from "@gluefuil/runtime";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// --- The overlay layer ------------------------------------------------------------------

const LayerContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

/**
 * The element overlays portal into: a fixed, zero-size layer inside the App (or
 * the nearest Theme), so theme variables and the tone apply to dialogs and
 * menus, and they take no place in the page's layout. `children` render inside
 * the layer (the App's toasts and confirmations), after the portal target, so
 * they stack above what portals there.
 */
export function OverlayLayer({ layer, children }: { layer: RefObject<HTMLDivElement | null>; children?: ReactNode }) {
  return (
    <div className="gfui-Overlays">
      <div ref={layer} className="gfui-Overlays-target" />
      {children}
    </div>
  );
}

/** Gives the layer to the overlays below (App, Theme). */
export function OverlayLayerProvider({ layer, children }: { layer: RefObject<HTMLDivElement | null>; children?: ReactNode }) {
  return <LayerContext.Provider value={layer}>{children}</LayerContext.Provider>;
}

/**
 * The element to portal into, known after mount (null in a server render and in
 * the first client render: an overlay opens once it is known). Outside an App:
 * the body. React attaches refs in tree order while it commits, and the layer
 * comes after the content, so a layout effect of the content may run before
 * the layer's ref is set: the passive effect, which runs after every ref is
 * attached, settles it.
 */
export function useOverlayTarget(): HTMLElement | null {
  const layer = useContext(LayerContext);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (layer?.current) setTarget(layer.current);
  }, [layer]);
  useEffect(() => {
    setTarget(layer?.current ?? document.body);
  }, [layer]);
  return target;
}

// --- Which overlay Escape closes --------------------------------------------------------

const openStack = signal<readonly number[]>([]);
let nextOverlayId = 0;

/**
 * Registers an open overlay; true while it is the topmost one. Mantine's modals
 * all listen for Escape on the window, so without this a confirmation over a
 * dialog would close both: only the topmost gets `closeOnEscape`.
 */
export function useTopmostOverlay(open: boolean): boolean {
  const id = useRef(0);
  if (id.current === 0) id.current = ++nextOverlayId;
  useLayoutEffect(() => {
    if (!open) return undefined;
    const own = id.current;
    openStack.set([...openStack.peek(), own]);
    return () => openStack.set(openStack.peek().filter((x) => x !== own));
  }, [open]);
  const stack = useSignal(openStack);
  return open && stack[stack.length - 1] === id.current;
}

// --- A Form inside a ModalDialog --------------------------------------------------------

/** What a ModalDialog offers the Forms inside it (XMLUI's ModalVisibilityContext). */
export interface DialogHost {
  /** Closes the dialog as its close button does (willClose and the dirty question apply). */
  requestClose(): Promise<void>;
  /** A form's dirty state, which counts as the dialog's. */
  setFormDirty(form: object, dirty: boolean): void;
  /** The form is gone. */
  removeForm(form: object): void;
}

export const DialogContext = createContext<DialogHost | null>(null);

export function useDialogHost(): DialogHost | null {
  return useContext(DialogContext);
}
