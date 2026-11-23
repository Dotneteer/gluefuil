// App-level theming and the <Theme> element (step 17). The engine compiles the
// active theme and tone (runtime theme state) to CSS custom properties.
import { activeThemeId, activeThemeTone, setRoutingMode, setThemeDefaults, useSignal } from "@patchfuil/runtime";
import { MantineProvider } from "@mantine/core";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { MANTINE_STYLESHEET, MANTINE_STYLESHEET_HREF } from "./mantine";
import { componentMetadata, componentThemeDefaults } from "./metadata";
import { BASE_STYLESHEET, BASE_STYLESHEET_HREF } from "./styles";
import { compileTheme, scopedThemeVars, type Tone } from "./theming/engine";
import { BUILT_IN_THEME_MAP } from "./theming/themes";

const COMPONENT_DEFAULTS = componentThemeDefaults(componentMetadata);

const asTone = (tone: string): Tone => (tone === "dark" ? "dark" : "light");

/** The active theme's variables, as inline custom properties. */
function useActiveTheme(): { themeId: string; tone: Tone; style: CSSProperties } {
  const themeId = useSignal(activeThemeId);
  const tone = asTone(useSignal(activeThemeTone));
  const style = useMemo(
    () => compileTheme({ themeId, tone, themes: BUILT_IN_THEME_MAP, componentDefaults: COMPONENT_DEFAULTS }) as CSSProperties,
    [themeId, tone],
  );
  return { themeId, tone, style };
}

export function App({
  defaultTheme,
  defaultTone,
  useHashBasedRouting,
  children,
}: {
  defaultTheme?: unknown;
  defaultTone?: unknown;
  useHashBasedRouting?: unknown;
  children?: ReactNode;
}) {
  // Routing mode (step 19): hash-based unless explicitly false.
  setRoutingMode(useHashBasedRouting === false || useHashBasedRouting === "false" ? "browser" : "hash");
  // Before reading the state, so this render (and a server render) uses them.
  setThemeDefaults(typeof defaultTheme === "string" ? defaultTheme : undefined, typeof defaultTone === "string" ? defaultTone : undefined);
  const { tone, style } = useActiveTheme();
  return (
    // data-mantine-color-scheme: Mantine's tone selectors match below the app,
    // also in a server render (no script has to set it on <html> first).
    <div className="pfui-App" data-tone={tone} data-mantine-color-scheme={tone} style={style}>
      <style href={MANTINE_STYLESHEET_HREF} precedence="pfui">
        {MANTINE_STYLESHEET}
      </style>
      <style href={BASE_STYLESHEET_HREF} precedence="pfui">
        {BASE_STYLESHEET}
      </style>
      {/* Mantine's variables and global classes come from MANTINE_STYLESHEET: no <style> elements of its own. */}
      <MantineProvider forceColorScheme={tone} withCssVariables={false} withGlobalClasses={false}>
        {children}
      </MantineProvider>
    </div>
  );
}

/**
 * `<Theme tone="dark" backgroundColor-Button="red">`: theme variables, a tone
 * or another theme for its children. It recompiles the full set when the
 * theme, the tone or a base variable changes, else injects only the overrides.
 */
export function Theme({ themeId, tone, children, ...overrides }: { themeId?: unknown; tone?: unknown; children?: ReactNode } & Record<string, unknown>) {
  const active = useActiveTheme();
  const ownTheme = typeof themeId === "string" ? themeId : undefined;
  const ownTone = typeof tone === "string" ? asTone(tone) : undefined;
  const values = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  const key = JSON.stringify(values);
  const style = useMemo(
    () =>
      scopedThemeVars({
        themeId: ownTheme ?? active.themeId,
        tone: ownTone ?? active.tone,
        themes: BUILT_IN_THEME_MAP,
        componentDefaults: COMPONENT_DEFAULTS,
        overrides: values,
        changesThemeOrTone: ownTheme !== undefined || ownTone !== undefined,
      }),
    // `values` is captured through its serialized key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownTheme, ownTone, active.themeId, active.tone, key],
  );
  return (
    <div className="pfui-Theme" data-tone={ownTone} data-mantine-color-scheme={ownTone} style={{ display: "contents", ...(style as CSSProperties) }}>
      {children}
    </div>
  );
}
