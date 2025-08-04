import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";
import type { SharedListRef } from "./shared-list";

/**
 * Turning the ids in a share link back into titles.
 *
 * The ordering is the contract. A shared list is somebody's list – a top ten, a
 * October horror run – and the order they put it in is most of what they shared.
 * The two media types are fetched as separate batches so each response keeps its
 * own type, which means the sent order has to be restored from the refs
 * afterwards rather than inherited from the responses.
 *
 * The other half is that a link outlives the catalogue: an id TMDB has since
 * forgotten costs the recipient one poster, not the whole page.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));

const { getCachedMovieDetails, getCachedTVShowDetails } = await import(
  "./tmdb-cache"
);
const { getSharedListItems } = await import("./shared-list-data");

function movie(id: number, over: Partial<MovieDetails> = {}): MovieDetails {
  return {
    id,
    title: `Film ${id}`,
    poster_path: `/${id}.jpg`,
    overview: "",
    release_date: "1999-10-15",
    vote_average: 8,
    genres: [{ id: 18, name: "Drama" }],
    ...over,
  } as MovieDetails;
}

function show(id: number, over: Partial<TVShowDetails> = {}): TVShowDetails {
  return {
    id,
    name: `Series ${id}`,
    poster_path: `/${id}.jpg`,
    overview: "",
    first_air_date: "2008-01-20",
    vote_average: 9,
    genres: [{ id: 80, name: "Crime" }],
    ...over,
  } as TVShowDetails;
}

function ref(id: number, mediaType: "movie" | "tv"): SharedListRef {
  return { id, mediaType };
}

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
  vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) =>
    movie(id),
  );
  vi.mocked(getCachedTVShowDetails).mockImplementation(async (id: number) =>
    show(id),
  );
});

describe("getSharedListItems", () => {
  it("resolves nothing for an empty link", async () => {
    expect(await getSharedListItems([])).toEqual([]);
    expect(getCachedMovieDetails).not.toHaveBeenCalled();
  });

  it("resolves a film into a renderable card", async () => {
    const [item] = await getSharedListItems([ref(550, "movie")]);

    expect(item).toMatchObject({
      id: 550,
      media_type: "movie",
      title: "Film 550",
      poster_path: "/550.jpg",
    });
  });

  it("resolves a show into a renderable card", async () => {
    const [item] = await getSharedListItems([ref(1396, "tv")]);

    expect(item).toMatchObject({
      id: 1396,
      media_type: "tv",
      title: "Series 1396",
    });
  });

  /** The whole point of restoring order from the refs rather than the batches. */
  it("keeps the order the link carried, interleaved types and all", async () => {
    const items = await getSharedListItems([
      ref(1, "movie"),
      ref(2, "tv"),
      ref(3, "movie"),
      ref(4, "tv"),
    ]);

    expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(items.map((item) => item.media_type)).toEqual([
      "movie",
      "tv",
      "movie",
      "tv",
    ]);
  });

  it("drops a title TMDB no longer knows and keeps the rest in order", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return movie(id);
    });

    const items = await getSharedListItems([
      ref(1, "movie"),
      ref(404, "movie"),
      ref(3, "movie"),
    ]);

    expect(items.map((item) => item.id)).toEqual([1, 3]);
  });

  it("answers an empty list when every id has gone", async () => {
    vi.mocked(getCachedMovieDetails).mockRejectedValue(new Error("gone"));
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(new Error("gone"));

    expect(
      await getSharedListItems([ref(1, "movie"), ref(2, "tv")]),
    ).toEqual([]);
  });

  /** A detail response carries `genres`; a card reads `genre_ids`. */
  it("flattens the detail response's genres into the ids a card reads", async () => {
    const [item] = await getSharedListItems([ref(550, "movie")]);

    expect(item.genre_ids).toEqual([18]);
  });

  it("survives a title listed with no genres", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie(550, { genres: undefined }),
    );

    const [item] = await getSharedListItems([ref(550, "movie")]);

    expect(item.genre_ids).toEqual([]);
  });

  /**
   * The same id under two media types is two different titles, and the map is
   * keyed by both – so a link naming both must resolve to two cards.
   */
  it("tells a film and a show sharing an id apart", async () => {
    const items = await getSharedListItems([ref(7, "movie"), ref(7, "tv")]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.media_type)).toEqual(["movie", "tv"]);
  });

  it("asks for each title once, on the right endpoint", async () => {
    await getSharedListItems([ref(550, "movie"), ref(1396, "tv")]);

    expect(getCachedMovieDetails).toHaveBeenCalledTimes(1);
    expect(getCachedMovieDetails).toHaveBeenCalledWith(550);
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(1);
    expect(getCachedTVShowDetails).toHaveBeenCalledWith(1396);
  });
});
