import { describe, expect, it } from "vitest";
import type { Video } from "@/types/tmdb";
import { findYouTubeTrailer, isPlayableYouTubeVideo, isYouTubeKey } from "./trailer";

/**
 * TMDB's video keys are community-edited and end up in URL paths – the
 * embedded player's, the thumbnail's, the structured data's. Only a key shaped
 * like a YouTube id may get there.
 */

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v",
    key: "dQw4w9WgXcQ",
    name: "Official Trailer",
    site: "YouTube",
    type: "Trailer",
    official: true,
    published_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const UNSAFE_KEYS = [
  "",
  "videoseries?list=PL0123456789",
  "../../embed/other",
  "abc/def",
  "abc#t=30",
  "abc%2Fdef",
  "abc def",
  "abc.def",
  "x".repeat(65),
];

describe("isYouTubeKey", () => {
  it.each(["dQw4w9WgXcQ", "a-b_C9", "k-official-trailer"])("accepts %s", (key) => {
    expect(isYouTubeKey(key)).toBe(true);
  });

  it.each(UNSAFE_KEYS)("refuses %j", (key) => {
    expect(isYouTubeKey(key)).toBe(false);
  });

  it("refuses what is not a string", () => {
    expect(isYouTubeKey(undefined)).toBe(false);
    expect(isYouTubeKey(12345678901)).toBe(false);
  });
});

describe("isPlayableYouTubeVideo", () => {
  it("needs YouTube as the site as well as an id-shaped key", () => {
    expect(isPlayableYouTubeVideo(video())).toBe(true);
    expect(isPlayableYouTubeVideo(video({ site: "Vimeo", key: "123456789" }))).toBe(false);
    expect(isPlayableYouTubeVideo(video({ key: "videoseries?list=PL1" }))).toBe(false);
  });
});

describe("findYouTubeTrailer", () => {
  it("passes over a trailer whose key is not an id, official or not", () => {
    const unsafe = video({ id: "a", key: "../embed/other", official: true });
    const safe = video({ id: "b", key: "dQw4w9WgXcQ", official: false });
    expect(findYouTubeTrailer([unsafe, safe])).toBe(safe);
  });

  it("still prefers the official trailer among the playable ones", () => {
    const fan = video({ id: "a", key: "fanCut12345", official: false });
    const official = video({ id: "b", key: "official123", official: true });
    expect(findYouTubeTrailer([fan, official])).toBe(official);
  });

  it("finds none when no trailer can be embedded", () => {
    expect(findYouTubeTrailer([video({ key: "abc/def" }), video({ type: "Teaser" })]))
      .toBeUndefined();
  });
});
