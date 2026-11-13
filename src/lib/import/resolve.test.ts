import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportEntry } from "./types";

const fetchJson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tmdb-cache", () => ({
  TMDB_CONFIG: { BASE_URL: "https://tmdb.test/3" },
  TTL: { LONG: 21600 },
  tmdbFetchJson: fetchJson,
}));

const { pickMatch, resolveEntries, resolveRef } = await import("./resolve");

const heat = {
  id: 949, title: "Heat", original_title: "Heat", poster_path: "/heat.jpg",
  release_date: "1995-12-15", vote_average: 7.9,
};
const severance = {
  id: 95396, name: "Severance", original_name: "Severance", poster_path: "/sev.jpg",
  first_air_date: "2022-02-17", vote_average: 8.4,
};

/** Answer by path, so a test says what TMDB has rather than in what order it is asked. */
function tmdb(answers: Record<string, unknown>) {
  fetchJson.mockImplementation(async (url: string) => {
    const { pathname, searchParams } = new URL(url);
    const key = `${pathname.replace("/3", "")}${searchParams.size ? `?${searchParams}` : ""}`;
    if (!(key in answers)) throw new Error(`TMDB API error: 404 Not Found (${key})`);
    const answer = answers[key];
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fetchJson.mockReset();
  vi.restoreAllMocks();
});

describe("resolveRef", () => {
  it("reads a title by TMDB's own id where the export has it", async () => {
    tmdb({ "/movie/949": heat });

    await expect(resolveRef({ mediaType: "movie", tmdbId: 949 })).resolves.toEqual({
      mediaType: "movie",
      id: 949,
      title: "Heat",
      posterPath: "/heat.jpg",
      releaseDate: "1995-12-15",
      voteAverage: 7.9,
    });
  });

  it("finds a film by its IMDb id", async () => {
    tmdb({ "/find/tt0113277?external_source=imdb_id": { movie_results: [heat], tv_results: [] } });

    await expect(resolveRef({ mediaType: "movie", imdbId: "tt0113277" })).resolves.toMatchObject({
      mediaType: "movie",
      id: 949,
    });
  });

  // An IMDb export writes the type in the account's language; where it was
  // not readable, what TMDB has the id as decides.
  it("takes TMDB's word for what an IMDb id is when the export did not say", async () => {
    tmdb({ "/find/tt11280740?external_source=imdb_id": { movie_results: [], tv_results: [severance] } });

    await expect(resolveRef({ imdbId: "tt11280740" })).resolves.toMatchObject({
      mediaType: "tv",
      id: 95396,
      title: "Severance",
      releaseDate: "2022-02-17",
    });
  });

  it("does not match an id TMDB only knows as an episode", async () => {
    tmdb({
      "/find/tt1444426?external_source=imdb_id": {
        movie_results: [], tv_results: [], tv_episode_results: [{ id: 1 }],
      },
    });

    await expect(resolveRef({ imdbId: "tt1444426" })).resolves.toBeNull();
  });

  it("finds a series by its TheTVDB id, which is what TV Time knows it by", async () => {
    tmdb({ "/find/371980?external_source=tvdb_id": { tv_results: [severance] } });

    await expect(resolveRef({ mediaType: "tv", tvdbId: 371980 })).resolves.toMatchObject({
      mediaType: "tv",
      id: 95396,
    });
  });

  it("falls back from an id TMDB does not have to the next thing the entry carries", async () => {
    tmdb({
      // The stale TMDB id is a 404; the IMDb id finds it.
      "/find/tt0113277?external_source=imdb_id": { movie_results: [heat] },
    });

    await expect(
      resolveRef({ mediaType: "movie", tmdbId: 1, imdbId: "tt0113277" }),
    ).resolves.toMatchObject({ id: 949 });
  });

  it("searches by name and year", async () => {
    tmdb({ "/search/movie?query=Heat&include_adult=false&year=1995": { results: [heat] } });

    await expect(
      resolveRef({ mediaType: "movie", title: "Heat", year: 1995 }),
    ).resolves.toMatchObject({ id: 949 });
  });

  // The two services disagree on a year by one often enough: a festival
  // premiere, a release.
  it("searches again without the year when the year finds nothing", async () => {
    tmdb({
      "/search/movie?query=Heat&include_adult=false&year=1996": { results: [] },
      "/search/movie?query=Heat&include_adult=false": { results: [heat] },
    });

    await expect(
      resolveRef({ mediaType: "movie", title: "Heat", year: 1996 }),
    ).resolves.toMatchObject({ id: 949 });
  });

  it("searches series by first air date", async () => {
    tmdb({ "/search/tv?query=Severance&include_adult=false&first_air_date_year=2022": { results: [severance] } });

    await expect(
      resolveRef({ mediaType: "tv", title: "Severance", year: 2022 }),
    ).resolves.toMatchObject({ mediaType: "tv", id: 95396 });
  });

  it("answers null for a title TMDB does not have", async () => {
    tmdb({ "/search/movie?query=Nonesuch&include_adult=false": { results: [] } });

    await expect(resolveRef({ mediaType: "movie", title: "Nonesuch" })).resolves.toBeNull();
  });

  it("lets a failure that is not a miss through", async () => {
    tmdb({ "/movie/949": new Error("TMDB API error: 503 Service Unavailable") });

    await expect(resolveRef({ mediaType: "movie", tmdbId: 949 })).rejects.toThrow("503");
  });
});

describe("pickMatch", () => {
  const dune1984 = { id: 841, title: "Dune", release_date: "1984-12-14" };
  const dune2021 = { id: 438631, title: "Dune", release_date: "2021-09-15" };

  it("tells a remake from its original by the year", () => {
    expect(pickMatch("movie", [dune2021, dune1984], { title: "Dune", year: 1984 })?.id).toBe(841);
  });

  it("allows a year that is one out", () => {
    expect(pickMatch("movie", [dune2021], { title: "Dune", year: 2020 })?.id).toBe(438631);
  });

  // A wrong film added to someone's history is worse than a missing one they
  // are told about.
  it("does not guess when the name matches and the year is years off", () => {
    expect(pickMatch("movie", [dune2021], { title: "Dune", year: 1984 })).toBeNull();
  });

  it("takes the best-known film of that name when there is no year to check", () => {
    expect(pickMatch("movie", [dune2021, dune1984], { title: "dune" })?.id).toBe(438631);
  });

  // TMDB searches translations and alternative titles, so the name can differ.
  it("accepts another name only with the year agreeing", () => {
    const amelie = { id: 194, title: "Amélie", original_title: "Le Fabuleux Destin d'Amélie Poulain", release_date: "2001-04-25" };

    expect(pickMatch("movie", [amelie], { title: "Die fabelhafte Welt der Amelie", year: 2001 })?.id).toBe(194);
    expect(pickMatch("movie", [amelie, dune2021], { title: "Die fabelhafte Welt der Amelie" })).toBeNull();
  });

  it("matches the original title as well as the English one", () => {
    const amelie = { id: 194, title: "Amélie", original_title: "Le Fabuleux Destin d'Amélie Poulain", release_date: "2001-04-25" };

    expect(pickMatch("movie", [dune2021, amelie], { title: "le fabuleux destin d'amelie poulain" })?.id).toBe(194);
  });

  it("accepts the only result of a search with no year to check", () => {
    expect(pickMatch("tv", [{ id: 1, name: "TSUKIMICHI -Moonlit Fantasy- 2" }], { title: "Tsukimichi" })?.id).toBe(1);
  });
});

describe("resolveEntries", () => {
  const entry = (ref: ImportEntry["ref"], rest: Partial<ImportEntry> = {}): ImportEntry => ({ ref, ...rest });

  it("sorts entries into found, not found and not checked", async () => {
    tmdb({
      "/movie/949": heat,
      "/movie/2": new Error("TMDB API error: 503 Service Unavailable"),
      "/search/movie?query=Nonesuch&include_adult=false": { results: [] },
    });

    const resolution = await resolveEntries([
      entry({ mediaType: "movie", tmdbId: 949 }, { watchlist: true }),
      entry({ mediaType: "movie", title: "Nonesuch" }, { watched: true }),
      entry({ mediaType: "movie", tmdbId: 2 }, { watched: true }),
    ]);

    expect(resolution.resolved.map(({ title }) => title.id)).toEqual([949]);
    expect(resolution.unmatched.map(({ ref }) => ref.title)).toEqual(["Nonesuch"]);
    // TMDB did not answer for this one: importing again picks it up.
    expect(resolution.failed.map(({ ref }) => ref.tmdbId)).toEqual([2]);
  });

  // The same series by name in one file and by id in another.
  it("merges entries that turn out to be one title", async () => {
    tmdb({
      "/find/371980?external_source=tvdb_id": { tv_results: [severance] },
      "/search/tv?query=Severance&include_adult=false": { results: [severance] },
    });

    const { resolved } = await resolveEntries([
      entry({ mediaType: "tv", tvdbId: 371980 }, { episodes: [{ season: 1, episode: 1 }] }),
      entry({ mediaType: "tv", title: "Severance" }, { episodes: [{ season: 1, episode: 2 }], followed: true }),
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].entry).toMatchObject({
      followed: true,
      episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }],
    });
  });

  it("reports progress as each entry settles", async () => {
    tmdb({ "/movie/949": heat, "/movie/950": { ...heat, id: 950 } });
    const onProgress = vi.fn();

    await resolveEntries(
      [entry({ mediaType: "movie", tmdbId: 949 }), entry({ mediaType: "movie", tmdbId: 950 })],
      { onProgress },
    );

    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      resolveEntries([entry({ mediaType: "movie", tmdbId: 949 })], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("resolves nothing from nothing", async () => {
    await expect(resolveEntries([])).resolves.toEqual({ resolved: [], unmatched: [], failed: [] });
  });
});
