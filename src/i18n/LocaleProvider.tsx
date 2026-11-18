"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { localizeHref } from "@/lib/routes";
import { DEFAULT_LOCALE, localeFromPathname, type Locale } from "./locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The page's language, for every Client Component under it.
 *
 * Set once by each tree's root layout. A context rather than a read of
 * `document.documentElement.lang`, because the prerender has no document: the
 * Czech HTML and the browser hydrating it only print the same strings if both
 * take the language from here.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

const noSubscription = () => () => {};

/**
 * For the one page both trees share: the 404. GitHub Pages serves a single
 * `404.html` for every path it has no file for, `/cs/…` included, so the page
 * is prerendered in English and switches to the path's language once it is
 * running – a re-render after hydration, which `useSyncExternalStore` makes
 * without a mismatch. The document's `lang` follows, because the TMDB client
 * and the settings store read the language from there.
 */
export function PathLocaleProvider({
  locale: prerendered,
  children,
}: {
  /** The language the page was prerendered in. */
  locale: Locale;
  children: ReactNode;
}) {
  const locale = useSyncExternalStore(
    noSubscription,
    () => localeFromPathname(window.location.pathname),
    () => prerendered,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/**
 * `t("Movies", "Filmy")`: the string in the page's language. Both languages
 * stay side by side at the call site – see `t` in `locale.ts`.
 */
export function useT(): (en: string, cs: string) => string {
  const locale = useLocale();
  return useCallback(
    (en: string, cs: string) => (locale === "cs" ? cs : en),
    [locale],
  );
}

/**
 * `localizeHref` bound to the page's language, for the hrefs that do not go
 * through `<Link>`: `router.push`, `router.replace`, a hand-built `<a>`.
 */
export function useLocalizeHref(): (href: string) => string {
  const locale = useLocale();
  return useCallback((href: string) => localizeHref(href, locale), [locale]);
}
