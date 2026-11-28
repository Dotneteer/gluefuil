// App-level theming and the <Theme> element (step 17). The engine compiles the
// active theme and tone (runtime theme state) to CSS custom properties.
import { activeThemeId, activeThemeTone, computed, currentLocale, errorAnnouncement, inServerView, watch, registerLocaleBundles, setLocaleDefaults, setStaticDocument, textDirection, useComputed, navDrawerOpen, navPanelCollapsed, registerAppErrors, setNavigationHandlers, setRoutingMode, setThemeDefaults, useSignal, type AppErrorHandler, type TemplateRenderer } from "@gluefuil/runtime";
import { DirectionContext, MantineProvider } from "@mantine/core";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AppInfoContext } from "./app-info";
import { HeadingRegistry, HeadingRegistryContext } from "./toc";
import { MANTINE_STYLESHEET, MANTINE_STYLESHEET_HREF } from "./mantine";
import { OverlayLayer, OverlayLayerProvider } from "./overlay-context";
import { AppOverlays } from "./overlays";
import { componentMetadata, componentThemeDefaults } from "./metadata";
import { appLogo, appLogoUrl, needsGeneratedHeader, Shell, shellAttributes, type ShellConfig } from "./shell";
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

/**
 * The root of an app: the theme and tone, and the shell (shell.tsx) around the
 * content. The compiler passes the regions (`$$header`, `$$nav`, `$$footer`)
 * and their settings (`$$shell`).
 */
export function App({
  name,
  defaultTheme,
  defaultTone,
  useHashBasedRouting,
  scroll,
  logo,
  "logo-light": logoLight,
  "logo-dark": logoDark,
  logoTemplate,
  $$header,
  $$nav,
  $$footer,
  $$shell,
  onWillNavigate,
  onDidNavigate,
  onError,
  locale,
  defaultLocale,
  localeBundles,
  direction,
  children,
}: {
  name?: unknown;
  defaultTheme?: unknown;
  defaultTone?: unknown;
  useHashBasedRouting?: unknown;
  scroll?: unknown;
  logo?: unknown;
  "logo-light"?: unknown;
  "logo-dark"?: unknown;
  logoTemplate?: TemplateRenderer;
  $$header?: ReactNode;
  $$nav?: ReactNode;
  $$footer?: ReactNode;
  $$shell?: ShellConfig;
  /** `willNavigate` (step 21): resolves to the handler's result; `false` cancels the navigation. */
  onWillNavigate?: (to: string, queryParams: Readonly<Record<string, string>>) => unknown;
  onDidNavigate?: (to: string, queryParams: Readonly<Record<string, string>>) => unknown;
  /** Step 33: the errors nothing else handled; `(error, event)`, false or `event.preventDefault()` suppresses the default report. */
  onError?: AppErrorHandler;
  /** Step 34: the app's locale (wins over the user's choice), the fallback, the bundles, the text direction. */
  locale?: unknown;
  defaultLocale?: unknown;
  localeBundles?: unknown;
  direction?: unknown;
  children?: ReactNode;
}) {
  // Routing mode (step 19): hash-based unless explicitly false.
  setRoutingMode(useHashBasedRouting === false || useHashBasedRouting === "false" ? "browser" : "hash");
  // Navigation events (step 21). Registered after commit: never in a server render.
  useLayoutEffect(
    () => setNavigationHandlers({ willNavigate: onWillNavigate, didNavigate: onDidNavigate }),
    [onWillNavigate, onDidNavigate],
  );
  // Step 33: the App's error sink (App.errors, onError, the default report), read through a ref so it stays registered.
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  useLayoutEffect(() => registerAppErrors(() => errorHandler.current), []);
  // Step 34: the locale and the bundles, before the children render (and in a server render).
  setLocaleDefaults(locale, defaultLocale);
  useBundles(localeBundles);
  // The App re-renders only when the direction changes (the layout changes then anyway): a
  // re-render after a takeover that switches only the locale's name (en → en-US) would reach
  // Suspense boundaries that are still dehydrated (Markdown's), and React would drop their HTML.
  const explicitDirection = direction === "ltr" || direction === "rtl" ? direction : undefined;
  const dir = useComputed(() => explicitDirection ?? textDirection(currentLocale()), [explicitDirection]);
  // The prerender writes them on <html> (a no-op outside a static render).
  setStaticDocument(inServerView(() => currentLocale()), dir);
  useLayoutEffect(() => {
    document.documentElement.dir = dir;
  }, [dir]);
  // `lang` follows the locale without a re-render: set on the App's root and on <html>.
  useLayoutEffect(() => {
    const locale = computed(() => currentLocale());
    const apply = () => {
      const lang = locale.peek();
      document.documentElement.lang = lang;
      root.current?.setAttribute("lang", lang);
    };
    apply();
    return watch(locale, apply);
  }, []);
  const mantineDirection = useMemo(() => ({ dir, setDirection: () => {}, toggleDirection: () => {} }), [dir]);
  // Before reading the state, so this render (and a server render) uses them.
  setThemeDefaults(typeof defaultTheme === "string" ? defaultTheme : undefined, typeof defaultTone === "string" ? defaultTone : undefined);
  const { tone, style } = useActiveTheme();
  const shell: ShellConfig = $$shell ?? { scroll: typeof scroll === "string" ? scroll : "page" };
  const root = useRef<HTMLDivElement>(null);
  const overlays = useRef<HTMLDivElement>(null);
  const collapsed = useSignal(navPanelCollapsed);
  const drawerOpen = useSignal(navDrawerOpen);
  // A generated header (shell.tsx) shows on wide screens only when the nav lives in it.
  const headerShown = $$header !== undefined || (needsGeneratedHeader(shell, false) && shell.nav?.placement === "header");
  const attributes = shellAttributes(shell, headerShown, collapsed, drawerOpen);
  // Step 32: the name (PageMetaTitle's suffix), the logo (Logo), the headings (TableOfContents).
  const logoUrl = appLogoUrl(tone, logo, logoLight, logoDark);
  const appName = typeof name === "string" && name !== "" ? name : undefined;
  const info = useMemo(() => ({ name: appName, logoUrl }), [appName, logoUrl]);
  const [headings] = useState(() => new HeadingRegistry());
  return (
    // data-mantine-color-scheme: Mantine's tone selectors match below the app,
    // also in a server render (no script has to set it on <html> first).
    <div ref={root} className="gfui-App" dir={dir} data-tone={tone} data-mantine-color-scheme={tone} style={style} {...attributes}>
      <style href={MANTINE_STYLESHEET_HREF} precedence="gfui">
        {MANTINE_STYLESHEET}
      </style>
      <style href={BASE_STYLESHEET_HREF} precedence="gfui">
        {BASE_STYLESHEET}
      </style>
      {/* Mantine's variables and global classes come from MANTINE_STYLESHEET: no <style> elements of its own. */}
      <MantineProvider forceColorScheme={tone} withCssVariables={false} withGlobalClasses={false}>
        <DirectionContext.Provider value={mantineDirection}>
        <AppInfoContext.Provider value={info}>
        <HeadingRegistryContext.Provider value={headings}>
        <OverlayLayerProvider layer={overlays}>
          <Shell config={shell} header={$$header} nav={$$nav} footer={$$footer} logo={appLogo(tone, logo, logoLight, logoDark, logoTemplate)} root={root}>
            {children}
          </Shell>
          {/* Dialogs, menus and tooltips portal here; toasts and confirm() render here (step 27). */}
          <OverlayLayer layer={overlays}>
            <AppOverlays />
          </OverlayLayer>
          <ErrorAnnouncer />
        </OverlayLayerProvider>
        </HeadingRegistryContext.Provider>
        </AppInfoContext.Provider>
        </DirectionContext.Provider>
      </MantineProvider>
    </div>
  );
}

/**
 * Step 34: `localeBundles` registered while the App renders (so the first render
 * and a server render have them), again only when they change.
 */
function useBundles(bundles: unknown): void {
  const last = useRef<{ value: unknown; key: string } | undefined>(undefined);
  if (bundles === undefined || bundles === null) return;
  if (last.current?.value === bundles) return;
  let key: string;
  try {
    key = JSON.stringify(bundles);
  } catch {
    key = String(Math.random());
  }
  if (last.current?.key !== key) void registerLocaleBundles(bundles);
  last.current = { value: bundles, key };
}

/** Step 33: the default report's announcement, in an assertive live region (XMLUI's announceLiveRegion). */
function ErrorAnnouncer() {
  const { message } = useSignal(errorAnnouncement);
  return (
    <div className="gfui-ErrorAnnouncer" aria-live="assertive" aria-atomic="true">
      {message}
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
  const overlays = useRef<HTMLDivElement>(null);
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
    <div className="gfui-Theme" data-tone={ownTone} data-mantine-color-scheme={ownTone} style={{ display: "contents", ...(style as CSSProperties) }}>
      {/* Overlays opened inside a Theme portal into its own layer, so its variables apply (step 27). */}
      <OverlayLayerProvider layer={overlays}>{children}</OverlayLayerProvider>
      <OverlayLayer layer={overlays} />
    </div>
  );
}
