import type { Video } from "@/types/tmdb";

/**
 * The shape of a YouTube video id: letters, digits, `-` and `_`.
 *
 * TMDB's video list is community-edited, and its `key` goes straight into URL
 * paths – the embed player's, the thumbnail's, the structured data's. A key
 * holding `/`, `?`, `#`, `%` or `..` would rewrite that URL rather than name a
 * video in it: another embed path, an autoplaying playlist, parameters of its
 * own. The CSP keeps the player on youtube-nocookie.com either way, so this is
 * not a script injection, but it is somebody else choosing what plays.
 *
 * The character set is the part that makes a key safe to interpolate. Every
 * YouTube id so far is eleven characters long, but the length is not checked:
 * it adds no safety, and a stricter rule would silently drop every trailer the
 * day YouTube issues a longer id.
 */
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether a video can be embedded from YouTube by its key, as it stands. */
export function isPlayableYouTubeVideo(video: Video): boolean {
  return (
    video.site === "YouTube" &&
    typeof video.key === "string" &&
    YOUTUBE_KEY.test(video.key)
  );
}

/** Whether `key` is safe to put into a YouTube URL path. */
export function isYouTubeKey(key: unknown): key is string {
  return typeof key === "string" && YOUTUBE_KEY.test(key);
}

/**
 * The trailer among a title's videos: an official YouTube trailer first, then
 * any YouTube trailer. Undefined when there is none – a teaser is not one, and
 * neither is a video whose key could not be embedded (see `YOUTUBE_KEY`).
 *
 * Shared by `useVideoOverlay`'s lookup, by the detail pages, which hold their
 * videos already, and by the build's title snapshots, which keep this one video
 * however few others they keep. One rule for all of them is what makes a detail
 * page's "Play Trailer" play the same video as the play button on that title's
 * poster.
 */
export function findYouTubeTrailer(videos: Video[]): Video | undefined {
  const trailers = videos.filter(
    (video) => video.type === "Trailer" && isPlayableYouTubeVideo(video),
  );
  return trailers.find((video) => video.official) ?? trailers[0];
}
