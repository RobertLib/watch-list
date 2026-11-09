// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PersonContent } from "./PersonContent";
import { getPersonWikipediaContent } from "@/lib/wikipedia";
import type {
  PersonDetails,
  PersonMovieCredit,
  PersonMovieCrewCredit,
  PersonTVCrewCredit,
} from "@/types/tmdb";

const api = vi.hoisted(() => ({
  getPersonDetails: vi.fn(),
  getPersonMovieCredits: vi.fn(),
  getPersonTVCredits: vi.fn(),
  getImageUrl: vi.fn(() => "/poster.jpg"),
}));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("@/lib/wikipedia", () => ({
  getPersonWikipediaContent: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("id=filmmaker-123"),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

const details: PersonDetails = {
  id: 123,
  name: "A Filmmaker",
  biography: null,
  birthday: null,
  deathday: null,
  place_of_birth: null,
  profile_path: null,
  known_for_department: "Directing",
  gender: 0,
  popularity: 10,
  adult: false,
  also_known_as: [],
  homepage: null,
  imdb_id: null,
};

function movieCrew(id: number, title: string, job: string, release_date: string): PersonMovieCrewCredit {
  return {
    id, title, job, release_date, department: "Directing", poster_path: null,
    vote_average: 8, vote_count: 1000, popularity: 50,
  };
}

const tvCrew: PersonTVCrewCredit = {
  id: 10, name: "Crew Series", job: "Creator", department: "Writing",
  first_air_date: "2019-01-01", poster_path: null,
  vote_average: 8, vote_count: 1000, popularity: 50, episode_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPersonDetails.mockResolvedValue(details);
  api.getPersonMovieCredits.mockResolvedValue({ cast: [], crew: [] });
  api.getPersonTVCredits.mockResolvedValue({ cast: [], crew: [] });
});
afterEach(cleanup);

describe("PersonContent credits", () => {
  it.each(["Acting", "Directing", "Sound", "Writing", "Production", "Camera", ""])(
    "uses the verified identity for department %s instead of guessing a biography",
    async (department) => {
      api.getPersonDetails.mockResolvedValue({
        ...details,
        known_for_department: department,
        external_ids: { wikidata_id: "Q131285" },
      });

      await act(async () => { render(<PersonContent />); });

      expect(getPersonWikipediaContent).toHaveBeenCalledWith("Q131285");
    },
  );

  it("shows a filmmaker's crew-only movies and TV work, career and known-for titles", async () => {
    api.getPersonMovieCredits.mockResolvedValue({ cast: [], crew: [
      movieCrew(10, "Crew Movie", "Director", "1998-01-01"),
      movieCrew(10, "Crew Movie", "Writer", "1998-01-01"),
    ] });
    api.getPersonTVCredits.mockResolvedValue({ cast: [], crew: [tvCrew] });

    await act(async () => { render(<PersonContent />); });

    expect(screen.queryByText("No credits available.")).toBeNull();
    expect(screen.getAllByText("Crew Movie")).toHaveLength(2);
    expect(screen.getAllByText("Crew Series")).toHaveLength(2);
    expect(screen.getByText("1998 – 2019")).toBeTruthy();
    expect(screen.getByText("1 movies")).toBeTruthy();
    expect(screen.getByText("1 TV shows")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Movies (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "TV (1)" })).toBeTruthy();
    expect(screen.getByText("Director · Writer")).toBeTruthy();
    expect(screen.getByText("Creator · 1 ep.")).toBeTruthy();

    // Crew work belongs in the filmography, but is not an acting performance.
    const structuredPerson = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent ?? "{}"))
      .find((record) => record["@type"] === "Person");
    expect(structuredPerson.performerIn).toBeUndefined();
  });

  it("counts a shared cast/crew title once while retaining both acting roles and jobs", async () => {
    const directed = movieCrew(10, "Shared Movie", "Director", "2001-01-01");
    const acted: PersonMovieCredit = {
      id: 10, title: directed.title, character: "The Visitor", poster_path: null,
      release_date: directed.release_date, vote_average: 8, vote_count: 1000, popularity: 50,
    };
    api.getPersonMovieCredits.mockResolvedValue({
      cast: [acted, { ...acted, character: "The Narrator" }, acted],
      crew: [directed, directed, { ...directed, job: "Writer" }],
    });

    await act(async () => { render(<PersonContent />); });

    expect(screen.getByRole("button", { name: "Movies (1)" })).toBeTruthy();
    expect(screen.getByText("1 movies")).toBeTruthy();
    expect(screen.getAllByText("Shared Movie")).toHaveLength(2);
    expect(screen.getByText("as The Visitor · as The Narrator · Director · Writer")).toBeTruthy();
  });

  // `unoptimized`: the size named is the size downloaded, and the known-for
  // tiles are a sixth of the main column.
  it("fetches known-for posters at a tile's size rather than w500", async () => {
    api.getPersonMovieCredits.mockResolvedValue({ cast: [], crew: [
      { ...movieCrew(10, "Crew Movie", "Director", "1998-01-01"), poster_path: "/crew.jpg" },
    ] });

    await act(async () => { render(<PersonContent />); });

    expect(api.getImageUrl).toHaveBeenCalledWith("/crew.jpg", "w300");
    expect(api.getImageUrl).not.toHaveBeenCalledWith("/crew.jpg", "w500");
  });
});

describe("PersonContent personal info", () => {
  // <dt> and <dd> are only valid inside a <dl>; loose, they were invalid
  // markup and a screen reader lost which value belonged to which term.
  it("pairs every term with its value inside a description list", async () => {
    api.getPersonDetails.mockResolvedValue({
      ...details,
      birthday: "1960-05-01",
      place_of_birth: "Somewhere",
      also_known_as: ["Another Name"],
    });

    await act(async () => { render(<PersonContent />); });

    const terms = [...document.querySelectorAll("dt")];
    expect(terms.map((term) => term.textContent)).toEqual([
      "Known For", "Gender", "Birthday", "Place of Birth", "Also Known As",
    ]);
    for (const element of document.querySelectorAll("dt, dd")) {
      expect(element.parentElement?.closest("dl")).not.toBeNull();
    }
  });

  // TMDB's alias list is crowd-edited and repeats itself. Each alias is also
  // its row's key, so a repeat was a duplicate key as well as a duplicate line.
  it("lists each alias once, and five different ones at most", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.getPersonDetails.mockResolvedValue({
      ...details,
      also_known_as: ["Alias A", "Alias A", " Alias B", "Alias B ", "", "Alias C", "Alias D", "Alias E", "Alias F"],
    });

    await act(async () => { render(<PersonContent />); });

    const aliases = [...document.querySelectorAll("dd div")].map((row) => row.textContent);
    expect(aliases).toEqual(["Alias A", "Alias B", "Alias C", "Alias D", "Alias E"]);
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    consoleError.mockRestore();
  });
});
