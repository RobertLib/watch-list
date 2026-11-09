import type { Video } from "@/types/tmdb";

/**
 * The trailer among a title's videos: an official YouTube trailer first, then
 * any YouTube trailer. Undefined when there is none – a teaser is not one.
 *
 * Shared by `useVideoOverlay`'s lookup, by the detail pages, which hold their
 * videos already, and by the build's title snapshots, which keep this one video
 * however few others they keep. One rule for all of them is what makes a detail
 * page's "Play Trailer" play the same video as the play button on that title's
 * poster.
 */
export function findYouTubeTrailer(videos: Video[]): Video | undefined {
  return (
    videos.find(
      (video) =>
        video.site === "YouTube" && video.type === "Trailer" && video.official,
    ) ??
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer")
  );
}
