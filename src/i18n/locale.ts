/**
 * The languages the site is published in, and everything about one that is not
 * a translated string.
 *
 * English is the original and lives at the root (`/movies`); Czech is a second
 * tree under `/cs` (`/cs/movies`), with its own root layout so its HTML says
 * `<html lang="cs">` from the first byte. A static export has no server to
 * negotiate a language per request, so the language is the path – which is
 * also what lets a search engine index each one on its own.
 *
 * Isomorphic and React-free on purpose: the TMDB client, the settings store and
 * the link builders all need the locale from plain module code.
 */

export const LOCALES = ["en", "cs"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "cs";
}

/** What a locale puts in front of every path. English has none. */
export const LOCALE_PREFIX: Record<Locale, string> = { en: "", cs: "/cs" };

/** For `Intl`, `toLocaleString` and TMDB's `language` parameter. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", cs: "cs-CZ" };

/** Open Graph's `og:locale`. */
export const OG_LOCALE: Record<Locale, string> = { en: "en_US", cs: "cs_CZ" };

/**
 * The region a visitor who never chose one gets – the streaming catalogue and
 * release dates shown before they open the settings. A choice they made wins
 * in either language: the setting is shared by both trees.
 */
export const DEFAULT_REGION_FOR: Record<Locale, string> = { en: "US", cs: "CZ" };

/** The locale a path belongs to: `/cs` and everything under it is Czech. */
export function localeFromPathname(pathname: string): Locale {
  return pathname === "/cs" || pathname.startsWith("/cs/") ? "cs" : "en";
}

/**
 * The same path without its locale prefix – what the English site calls it.
 * `/cs/movies` is `/movies`, `/cs` is `/`; an English path is returned as is.
 */
export function stripLocale(pathname: string): string {
  if (pathname === "/cs") return "/";
  if (pathname.startsWith("/cs/")) return pathname.slice(3);
  return pathname;
}

/**
 * Where the locale comes from outside React.
 *
 * In the browser it is the document's own `lang`, which each root layout sets
 * in the static HTML – one page load is one language, since moving between the
 * trees is a full navigation. On the server there is no document; the build
 * installs a getter (`setServerLocaleGetter`) that reads the locale of the load
 * it is running, so a Czech page's snapshot is fetched in Czech while an
 * English one renders beside it in the same process.
 */
let serverLocaleGetter: (() => Locale | undefined) | null = null;

export function setServerLocaleGetter(getter: () => Locale | undefined): void {
  serverLocaleGetter = getter;
}

export function currentLocale(): Locale {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    return isLocale(lang) ? lang : DEFAULT_LOCALE;
  }
  return serverLocaleGetter?.() ?? DEFAULT_LOCALE;
}

/** Both languages' versions of one value. */
export type Localized<T = string> = Record<Locale, T>;

export function pick<T>(locale: Locale, value: Localized<T>): T {
  return value[locale];
}

/**
 * One string in the current language: `t(locale, "Movies", "Filmy")`.
 *
 * Both languages sit side by side at the call site rather than behind keys in a
 * dictionary: with two languages that is the shortest way to keep them in
 * step, and an English sentence changed without its Czech twin is visible in
 * the same diff.
 */
export function t(locale: Locale, en: string, cs: string): string {
  return locale === "cs" ? cs : en;
}
