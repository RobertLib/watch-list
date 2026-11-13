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
 * Which people: the ones those titles credit most often – their top-billed
 * cast, directors, writers and creators (`prerender-people.mjs`). That costs a
 * request per chosen title, here, before the build makes the same request
 * again for the page; a minute of the build, for person pages the title pages
 * actually link to.
 *
 * Without a TMDB token – CI, a fresh checkout – the list is empty and the build
 * prerenders no titles; every title link stays on its query-string page. With a
 * token, a request that keeps failing fails the build: a deploy that silently
 * dropped every title page would otherwise go live.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { rankPeople } from "./prerender-people.mjs";

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
};

/**
 * The most of each kind to keep: titles in list order, people most-credited
 * first.
 *
 * Sized against GitHub Pages' 1 GB. Measured on a build: a prerendered title is
 * about 270 KB on disk and a person about 260 KB (the HTML, and the payload
 * files Next writes beside it for client navigation – most of that the page's
 * shell, the rest the snapshot that `src/lib/title-details.ts` cuts down), a
 * "movies like this" page about 190 KB (`LIKE_PAGE_LIMITS`), and everything
 * else – genres, moods, their platform landings, the app – about 120 MB. With
 * these limits the whole site is roughly 665 MB, which leaves room to grow;
 * `scripts/postbuild.mjs` fails the build well before the limit.
 *
 * The people are the ones worth raising first. Six hundred of them are who
 * the prerendered titles credit on four or more of their pages; a title page
 * links to about a dozen people prominently and, at this limit, a third of
 * those links reach a prerendered page rather than the `noindex` shell. At 250
 * it was one in six.
 */
const LIMITS = { movie: 650, tv: 325, person: 600 };


const MAX_IN_FLIGHT = 6;
const RETRIES = 4;
/**
 * The longest `Retry-After` honoured. TMDB's rate limit clears in seconds; a
 * value of minutes or hours (a misbehaving proxy, a date in the far future)
 * would otherwise hold the whole build – and the deploy behind it – for that
 * long, where waiting the cap and retrying fails it in good time instead.
 */
const MAX_RETRY_AFTER_MS = 60_000;

rmSync(new URL("fetch-cache", CACHE_DIR), { recursive: true, force: true });
mkdirSync(CACHE_DIR, { recursive: true });

// npm does not load `.env` for a script; Next's own loader reads the same files
// in the same order `next build` will, and the environment itself (CI's secret)
// still wins over all of them.
// `fileURLToPath`, not `.pathname`: the latter stays percent-encoded – a
// checkout under "My Projects" became `My%20Projects`, a directory with no
// `.env` in it, and the build quietly prerendered no titles.
nextEnv.loadEnvConfig(fileURLToPath(new URL("..", import.meta.url)), false);
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
        if (!seen.has(item.id) && typeof name === "string" && !item.adult) {
          seen.set(item.id, { id: item.id, name });
        }
      }
    }
    result[kind] = [...seen.values()].slice(0, LIMITS[kind]);
  }

  // The people, from the credits of the titles just chosen. A title TMDB
  // answers 404 for – removed in the minutes since it was listed – simply
  // credits nobody; any other failure fails the build like the lists above.
  const credited = await mapLimit(
    [
      ...result.movie.map(({ id }) => ({ path: `/movie/${id}/credits`, series: false })),
      ...result.tv.map(({ id }) => ({ path: `/tv/${id}`, series: true })),
    ],
    MAX_IN_FLIGHT,
    async ({ path, series }) => {
      const answer = await tmdb(
        path,
        series ? { append_to_response: "credits" } : {},
        { missingIsNull: true },
      );
      if (!answer) return {};
      return series
        ? { ...(answer.credits ?? {}), createdBy: answer.created_by }
        : answer;
    },
  );
  result.person = rankPeople(credited, LIMITS.person);

  writeFileSync(OUTPUT, JSON.stringify(result));
  console.log(
    `prebuild: prerendering ${result.movie.length} films, ${result.tv.length} series and ${result.person.length} people.`,
  );
}

async function tmdb(path, params, { missingIsNull = false } = {}) {
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
    if (response.status === 404 && missingIsNull) return null;
    if (attempt >= RETRIES || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`prebuild: ${url} answered ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : 500 * 2 ** attempt,
    );
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
