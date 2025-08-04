import { Movie, TVShow, MediaItem } from "@/types/tmdb";

// Type for trending items that can be either Movie or TVShow with media_type
type TrendingItem =
  | (Movie & { media_type?: "movie" })
  | (TVShow & { media_type?: "tv" })
  | MediaItem;

/**
 * Convert Movie to MediaItem for use in components that expect MediaItem interface
 * Watch providers are now loaded lazily on client side
 */
export const convertMovieToMediaItem = (movie: Movie): MediaItem => ({
  id: movie.id,
  title: movie.title,
  overview: movie.overview,
  poster_path: movie.poster_path,
  backdrop_path: movie.backdrop_path,
  release_date: movie.release_date,
  vote_average: movie.vote_average,
  vote_count: movie.vote_count,
  genre_ids: movie.genre_ids,
  media_type: "movie" as const,
  // Providers are loaded lazily via MediaCard
  providers: movie.providers,
  "watch/providers": movie["watch/providers"],
});

/**
 * Convert TVShow to MediaItem for use in components that expect MediaItem interface
 * Watch providers are now loaded lazily on client side
 */
export const convertTVShowToMediaItem = (show: TVShow): MediaItem => ({
  id: show.id,
  title: show.name,
  overview: show.overview,
  poster_path: show.poster_path,
  backdrop_path: show.backdrop_path,
  release_date: show.first_air_date,
  vote_average: show.vote_average,
  vote_count: show.vote_count,
  genre_ids: show.genre_ids,
  media_type: "tv" as const,
  // Providers are loaded lazily via MediaCard
  providers: show.providers,
  "watch/providers": show["watch/providers"],
});

/**
 * Convert trending item (Movie or TVShow) to MediaItem for use in components
 */
export const convertTrendingToMediaItem = (item: TrendingItem): MediaItem => {
  // If item already has media_type and title, it's already converted
  if ("media_type" in item && "title" in item && item.title) {
    return item as MediaItem;
  }

  // Determine media type and convert accordingly
  if ("title" in item && item.title) {
    return convertMovieToMediaItem(item as Movie);
  } else if ("name" in item && item.name) {
    return convertTVShowToMediaItem(item as TVShow);
  }

  // This should never happen, but provide fallback
  throw new Error("Unable to determine media type for trending item");
};
