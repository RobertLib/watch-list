/**
 * Run by npm before every `npm run build` (the `prebuild` script).
 *
 * Two jobs, both about what the build reads from TMDB.
 *
 * 1. Drop Next's fetch cache. During a static export Next keeps every `fetch`
 *    a Server Component made in `.next/cache/fetch-cache`, with a year's
 *    lifetime – and a later build reads those answers back instead of asking
 *    TMDB. That is exactly wrong for the snapshots `src/lib/build-time-tmdb.ts`
 *    takes: the scheduled deploy rebuilds daily so they are current, and a
 *    cache surviving between builds (a local checkout; a CI that caches
 *    `.next/cache`, as Next's own docs suggest) would quietly republish the
 *    first build's TMDB forever. Within one build the cache still does its job
 *    – the sitemap and the landing pages share their requests – it just starts
 *    empty.
 *
 * 2. Decide which titles get a prerendered page of their own – `/movie/<slug>`,
 *    `/tv/<slug>`, `/person/<slug>` – and write the list to
 *    `.next/cache/prerendered-titles.json`. It has to be settled before Next
 *    compiles anything, because the browser needs it too: a link to a title
 *    points at its path only when that page exists, and the server and the
 *    browser must agree on that or hydration finds different hrefs.
 *    `next.config.ts` reads the file and inlines the ids into the bundle;
 *    `src/lib/prerendered-titles-server.ts` reads the titles for
 *    `generateStaticParams` and the sitemap. One list per build, read by both.
 *
 * Which titles: the ones people search for by name. Most-voted is the closest
 * TMDB has to "well known", and it is stable from one day to the next; the
 * currently popular add this month's releases, with a vote floor so a burst of
 * regional traffic on something obscure does not buy it a page. The counts are
 * bounded by GitHub Pages' size limit – see `LIMITS`.
 *
 * Without a TMDB token – CI, a fresh checkout – the list is empty and the build
 * prerenders no titles; every title link stays on its query-string page. With a
 * token, a request that keeps failing fails the build: a deploy that silently
 * dropped every title page would otherwise go live.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";

const CACHE_DIR = new URL("../.next/cache/", import.meta.url);
const OUTPUT = new URL("prerendered-titles.json", CACHE_DIR);

/** Pages of twenty, per list. Raising these grows `out/` – see above. */
const LISTS = {
  movie: [
    { path: "/discover/movie", params: { sort_by: "vote_count.desc" }, pages: 30 },
    {
      path: "/discover/movie",
      params: { sort_by: "popularity.desc", "vote_count.gte": "150" },
      pages: 15,
    },
  ],
  tv: [
    { path: "/discover/tv", params: { sort_by: "vote_count.desc" }, pages: 15 },
    {
      path: "/discover/tv",
      params: { sort_by: "popularity.desc", "vote_count.gte": "100" },
      pages: 8,
    },
  ],
  // TMDB's popular people are noisy – a burst of regional traffic puts someone
  // at the top with no known work at all – so more are read than are kept, and
  // only people known for something widely seen get a page (see `keep`).
  person: [{ path: "/person/popular", params: {}, pages: 40 }],
};

/**
 * The most of each kind to keep, in list order.
 *
 * Sized against GitHub Pages' 1 GB: a prerendered title is about 360 KB on disk
 * (its HTML, and the three payload files Next writes beside it for client
 * navigation – most of that the page's shell, the rest the snapshot that
 * `src/lib/title-details.ts` cuts down), and the rest of the site is about
 * 120 MB. 1,225 titles come to roughly 560 MB, which leaves room to grow;
 * `scripts/postbuild.mjs` fails the build well before the limit.
 */
const LIMITS = { movie: 650, tv: 325, person: 250 };

/** Whether a list entry earns a page. Titles are vote-floored by their query. */
const keep = {
  movie: () => true,
  tv: () => true,
  person: (item) =>
    (item.known_for ?? []).some((work) => (work.vote_count ?? 0) >= 1000),
};

const MAX_IN_FLIGHT = 6;
const RETRIES = 4;

rmSync(new URL("fetch-cache", CACHE_DIR), { recursive: true, force: true });
mkdirSync(CACHE_DIR, { recursive: true });

// npm does not load `.env` for a script; Next's own loader reads the same files
// in the same order `next build` will, and the environment itself (CI's secret)
// still wins over all of them.
nextEnv.loadEnvConfig(new URL("..", import.meta.url).pathname, false);
const token = process.env.NEXT_PUBLIC_TMDB_API_TOKEN;

if (!token) {
  writeFileSync(OUTPUT, JSON.stringify({ movie: [], tv: [], person: [] }));
  console.log("prebuild: no TMDB token – no title pages will be prerendered.");
} else {
  const result = {};
  for (const [kind, lists] of Object.entries(LISTS)) {
    const requests = lists.flatMap(({ path, params, pages }) =>
      Array.from({ length: pages }, (_, i) => ({ path, params: { ...params, page: String(i + 1) } })),
    );
    const responses = await mapLimit(requests, MAX_IN_FLIGHT, ({ path, params }) =>
      tmdb(path, params),
    );

    // First occurrence wins, so the order is most-voted first, then popular.
    const seen = new Map();
    for (const response of responses) {
      for (const item of response.results ?? []) {
        const name = item.title ?? item.name;
        if (!seen.has(item.id) && typeof name === "string" && !item.adult && keep[kind](item)) {
          seen.set(item.id, { id: item.id, name });
        }
      }
    }
    result[kind] = [...seen.values()].slice(0, LIMITS[kind]);
  }

  writeFileSync(OUTPUT, JSON.stringify(result));
  console.log(
    `prebuild: prerendering ${result.movie.length} films, ${result.tv.length} series and ${result.person.length} people.`,
  );
}

async function tmdb(path, params) {
  const url = `https://api.themoviedb.org/3${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (attempt >= RETRIES) throw new Error(`prebuild: ${url} failed`, { cause: error });
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response.json();
    if (attempt >= RETRIES || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`prebuild: ${url} answered ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
