import { describe, expect, it } from "vitest";
import { mergeCastByPerson } from "./media-converters";
import { findYouTubeTrailer } from "./trailer";
import {
  SNAPSHOT_REGION,
  movieSnapshot,
  moviePageTitle,
  personPageTitle,
  personSnapshot,
  tvPageTitle,
} from "./title-details";
import type { MovieDetails, PersonDetails } from "@/types/tmdb";

/**
 * A title page's snapshot is written into its HTML and three payload files,
 * for every prerendered title – so it is cut to what the first render shows.
 * The cuts must keep exactly what the page displays, or the prerendered page
 * shows less than the browser then does.
 */

function film(overrides: Partial<MovieDetails> = {}): MovieDetails {
  const castMember = (id: number, character: string, order: number) => ({
    id, name: `Actor ${id}`, character, profile_path: null, order,
    adult: false, gender: 2, known_for_department: "Acting", popularity: 1, credit_id: `c${id}${order}`,
  });
  return {
    id: 550,
    title: "Fight Club",
    overview: "An insomniac office worker…",
    release_date: "1999-10-15",
    credits: {
      cast: [
        // One actor billed twice: merged into one card.
        castMember(1, "Narrator", 0),
        castMember(1, "Jack", 1),
        ...Array.from({ length: 20 }, (_, i) => castMember(100 + i, `Role ${i}`, i + 2)),
      ],
      crew: [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: 200 + i, name: `Producer ${i}`, job: "Producer", department: "Production", profile_path: null,
        })),
        // Past six in its department, but named in the page's header.
        { id: 300, name: "Jim Uhls", job: "Screenplay", department: "Writing", profile_path: null },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: 310 + i, name: `Writer ${i}`, job: "Story Editor", department: "Writing", profile_path: null,
        })),
        { id: 7467, name: "David Fincher", job: "Director", department: "Directing", profile_path: null },
      ],
    },
    videos: {
      id: 550,
      results: [
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `v${i}`, key: `k${i}`, name: `Clip ${i}`, site: "YouTube", type: "Clip", official: true,
          published_at: "2020-01-01", iso_639_1: "en", size: 1080,
        })),
        { id: "t", key: "trailer", name: "Trailer", site: "YouTube", type: "Trailer", official: true, published_at: "1999-01-01" },
      ],
    },
    images: { id: 550, backdrops: [{ file_path: "/b.jpg", width: 1, height: 1, vote_average: 0, vote_count: 0, iso_639_1: null }], posters: [] },
    "watch/providers": {
      id: 550,
      results: {
        US: { link: "", flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/n.png", display_priority: 1 }] },
        CZ: { link: "", flatrate: [] },
      },
    },
    release_dates: {
      id: 550,
      results: [
        { iso_3166_1: "US", release_dates: [{ certification: "R", type: 3, release_date: "1999-10-15" }] },
        { iso_3166_1: "DE", release_dates: [{ certification: "18", type: 3, release_date: "1999-11-11" }] },
      ],
    },
    translations: {
      id: 550,
      translations: [
        { iso_3166_1: "CZ", iso_639_1: "cs", name: "Český", english_name: "Czech", data: { homepage: "", overview: "Dlouhý text…", runtime: 139, tagline: "", title: "Klub rváčů" } },
      ],
    },
    ...overrides,
  } as unknown as MovieDetails;
}

describe("movieSnapshot", () => {
  it("keeps every billing of the twelve cast cards the page shows, and no one else", () => {
    const snapshot = movieSnapshot(film());
    const shown = mergeCastByPerson(snapshot.credits!.cast);

    expect(shown).toHaveLength(12);
    expect(shown[0]).toMatchObject({ id: 1, character: "Narrator / Jack" });
    expect(snapshot.credits!.cast.every((member) => !("popularity" in member))).toBe(true);
  });

  it("keeps six per crew department, and the director and writers wherever they sit", () => {
    const { crew } = movieSnapshot(film()).credits!;

    expect(crew.filter((member) => member.department === "Production")).toHaveLength(6);
    expect(crew.map((member) => member.name)).toEqual(
      expect.arrayContaining(["Jim Uhls", "David Fincher"]),
    );
  });

  it("keeps the trailer, whatever else it drops from the videos", () => {
    const original = film();
    const snapshot = movieSnapshot(original);

    expect(snapshot.videos!.results.length).toBeLessThan(original.videos!.results.length);
    expect(findYouTubeTrailer(snapshot.videos!.results)?.key).toBe("trailer");
  });

  it("keeps providers and ratings for the build's region only", () => {
    const snapshot = movieSnapshot(film());

    expect(Object.keys(snapshot["watch/providers"]!.results)).toEqual([SNAPSHOT_REGION]);
    expect(snapshot.release_dates!.results.map((result) => result.iso_3166_1)).toEqual([SNAPSHOT_REGION]);
  });

  it("drops the gallery and the translations' text, keeping the language names", () => {
    const snapshot = movieSnapshot(film());

    expect(snapshot.images).toBeUndefined();
    expect(snapshot.translations!.translations[0]).toEqual({
      iso_3166_1: "CZ", iso_639_1: "cs", name: "Český", english_name: "Czech", data: {},
    });
  });

  it("is a fraction of the answer it was cut from", () => {
    const original = film();
    expect(JSON.stringify(movieSnapshot(original)).length).toBeLessThan(
      JSON.stringify(original).length / 2,
    );
  });
});

describe("personSnapshot", () => {
  it("keeps only the fields a filmography reads", () => {
    const snapshot = personSnapshot({
      details: { id: 31, name: "Tom Hanks" } as PersonDetails,
      movieCredits: {
        cast: [{ id: 13, title: "Forrest Gump", character: "Forrest", poster_path: null, release_date: "1994-06-23", vote_average: 8.5, vote_count: 28000, popularity: 9, overview: "Long…", backdrop_path: "/b.jpg" } as never],
        crew: [],
      },
      tvCredits: { cast: [], crew: [] },
    });

    expect(snapshot.movieCredits.cast[0]).toEqual({
      id: 13, title: "Forrest Gump", character: "Forrest", poster_path: null,
      release_date: "1994-06-23", vote_average: 8.5, vote_count: 28000, popularity: 9,
    });
    expect(snapshot.details.name).toBe("Tom Hanks");
  });
});

describe("page titles", () => {
  it("name the title, its year and what the page is for", () => {
    expect(moviePageTitle({ title: "Fight Club", release_date: "1999-10-15" })).toBe(
      "Fight Club (1999) – Where to Watch",
    );
    expect(tvPageTitle({ name: "Breaking Bad", first_air_date: "2008-01-20" })).toBe(
      "Breaking Bad (2008) – Where to Watch",
    );
    expect(moviePageTitle({ title: "Untitled", release_date: "" })).toBe("Untitled – Where to Watch");
    expect(personPageTitle({ name: "Tom Hanks" })).toBe("Tom Hanks – Movies & TV Shows");
  });
});
