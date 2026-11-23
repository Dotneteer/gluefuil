// The App shell's state (steps 19A–19C): whether the side nav is collapsed to
// icons, and whether the nav drawer is open (small screens). App-wide, one
// state per page, like the theme state. The app globals navPanelCollapsed,
// setNavPanelCollapsed, navDrawerOpen and setNavDrawerOpen expose it to
// script. Design: .ai/plan/poc-19a-app-shell.md

import { signal, type ReadonlySignal } from "../reactivity/signals";

const collapsed = signal(false);
const drawerOpen = signal(false);

/** Whether the side nav shows icons only (`NavPanel collapsible`). */
export const navPanelCollapsed: ReadonlySignal<boolean> = collapsed;

/** Whether the nav drawer is open (below the NavPanel's `drawerBelow` breakpoint). */
export const navDrawerOpen: ReadonlySignal<boolean> = drawerOpen;

export function setNavPanelCollapsed(value: unknown): void {
  collapsed.set(value === true || value === "true");
}

export function setNavDrawerOpen(value: unknown): void {
  drawerOpen.set(value === true || value === "true");
}

/** Back to the initial state (tests). */
export function resetShellState(): void {
  collapsed.set(false);
  drawerOpen.set(false);
}
