import { describe, expect, it } from "vitest";
import { creditRoleLabel, personMovieWorks, personTVWorks } from "./person-credits";
import type { PersonMovieCredit, PersonTVCredit } from "@/types/tmdb";

const movie: PersonMovieCredit = {
  id: 1, title: "A movie", character: "The Visitor", poster_path: null,
  release_date: "2001-01-01", vote_average: 8, vote_count: 100, popularity: 10,
};
const show: PersonTVCredit = {
  id: 1, name: "A show", character: "The Visitor", poster_path: null,
  first_air_date: "2001-01-01", vote_average: 8, vote_count: 100, popularity: 10,
  episode_count: 5,
};

describe("person credit merging", () => {
  it("preserves distinct roles across repeated cast and crew credits", () => {
    const works = personMovieWorks({
      cast: [movie, { ...movie, character: "The Narrator" }, movie],
      crew: [
        { ...movie, job: "Director", department: "Directing" },
        { ...movie, job: "Writer", department: "Writing" },
        { ...movie, job: "Director", department: "Directing" },
      ],
    });
    expect(works).toHaveLength(1);
    expect(creditRoleLabel(works[0])).toBe("as The Visitor · as The Narrator · Director · Writer");
    expect(works[0].hasCastCredit).toBe(true);
  });

  it("does not add overlapping TV episode counts from multiple jobs or roles", () => {
    const works = personTVWorks({
      cast: [show, { ...show, character: "A second role", episode_count: 2 }],
      crew: [{ ...show, job: "Director", department: "Directing", episode_count: 3 }],
    });
    expect(works).toHaveLength(1);
    expect(works[0].episode_count).toBe(5);
    expect(works[0].jobs).toEqual(["Director"]);
  });
});
