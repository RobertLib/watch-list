import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "./media-converters";
import type { SharedListRef } from "./shared-list";
import type { Genre, MediaItem } from "@/types/tmdb";

/** A detail response carries `genres`, while a card wants `genre_ids`. */
function toGenreIds(genres: Genre[] | undefined): number[] {
  return (genres ?? []).map((genre) => genre.id);
}

/**
 * Resolve the ids carried in a share link into renderable titles.
 *
 * A link holds nothing but ids, so every title costs one TMDB read – cached,
 * because a list that gets passed around is opened many times over. Failures are
 * dropped rather than thrown: an id TMDB no longer knows should cost the visitor
 * one poster, not the whole page.
 *
 * The two media types are fetched as separate batches so each response keeps its
 * own type, and the original order is restored afterwards from the refs.
 */
export async function getSharedListItems(
  refs: SharedListRef[],
): Promise<MediaItem[]> {
  if (refs.length === 0) return [];

  const movieIds = refs
    .filter((ref) => ref.mediaType === "movie")
    .map((ref) => ref.id);
  const showIds = refs
    .filter((ref) => ref.mediaType === "tv")
    .map((ref) => ref.id);

  const [movieResults, showResults] = await Promise.all([
    Promise.allSettled(movieIds.map((id) => getCachedMovieDetails(id))),
    Promise.allSettled(showIds.map((id) => getCachedTVShowDetails(id))),
  ]);

  const byKey = new Map<string, MediaItem>();

  movieResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const movie = result.value;
    byKey.set(
      `movie-${movieIds[index]}`,
      convertMovieToMediaItem({ ...movie, genre_ids: toGenreIds(movie.genres) }),
    );
  });

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const show = result.value;
    byKey.set(
      `tv-${showIds[index]}`,
      convertTVShowToMediaItem({ ...show, genre_ids: toGenreIds(show.genres) }),
    );
  });

  return refs.flatMap((ref) => {
    const item = byKey.get(`${ref.mediaType}-${ref.id}`);
    return item ? [item] : [];
  });
}
