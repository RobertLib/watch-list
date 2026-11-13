import { describe, expect, it } from "vitest";
import {
  CAST_COUNTED,
  creditedPeople,
  rankPeople,
} from "../../scripts/prerender-people.mjs";

const actor = (id: number, order: number, extra: object = {}) => ({
  id, name: `Actor ${id}`, order, popularity: 1, ...extra,
});
const crew = (id: number, job: string, extra: object = {}) => ({
  id, name: `Crew ${id}`, job, popularity: 1, ...extra,
});

describe("creditedPeople", () => {
  it("takes the top-billed cast, the director, the writers and a series' creators", () => {
    const people = creditedPeople({
      cast: [actor(2, 1), actor(1, 0)],
      crew: [crew(10, "Director"), crew(11, "Screenplay"), crew(12, "Gaffer")],
      createdBy: [{ id: 20, name: "A Creator" }],
    });

    // The gaffer is in the crew section, six to a department – not one of the
    // links every title page leads with.
    expect(people.map((person) => person.id)).toEqual([1, 2, 10, 11, 20]);
  });

  it("counts the cast the title page shows, by billing order", () => {
    const cast = Array.from({ length: 30 }, (_, i) => actor(100 + i, 29 - i));
    const people = creditedPeople({ cast });

    expect(people).toHaveLength(CAST_COUNTED);
    // Billed last in the array, first on the poster.
    expect(people[0].id).toBe(129);
  });

  it("counts a person once per title, whatever they did on it", () => {
    const people = creditedPeople({
      cast: [actor(1, 0), actor(1, 5)],
      crew: [crew(1, "Director"), crew(1, "Writer")],
    });

    expect(people.map((person) => person.id)).toEqual([1]);
  });

  it("skips entries that could not be a page", () => {
    const people = creditedPeople({
      cast: [
        actor(1, 0, { adult: true }),
        { id: 2, order: 1 },
        { id: "3", name: "Wrong id", order: 2 },
        actor(4, 3),
      ],
    });

    expect(people.map((person) => person.id)).toEqual([4]);
  });

  it("answers nothing for a title with no credits", () => {
    expect(creditedPeople({})).toEqual([]);
  });
});

describe("rankPeople", () => {
  it("ranks by how many of the titles a person is credited on", () => {
    const titles = [
      { cast: [actor(1, 0), actor(2, 1)], crew: [crew(9, "Director")] },
      { cast: [actor(1, 0), actor(3, 1)], crew: [crew(9, "Director")] },
      { cast: [actor(1, 0)], crew: [] },
    ];

    expect(rankPeople(titles, 10).map((person) => person.id)).toEqual([1, 9, 2, 3]);
  });

  it("keeps the most credited when there is room for only some", () => {
    const titles = [
      { cast: [actor(1, 0), actor(2, 1)] },
      { cast: [actor(2, 0), actor(3, 1)] },
    ];

    expect(rankPeople(titles, 1)).toEqual([{ id: 2, name: "Actor 2" }]);
  });

  // The cut-off falls among people credited equally often; without a fixed
  // order there, each build would prerender a different handful.
  it("breaks a tie by popularity, then by id, so the list is stable", () => {
    const titles = [
      {
        cast: [
          actor(5, 0, { popularity: 2 }),
          actor(7, 1, { popularity: 9 }),
          actor(3, 2, { popularity: 2 }),
        ],
      },
    ];

    expect(rankPeople(titles, 3).map((person) => person.id)).toEqual([7, 3, 5]);
  });

  it("returns only what a page needs: the id and the name its slug is made from", () => {
    expect(rankPeople([{ cast: [actor(1, 0)] }], 5)).toEqual([{ id: 1, name: "Actor 1" }]);
  });
});
