/**
 * Which titles have a prerendered page of their own – `/movie/<slug>` rather
 * than `/movie?id=<slug>` – and under which slug.
 *
 * The list is settled before the build compiles anything (`scripts/prebuild.mjs`
 * writes it, `next.config.ts` inlines it as `PRERENDERED_TITLE_IDS`), so this
 * module answers the same in the build and in the browser. That matters because
 * `routes.ts` asks it for every title link: the prerendered HTML and the
 * hydrating browser have to build the same href, or React finds markup it did
 * not write.
 *
 * The id alone does not say whether a link reaches the page: the file is written
 * under the slug the build made from the title's name that day, and a link built
 * from a name stored earlier – a watchlist entry saved before TMDB renamed the
 * film – names a file that does not exist. So each id carries a short hash of
 * its slug, and a link takes the path only when its own slug hashes the same.
 * Two base-36 characters are 1,296 values: a renamed title is told apart from
 * the build's name all but once in 1,296, and that once costs what every
 * mismatch used to – a 404 that `LegacyPathRedirect` sends on to the query page.
 *
 * The encoding is compact because it ships in the bundle: per kind, the titles
 * sorted by id, each as the base-36 gap from the previous id followed by its
 * two-character slug hash, joined by `.`, and the three kinds joined by `|` in
 * the order of `KINDS`. About 1,200 titles come to roughly six kilobytes.
 */

export type PrerenderedKind = "movie" | "tv" | "person";

export const KINDS: readonly PrerenderedKind[] = ["movie", "tv", "person"];

export interface PrerenderedEntry {
  id: number;
  slug: string;
}

const HASH_WIDTH = 2;
const HASH_SPACE = 36 ** HASH_WIDTH;

/**
 * A slug's fingerprint: FNV-1a over its UTF-16 code units, folded into
 * `HASH_WIDTH` base-36 characters. Deterministic in Node and every browser,
 * which is all the build and the hydrating page need to agree on.
 */
export function slugHash(slug: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % HASH_SPACE).toString(36).padStart(HASH_WIDTH, "0");
}

/** Titles → the `PRERENDERED_TITLE_IDS` string. Used by `next.config.ts`. */
export function encodePrerenderedTitles(
  titles: Record<PrerenderedKind, readonly PrerenderedEntry[]>,
): string {
  return KINDS.map((kind) => {
    // One entry per id, the first one listed – as `prebuild.mjs` keeps them.
    const byId = new Map<number, string>();
    for (const { id, slug } of titles[kind]) {
      if (!byId.has(id)) byId.set(id, slug);
    }

    let previous = 0;
    return [...byId]
      .sort(([a], [b]) => a - b)
      .map(([id, slug]) => {
        const gap = id - previous;
        previous = id;
        return `${gap.toString(36)}${slugHash(slug)}`;
      })
      .join(".");
  }).join("|");
}

/** The string → each kind's ids, mapped to the hash of the slug built for each. */
export function decodePrerenderedTitles(
  encoded: string,
): Record<PrerenderedKind, Map<number, string>> {
  const parts = encoded.split("|");
  return Object.fromEntries(
    KINDS.map((kind, index) => {
      let previous = 0;
      const titles = new Map<number, string>();
      for (const entry of (parts[index] ?? "").split(".")) {
        if (entry.length <= HASH_WIDTH) continue;
        previous += parseInt(entry.slice(0, -HASH_WIDTH), 36);
        titles.set(previous, entry.slice(-HASH_WIDTH));
      }
      return [kind, titles];
    }),
  ) as Record<PrerenderedKind, Map<number, string>>;
}

let decoded: {
  raw: string;
  titles: Record<PrerenderedKind, Map<number, string>>;
} | null = null;

/**
 * Whether the build wrote a page of its own for this title, under this slug.
 *
 * `slug` is the whole path segment – `fight-club-550`, or a bare `12345` for a
 * name with no Latin letters in it, which is what `createSlug` makes of one.
 */
export function hasPrerenderedPage(
  kind: PrerenderedKind,
  id: number,
  slug: string,
): boolean {
  // Read literally, every time: the bundler replaces this exact expression, and
  // a test can stub the variable between calls.
  const raw = process.env.PRERENDERED_TITLE_IDS ?? "";
  if (decoded?.raw !== raw) decoded = { raw, titles: decodePrerenderedTitles(raw) };
  const hash = decoded.titles[kind].get(id);
  return hash !== undefined && hash === slugHash(slug);
}

/**
 * Which of those titles also have a "movies like this" page – `/movies-like/
 * <slug>`, `/shows-like/<slug>`.
 *
 * Not all of them: that page is worth building for the titles people ask the
 * question about, and each one is disk the title pages are already competing
 * for (see `LIKE_PAGE_LIMITS`). So it is a second list, inlined beside the
 * first as `LIKE_PAGE_TITLE_IDS`: per kind, the ids sorted, each as the base-36
 * gap from the one before, joined by `.`; films then series, joined by `|`.
 * No slug hash of its own – a like page is written under the title page's slug,
 * so the question is asked only once that one has answered yes.
 */
export type LikePageKind = "movie" | "tv";

export const LIKE_PAGE_KINDS: readonly LikePageKind[] = ["movie", "tv"];

/** Ids → the `LIKE_PAGE_TITLE_IDS` string. Used by `next.config.ts`. */
export function encodeLikePageIds(
  ids: Record<LikePageKind, readonly number[]>,
): string {
  return LIKE_PAGE_KINDS.map((kind) => {
    let previous = 0;
    return [...new Set(ids[kind])]
      .sort((a, b) => a - b)
      .map((id) => {
        const gap = id - previous;
        previous = id;
        return gap.toString(36);
      })
      .join(".");
  }).join("|");
}

export function decodeLikePageIds(
  encoded: string,
): Record<LikePageKind, Set<number>> {
  const parts = encoded.split("|");
  return Object.fromEntries(
    LIKE_PAGE_KINDS.map((kind, index) => {
      let previous = 0;
      const ids = new Set<number>();
      for (const entry of (parts[index] ?? "").split(".")) {
        const gap = parseInt(entry, 36);
        if (!Number.isSafeInteger(gap) || gap <= 0) continue;
        previous += gap;
        ids.add(previous);
      }
      return [kind, ids];
    }),
  ) as Record<LikePageKind, Set<number>>;
}

let decodedLikePages: {
  raw: string;
  ids: Record<LikePageKind, Set<number>>;
} | null = null;

/**
 * Whether the build wrote a "like this" page for this title, under this slug.
 * False for a slug the title page was not written under, for the same reason
 * `hasPrerenderedPage` is: the file is named by the slug.
 */
export function hasLikePage(kind: LikePageKind, id: number, slug: string): boolean {
  if (!hasPrerenderedPage(kind, id, slug)) return false;
  const raw = process.env.LIKE_PAGE_TITLE_IDS ?? "";
  if (decodedLikePages?.raw !== raw) {
    decodedLikePages = { raw, ids: decodeLikePageIds(raw) };
  }
  return decodedLikePages.ids[kind].has(id);
}
