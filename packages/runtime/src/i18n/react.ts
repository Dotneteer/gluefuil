// The locale in the component tree (step 34): a <Locale> provides its profile;
// components read the nearest one, else the app's (reactive, and the app's own
// locale in the server view, as currentLocale()).
import { createContext, useContext, useMemo } from "react";
import { useComputed } from "../reactivity/react";
import type { LocaleProfile } from "./format";
import { currentLocale, messagesSignature } from "./locale";
import { text } from "./messages";

export const LocaleProfileContext = createContext<LocaleProfile | undefined>(undefined);

/** The nearest <Locale>'s profile, else the app's current locale. */
export function useLocaleProfile(): LocaleProfile {
  const scoped = useContext(LocaleProfileContext);
  const locale = useComputed(() => currentLocale(), []);
  return useMemo(() => scoped ?? { locale }, [scoped, locale]);
}

/** A framework string (`gfui.*`) in the nearest locale: `const t = useFrameworkText(); t("gfui.form.save")`. */
export function useFrameworkText(): (key: string, vars?: Record<string, unknown>) => string {
  const scoped = useContext(LocaleProfileContext);
  // Re-render only when the messages would differ (the bundles behind the locale, or a new
  // bundle), not when only the locale's name does (en → en-US after a takeover).
  const signature = useComputed(() => messagesSignature(scoped?.locale ?? currentLocale()), [scoped]);
  return useMemo(
    () => (key: string, vars?: Record<string, unknown>) => text(key, vars, scoped?.locale ?? currentLocale()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, signature],
  );
}
