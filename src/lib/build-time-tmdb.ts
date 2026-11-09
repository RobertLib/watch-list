/**
 * TMDB, read once while the site is being built.
 *
 * The pages are still a static export: nothing here runs when a visitor asks for
 * a page. It runs during `next build`, in the Server Components of the routes
 * whose parameters the build can enumerate – genres, genre landings per
 * platform, moods, the best-known titles and people – and of the home page and
 * the `/movies`, `/tv-shows` and `/people` listings, and what it returns is
 * written into their HTML. A crawler
 * then reads real titles and links where it used to read a skeleton, and a
 * visitor sees the listing before a single request leaves their browser; the
 * browser still loads the listing for its own region straight after, and
 * replaces the snapshot with that (see `useAsyncData`'s placeholder).
 *
 * The snapshot is as fresh as the last deployment, which is why the deploy
 * workflow rebuilds on a daily schedule as well as on every push.
 *
 * Imported only by Server Components and metadata routes. The loaders it calls
 * are the same ones the browser uses – `loadGenreListing`, `loadMoodPicks` –
 * which run on the server unchanged: the settings they read fall back to their
 * defaults (region US, every platform) where there is no `localStorage`, and
 * that is exactly the view a first-time visitor gets.
 */

import { cache } from "react";
import {
  loadGenreListing,
  type GenreListingPage,
} from "./genre-listing-data";
import { loadMoodPicks, type MoodPicksPage } from "./mood-data";
import { parseDiscoverFilters } from "./discover-filters";
import { findStreamingPlatform } from "./streaming-landing";
import { findMood } from "./moods";
import { HOME_ROWS, loadHomeRow, type HomeRow } from "./home-rows";
import {
  MOVIE_SECTIONS,
  TV_SECTIONS,
  loadPopularPeople,
  type MovieSectionsSnapshot,
  type TVSectionsSnapshot,
} from "./listing-sections";
import { tmdbApi } from "./tmdb";
import {
  MOVIE_APPENDED_SECTIONS,
  TV_APPENDED_SECTIONS,
  loadPersonPage,
  movieSnapshot,
  personSnapshot,
  tvSnapshot,
  type PersonPageData,
} from "./title-details";
import type {
  MediaItem,
  MediaType,
  MovieDetails,
  Person,
  TVShowDetails,
} from "@/types/tmdb";

/**
 * Whether this build can read TMDB at all.
 *
 * CI builds without the token, on purpose – it lints, typechecks and tests, and
 * needs no secret for that – so every loader below answers `null` there and the
 * pages fall back to what they were before: a shell the browser fills in. The
 * deploy workflow refuses to build without the token, so a deployment always
 * has the snapshots.
 */
export function buildTimeTmdbAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TMDB_API_TOKEN);
}

/**
 * How many loads one build worker runs at once.
 *
 * Next renders pages in a worker per CPU, several at a time in each, and a
 * thousand title pages asking TMDB all at once is a wall of 429s: the browser's
 * own limit (`MAX_IN_FLIGHT` in `tmdb-cache.ts`) is per process, and there are
 * as many processes as cores. A few per worker keeps a nine-worker laptop and a
 * three-worker CI runner both well under TMDB's rate.
 */
const LOADS_PER_WORKER = 3;

/**
 * Attempts per load, a second apart and doubling. The transport already
 * retries quickly (`fetch-with-retry.ts`); this is the slower, patient retry a
 * build can afford and a visitor could not, for a rate limit that outlasts it.
 */
const ATTEMPTS = 5;

let running = 0;
const queue: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= LOADS_PER_WORKER) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    queue.shift()?.();
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /TMDB API error: 404\b/.test(error.message);
}

/**
 * Run one build-time load, or fail the build with a message that says which.
 *
 * Failing is deliberate. A deployment that silently lost its snapshots would
 * still build, still pass, and serve skeletons to every crawler until somebody
 * noticed – while a failed build leaves the previous deployment in place, and
 * the next scheduled run tries again.
 */
async function buildTimeLoad<T>(
  what: string,
  load: () => Promise<T>,
  { missingIsNull = false }: { missingIsNull?: boolean } = {},
): Promise<T | null> {
  if (!buildTimeTmdbAvailable()) return null;

  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Jittered, so workers that were refused together do not return together.
      const delay = 1000 * 2 ** (attempt - 1) * (0.75 + Math.random() / 2);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await withSlot(load);
    } catch (error) {
      lastError = error;
      // A 404 is an answer, and asking again will not change it.
      if (isNotFound(error)) {
        // For a title it means the title left TMDB between the prebuild that
        // chose it and this render – rare, and no reason to fail a deployment
        // of twelve hundred others. Its page is built without a snapshot,
        // which makes it the `noindex` shell the browser fills in (and fails
        // to, with "not found"); the next build does not choose it. Anything
        // else that 404s – a listing, a list – is a broken request, and fails
        // the build like any other failure.
        if (missingIsNull) {
          console.warn(`${what} is gone from TMDB (404); building its page without a snapshot.`);
          return null;
        }
        break;
      }
    }
  }

  throw new Error(`Could not load ${what} from TMDB at build time`, {
    cause: lastError,
  });
}

/**
 * Page one of a genre listing, unfiltered – or of its landing for one platform.
 *
 * Wrapped in `cache` because a page's metadata reads it too (a platform landing
 * with too few titles is `noindex`), and the two should cost one request.
 */
export const getGenreSnapshot = cache(
  (
    mediaType: MediaType,
    genreId: number,
    platformSlug?: string,
  ): Promise<GenreListingPage | null> => {
    const platform = platformSlug
      ? findStreamingPlatform(platformSlug)
      : undefined;

    return buildTimeLoad(
      `${mediaType} genre ${genreId}${platform ? ` on ${platform.name}` : ""}`,
      () =>
        loadGenreListing({
          mediaType,
          genreId,
          page: 1,
          platform,
          filters: parseDiscoverFilters(
            new URLSearchParams(),
            mediaType,
            "with_genre",
          ),
        }),
    );
  },
);

/** Page one of a mood's picks. A half that failed fails the build. */
export const getMoodSnapshot = cache(
  (slug: string): Promise<MoodPicksPage | null> => {
    const mood = findMood(slug);
    if (!mood) return Promise.resolve(null);

    return buildTimeLoad(`mood ${slug}`, async () => {
      const picks = await loadMoodPicks(mood, 1);
      if (picks.moviesFailed || picks.showsFailed) {
        throw new Error(
          `the ${picks.moviesFailed ? "film" : "series"} half did not load`,
        );
      }
      return picks;
    });
  },
);

/** Page one of every row on the home page, keyed by row. */
export async function getHomeSnapshot(): Promise<Record<HomeRow, MediaItem[]> | null> {
  return buildTimeLoad("the home page rows", async () => {
    const rows = await Promise.all(
      HOME_ROWS.map(async (row) => [row, await loadHomeRow(row)] as const),
    );
    return Object.fromEntries(rows) as Record<HomeRow, MediaItem[]>;
  });
}

/**
 * A title page's snapshot: the details the browser would load, cut down to
 * what the first render shows (`title-details.ts`). Wrapped in `cache` because
 * the page's metadata reads it as well. `null` for a title TMDB answers 404
 * for (see `buildTimeLoad`).
 */
export const getMovieSnapshot = cache(
  (id: number): Promise<MovieDetails | null> =>
    buildTimeLoad(
      `film ${id}`,
      async () =>
        movieSnapshot(await tmdbApi.getMovieDetails(id, MOVIE_APPENDED_SECTIONS)),
      { missingIsNull: true },
    ),
);

export const getTVSnapshot = cache(
  (id: number): Promise<TVShowDetails | null> =>
    buildTimeLoad(
      `series ${id}`,
      async () =>
        tvSnapshot(await tmdbApi.getTVShowDetails(id, TV_APPENDED_SECTIONS)),
      { missingIsNull: true },
    ),
);

export const getPersonSnapshot = cache(
  (id: number): Promise<PersonPageData | null> =>
    buildTimeLoad(
      `person ${id}`,
      async () => personSnapshot(await loadPersonPage(id)),
      { missingIsNull: true },
    ),
);

/** Page one of each object in `sections`, keyed like it. */
async function loadSections<K extends string, T>(
  what: string,
  sections: Record<K, () => Promise<T>>,
): Promise<Record<K, T> | null> {
  return buildTimeLoad(what, async () => {
    const entries = await Promise.all(
      (Object.keys(sections) as K[]).map(async (key) => [key, await sections[key]()] as const),
    );
    return Object.fromEntries(entries) as Record<K, T>;
  });
}

/** The fixed sections of `/movies`: everything but the filterable grid. */
export function getMovieSectionsSnapshot(): Promise<MovieSectionsSnapshot | null> {
  return loadSections("the /movies sections", MOVIE_SECTIONS);
}

/** The fixed sections of `/tv-shows`. */
export function getTVSectionsSnapshot(): Promise<TVSectionsSnapshot | null> {
  return loadSections("the /tv-shows sections", TV_SECTIONS);
}

/** The list on `/people`. Neither page answering fails the build. */
export function getPeopleSnapshot(): Promise<Person[] | null> {
  return buildTimeLoad("the /people list", async () => {
    const people = await loadPopularPeople();
    if (!people) throw new Error("neither page of popular people answered");
    return people;
  });
}
