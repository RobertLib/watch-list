import { describe, expect, it } from "vitest";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
  convertTrendingToMediaItem,
  resolveRegionProviders,
} from "./media-converters";
import type { Movie, TVShow, WatchProvidersResponse } from "@/types/tmdb";

const movie: Movie = {
  id: 550,
  title: "Fight Club",
  overview: "An insomniac office worker…",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  release_date: "1999-10-15",
  vote_average: 8.4,
  vote_count: 27000,
  genre_ids: [18, 53],
  adult: false,
  original_language: "en",
  original_title: "Fight Club",
  popularity: 61.4,
  video: false,
};

const show: TVShow = {
  id: 1396,
  name: "Breaking Bad",
  overview: "A high school chemistry teacher…",
  poster_path: "/bb.jpg",
  backdrop_path: "/bb-wide.jpg",
  first_air_date: "2008-01-20",
  vote_average: 8.9,
  vote_count: 13000,
  genre_ids: [18, 80],
  adult: false,
  original_language: "en",
  original_name: "Breaking Bad",
  popularity: 302.1,
};

/**
 * A card renders `title` and `release_date` whatever it was handed, so these two
 * conversions are what stop a shelf of TV posters coming out blank and dateless:
 * TMDB names the same two fields `name` and `first_air_date` for a series.
 */
describe("convertMovieToMediaItem", () => {
  it("keeps the movie's own field names", () => {
    const item = convertMovieToMediaItem(movie);

    expect(item.title).toBe("Fight Club");
    expect(item.release_date).toBe("1999-10-15");
    expect(item.media_type).toBe("movie");
    expect(item.id).toBe(550);
  });
});

describe("convertTVShowToMediaItem", () => {
  it("renames name and first_air_date to what a card reads", () => {
    const item = convertTVShowToMediaItem(show);

    expect(item.title).toBe("Breaking Bad");
    expect(item.release_date).toBe("2008-01-20");
    expect(item.media_type).toBe("tv");
    expect(item.id).toBe(1396);
  });
});

/**
 * The trending endpoint is the awkward one: it returns both kinds in one array,
 * already partly normalised by `tmdbApi.getTrending`. So this has to recognise an
 * item that has been through that pass and leave it alone, or it would re-derive
 * a `media_type` from fields the first pass already rewrote.
 */
describe("convertTrendingToMediaItem", () => {
  it("passes an already-converted item straight through", () => {
    const converted = convertMovieToMediaItem(movie);

    expect(convertTrendingToMediaItem(converted)).toBe(converted);
  });

  it("converts a raw movie", () => {
    expect(convertTrendingToMediaItem(movie)).toMatchObject({
      title: "Fight Club",
      media_type: "movie",
    });
  });

  it("converts a raw show", () => {
    expect(convertTrendingToMediaItem(show)).toMatchObject({
      title: "Breaking Bad",
      release_date: "2008-01-20",
      media_type: "tv",
    });
  });

  /**
   * Throwing rather than returning a half-built item is deliberate: a card built
   * from neither branch renders an untitled poster that links nowhere, which is
   * a bug report about the UI rather than about the payload that caused it.
   */
  it("throws on an item that is neither", () => {
    expect(() =>
      convertTrendingToMediaItem({ id: 1 } as unknown as Movie),
    ).toThrow(/determine media type/i);
  });
});

describe("resolveRegionProviders", () => {
  const response: WatchProvidersResponse = {
    id: 550,
    results: {
      CZ: {
        link: "https://www.themoviedb.org/movie/550/watch",
        flatrate: [
          {
            provider_id: 8,
            provider_name: "Netflix",
            logo_path: "/netflix.jpg",
            display_priority: 1,
          },
        ],
      },
    },
  };

  it("picks the requested region out of the response", () => {
    const providers = resolveRegionProviders(response, "CZ");

    expect(providers.streaming).toHaveLength(1);
    expect(providers.streaming[0].provider_name).toBe("Netflix");
  });

  /**
   * Every absent branch has to come back as an empty array rather than
   * undefined. The section that renders these maps over all three, and the
   * common case – a region TMDB lists nothing for – would otherwise throw on a
   * detail page rather than simply show no platforms.
   */
  it("answers empty arrays for a region, or a response, with nothing in it", () => {
    const empty = { streaming: [], rent: [], buy: [] };

    expect(resolveRegionProviders(response, "GB")).toEqual(empty);
    expect(resolveRegionProviders(undefined, "CZ")).toEqual(empty);
    expect(resolveRegionProviders({ id: 1, results: {} }, "CZ")).toEqual(empty);
  });

  it("defaults the branches the region does not list", () => {
    const providers = resolveRegionProviders(response, "CZ");

    expect(providers.rent).toEqual([]);
    expect(providers.buy).toEqual([]);
  });
});
