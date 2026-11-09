/**
 * The titles that get a prerendered page, with the slug each one is built at.
 *
 * Server-only: it reads the list `scripts/prebuild.mjs` wrote, for
 * `generateStaticParams` and the sitemap. The same file is what
 * `next.config.ts` inlined into the bundle as ids, so the pages built here are
 * exactly the ones `routes.ts` links to by path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSlug } from "./utils";
import type { PrerenderedKind } from "./prerendered-titles";

export interface PrerenderedTitle {
  id: number;
  slug: string;
}

let cached: Record<PrerenderedKind, PrerenderedTitle[]> | null = null;

export function prerenderedTitles(kind: PrerenderedKind): PrerenderedTitle[] {
  if (!cached) {
    let list: Partial<Record<PrerenderedKind, { id: number; name: string }[]>> = {};
    try {
      list = JSON.parse(
        readFileSync(
          join(process.cwd(), ".next/cache/prerendered-titles.json"),
          "utf8",
        ),
      );
    } catch {
      // No list: `next dev`, or a build without `npm run build`'s prebuild.
    }
    // `next.config.ts` reads this too, and a config that throws stops every
    // build – so a list of the wrong shape counts as no list, entry by entry.
    const toTitles = (entries: unknown) =>
      (Array.isArray(entries) ? entries : [])
        .filter(
          (entry): entry is { id: number; name: string } =>
            Number.isSafeInteger(entry?.id) &&
            entry.id > 0 &&
            typeof entry.name === "string",
        )
        .map(({ id, name }) => ({ id, slug: createSlug(name, id) }));
    cached = {
      movie: toTitles(list.movie),
      tv: toTitles(list.tv),
      person: toTitles(list.person),
    };
  }
  return cached[kind];
}

/**
 * Every prerendered slug of one kind, as `generateStaticParams` returns them.
 *
 * Never empty. A static export refuses a dynamic route whose
 * `generateStaticParams` lists nothing – the build fails outright – so a build
 * with no list (CI has no TMDB token) still emits one page from `fallback`. The
 * page has no snapshot to render and is `noindex`; nothing links to it, because
 * the bundle's id list is empty too.
 */
export function prerenderedTitleParams(
  kind: PrerenderedKind,
  fallback: string,
): { slug: string }[] {
  const titles = prerenderedTitles(kind);
  return titles.length > 0
    ? titles.map(({ slug }) => ({ slug }))
    : [{ slug: fallback }];
}
