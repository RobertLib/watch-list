import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "./media-converters";
import type { SharedListRef } from "./shared-list";
import { throwIfAllRequestsFailed } from "./tmdb-results";
import type { Genre, MediaItem } from "@/types/tmdb";

/** A detail response carries `genres`, while a card wants `genre_ids`. */
function toGenreIds(genres: Genre[] | undefined): number[] {
  return (genres ?? []).map((genre) => genre.id);
}

export interface SharedListResolution {
  items: MediaItem[];
  /** Transient failures worth retrying; removed titles are omitted here. */
  failedRefs: SharedListRef[];
}

/**
 * Resolve the ids carried in a share link into renderable titles.
 *
 * A link holds nothing but ids, so every title costs one TMDB read – cached,
 * because a list that gets passed around is opened many times over. Partial
 * answers and missing titles remain usable, while a complete outage
 * reaches the page's retry notice.
 *
 * The two media types are fetched as separate batches so each response keeps its
 * own type, and the original order is restored afterwards from the refs.
 *
 * It is bulk work – sixty titles for a shared list, a hundred and twenty for a
 * comparison, two hundred for the ratings page – so the reads run at background
 * priority, and a search typed while they are queued takes the next free slot.
 * `signal` is the caller's: aborting it (the page unmounting) releases every
 * read only this resolution still needed, while one another caller is waiting
 * on carries on for that caller.
 */
export async function getSharedListItems(
  refs: SharedListRef[],
  signal?: AbortSignal,
): Promise<MediaItem[]> {
  return (await getSharedListResolution(refs, signal)).items;
}

/** Keep lookup failures separate from the ids that establish a comparison. */
export async function getSharedListResolution(
  refs: SharedListRef[],
  signal?: AbortSignal,
): Promise<SharedListResolution> {
  signal?.throwIfAborted();
  if (refs.length === 0) return { items: [], failedRefs: [] };

  const movieIds = refs
    .filter((ref) => ref.mediaType === "movie")
    .map((ref) => ref.id);
  const showIds = refs
    .filter((ref) => ref.mediaType === "tv")
    .map((ref) => ref.id);
  const options = { signal, priority: "background" as const };

  const [movieResults, showResults] = await Promise.all([
    Promise.allSettled(movieIds.map((id) => getCachedMovieDetails(id, undefined, options))),
    Promise.allSettled(showIds.map((id) => getCachedTVShowDetails(id, options))),
  ]);
  // A cancelled resolution has no page left to report to – least of all as an
  // outage, which is what every read rejecting would otherwise look like.
  signal?.throwIfAborted();
  throwIfAllRequestsFailed([...movieResults, ...showResults]);

  const byKey = new Map<string, MediaItem>();
  const failedKeys = new Set<string>();

  function recordFailure(key: string, error: unknown) {
    if (!(error instanceof Error && /^TMDB API error: 404\b/.test(error.message))) {
      failedKeys.add(key);
    }
  }

  movieResults.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      recordFailure(`movie-${movieIds[index]}`, result.reason);
      return;
    }

    const movie = result.value;
    byKey.set(
      `movie-${movieIds[index]}`,
      convertMovieToMediaItem({ ...movie, genre_ids: toGenreIds(movie.genres) }),
    );
  });

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      recordFailure(`tv-${showIds[index]}`, result.reason);
      return;
    }

    const show = result.value;
    byKey.set(
      `tv-${showIds[index]}`,
      convertTVShowToMediaItem({ ...show, genre_ids: toGenreIds(show.genres) }),
    );
  });

  return {
    items: refs.flatMap((ref) => {
      const item = byKey.get(`${ref.mediaType}-${ref.id}`);
      return item ? [item] : [];
    }),
    failedRefs: refs.filter((ref) => failedKeys.has(`${ref.mediaType}-${ref.id}`)),
  };
}
