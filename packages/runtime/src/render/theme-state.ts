// The active theme and tone (step 17): app-wide state behind the app globals
// activeThemeId, activeThemeTone, setTheme, setThemeTone, toggleThemeTone
// (XMLUI globals.md). The theme engine itself lives in the components package;
// the runtime only holds the choice. One state per page, like the app globals.

import { computed, signal, type ReadonlySignal } from "../reactivity/signals";

const explicitTheme = signal<string | undefined>(undefined);
const explicitTone = signal<string | undefined>(undefined);
const defaultTheme = signal("gfui");
const defaultTone = signal("light");

/** The active theme ID: set by `setTheme`, else the app's default. */
export const activeThemeId: ReadonlySignal<string> = computed(() => explicitTheme.get() ?? defaultTheme.get());

/** The active tone (`"light"` or `"dark"`): set by `setThemeTone`, else the app's default. */
export const activeThemeTone: ReadonlySignal<string> = computed(() => explicitTone.get() ?? defaultTone.get());

export function setTheme(themeId: unknown): void {
  explicitTheme.set(String(themeId));
}

export function setThemeTone(tone: unknown): void {
  if (tone !== "light" && tone !== "dark") throw new Error(`setThemeTone: the tone must be "light" or "dark", not ${JSON.stringify(tone)}`);
  explicitTone.set(tone);
}

export function toggleThemeTone(): void {
  explicitTone.set(activeThemeTone.peek() === "dark" ? "light" : "dark");
}

/**
 * The app's defaults (`App defaultTheme` / `defaultTone`). Called while the App
 * renders, so the first render (and a server render) already uses them.
 */
export function setThemeDefaults(theme: string | undefined, tone: string | undefined): void {
  if (theme !== undefined && defaultTheme.peek() !== theme) defaultTheme.set(theme);
  if (tone !== undefined && defaultTone.peek() !== tone) defaultTone.set(tone);
}

/** Forgets explicit choices and defaults (tests). */
export function resetThemeState(): void {
  explicitTheme.set(undefined);
  explicitTone.set(undefined);
  defaultTheme.set("gfui");
  defaultTone.set("light");
}
