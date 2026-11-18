# Languages

The site is published in English, at the root, and in Czech, under `/cs`.
Each language is a tree of its own in `src/app`: `(en)/` and `cs/`, each with
its own root layout, so a Czech page is `<html lang="cs">` in its static HTML
and a search engine indexes the two separately (`hreflang` ties them together).

## Where the language comes from

| Code | How it gets the locale |
| --- | --- |
| Client Component | `useLocale()` / `useT()` from `@/i18n/LocaleProvider` |
| Server Component, page, layout | a `locale` prop or argument – the page file knows its tree |
| Plain module code in the browser (TMDB client, settings) | `currentLocale()` – the document's `lang` |
| Build-time TMDB loads | `currentLocale()` – the load runs inside its locale (`build-time-tmdb.ts`) |

A component with no `"use client"` that a page renders takes `locale?: Locale`
(default `"en"`) and uses `t(locale, en, cs)` from `@/i18n/locale`.

## Writing a string

Both languages sit side by side at the call site:

```tsx
const t = useT();
<button>{t("Add to watchlist", "Přidat na seznam")}</button>
```

- The English string stays exactly as it was – the tests read it.
- Counts go through `formatCount` / `pluralForm` (`@/i18n/format`): Czech has
  three forms – `1 film`, `2 filmy`, `5 filmů`.
- Numbers through `formatNumber(n, locale)`, dates through `INTL_LOCALE[locale]`
  (or `formatTmdbDate(date, options, locale)`), never a hard-coded `"en-US"`.
- A sentence with a link or markup in it: write each language's JSX whole
  (`locale === "cs" ? <>…</> : <>…</>`) rather than gluing fragments whose word
  order only works in English.
- A library function that returns words takes `locale: Locale = "en"` as its
  last parameter; the component passes its own.

## Links

Import `Link` from `@/i18n/Link`, never from `next/link`, and keep writing the
English path – `/movies`, `movieHref(slug)`. It becomes `/cs/movies` (or the
Czech tree's own page for a title) on a Czech page. Everything that is not a
`<Link>` does the same by hand:

- `router.push(href)` / `router.replace(href)` → `useLocalizeHref()(href)`
- a share link or canonical → `absoluteLocalizedUrl(path, locale)` /
  `absoluteMediaUrl(type, slug, locale)`
- `usePathname()` is `/cs/…` on a Czech page – compare `stripLocale(pathname)`.

## Czech style

- Address the visitor as *vy*, lower case: „Přidejte si film na seznam.“
- Past tense in the plural (*jste viděli*) so no sentence assumes a gender.
- Terms: watchlist → *seznam* (*Můj seznam*, *Přidat na seznam*); watched →
  *zhlédnuto*; TV show → *seriál*; season → *řada*; episode → *epizoda*; cast →
  *obsazení*; crew → *štáb*; streaming service → *streamovací služba*; rating →
  *hodnocení*; now playing → *V kinech*; upcoming → *Připravujeme*; top rated →
  *Nejlépe hodnocené*; trending → *Trendy*; daily puzzle → *denní hádanka*;
  streak → *série*; a user's own lists → *vlastní seznamy*.
- Brand names stay as they are: WatchList, TMDb, JustWatch, Netflix, Letterboxd.
- Czech quotation marks „…“ and an en dash – with spaces.
