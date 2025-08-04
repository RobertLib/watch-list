import { describe, expect, it } from "vitest";
import {
  BASE_RATING,
  entryFor,
  nextPair,
  positionOf,
  progressFor,
  rankedItems,
  rankingFor,
  recordChoice,
  roundsRemaining,
  sanitizeRanking,
  totalRounds,
  type Ranking,
} from "./ranking";
import type { MediaType } from "@/types/tmdb";

const item = (id: number, mediaType: MediaType = "movie") => ({ id, mediaType });

/** A list of `count` films, numbered from 1 – the ids the keys below name. */
const items = (count: number) =>
  Array.from({ length: count }, (_, index) => item(index + 1));

describe("sanitizeRanking", () => {
  it("keeps well-formed entries", () => {
    expect(
      sanitizeRanking({ "movie-550": { rating: 1620.5, matches: 3 } }),
    ).toEqual({ "movie-550": { rating: 1620.5, matches: 3 } });
  });

  it("drops keys that name no title", () => {
    expect(
      sanitizeRanking({ "550": { rating: 1500, matches: 1 }, junk: {} }),
    ).toEqual({});
  });

  it("drops an entry with no usable rating", () => {
    expect(
      sanitizeRanking({ "movie-1": { rating: "high", matches: 2 } }),
    ).toEqual({});
  });

  it("repairs a broken match count rather than losing the rating", () => {
    expect(sanitizeRanking({ "movie-1": { rating: 1500, matches: -4 } })).toEqual(
      { "movie-1": { rating: 1500, matches: 0 } },
    );
  });

  it("clamps a rating that was edited by hand", () => {
    expect(
      sanitizeRanking({ "movie-1": { rating: 1e9, matches: 1 } })["movie-1"]
        .rating,
    ).toBe(4000);
  });

  it("returns nothing for a non-object", () => {
    expect(sanitizeRanking(null)).toEqual({});
    expect(sanitizeRanking([1, 2])).toEqual({});
  });
});

describe("entryFor", () => {
  it("starts an unseen title at the base rating", () => {
    expect(entryFor({}, "movie-1")).toEqual({
      rating: BASE_RATING,
      matches: 0,
    });
  });
});

describe("recordChoice", () => {
  it("moves the winner up and the loser down", () => {
    const after = recordChoice({}, "movie-1", "movie-2");

    expect(after["movie-1"].rating).toBeGreaterThan(BASE_RATING);
    expect(after["movie-2"].rating).toBeLessThan(BASE_RATING);
  });

  it("conserves the total, so the list has a stable midpoint", () => {
    const after = recordChoice({}, "movie-1", "movie-2");
    const total = after["movie-1"].rating + after["movie-2"].rating;

    expect(total).toBeCloseTo(BASE_RATING * 2, 6);
  });

  it("counts a match for both sides", () => {
    const after = recordChoice({}, "movie-1", "movie-2");

    expect(after["movie-1"].matches).toBe(1);
    expect(after["movie-2"].matches).toBe(1);
  });

  it("rewards beating a title rated far above more than one far below", () => {
    const start: Ranking = {
      "movie-1": { rating: 1500, matches: 5 },
      "movie-strong": { rating: 1900, matches: 5 },
      "movie-weak": { rating: 1100, matches: 5 },
    };

    const upset = recordChoice(start, "movie-1", "movie-strong");
    const expected = recordChoice(start, "movie-1", "movie-weak");

    expect(upset["movie-1"].rating - 1500).toBeGreaterThan(
      expected["movie-1"].rating - 1500,
    );
  });

  it("ignores a title compared with itself", () => {
    expect(recordChoice({}, "movie-1", "movie-1")).toEqual({});
  });
});

describe("nextPair", () => {
  it("has nothing to ask about a list of one", () => {
    expect(nextPair([item(1)], {})).toBeNull();
  });

  it("returns two different titles", () => {
    const pair = nextPair([item(1), item(2), item(3)], {}, () => 0);

    expect(pair).not.toBeNull();
    expect(pair![0].id).not.toBe(pair![1].id);
  });

  it("reaches for the title that has been compared least", () => {
    const ranking: Ranking = {
      "movie-1": { rating: 1500, matches: 6 },
      "movie-2": { rating: 1500, matches: 6 },
      "movie-3": { rating: 1500, matches: 0 },
    };

    const pair = nextPair([item(1), item(2), item(3)], ranking, () => 0);

    expect(pair![0].id).toBe(3);
  });

  it("tells films and shows with the same id apart", () => {
    const ranking = recordChoice({}, "movie-1", "tv-1");

    expect(Object.keys(ranking).sort()).toEqual(["movie-1", "tv-1"]);
  });
});

describe("rankedItems", () => {
  it("puts the highest rated first", () => {
    const ranking: Ranking = {
      "movie-1": { rating: 1400, matches: 2 },
      "movie-2": { rating: 1700, matches: 2 },
    };

    expect(
      rankedItems([item(1), item(2)], ranking).map((entry) => entry.item.id),
    ).toEqual([2, 1]);
  });

  it("includes titles that have never been compared", () => {
    expect(rankedItems([item(1), item(2)], {})).toHaveLength(2);
  });
});

describe("totalRounds", () => {
  it("counts each round once, not once per side", () => {
    let ranking = recordChoice({}, "movie-1", "movie-2");
    ranking = recordChoice(ranking, "movie-1", "movie-3");

    expect(totalRounds(ranking)).toBe(2);
  });

  it("is zero for an empty record", () => {
    expect(totalRounds({})).toBe(0);
  });
});

describe("recordChoice", () => {
  it("holds a runaway winner at the ceiling a reload would clamp it to", () => {
    let ranking: Ranking = { "movie-1": { rating: 3990, matches: 0 } };

    for (let round = 0; round < 50; round++) {
      ranking = recordChoice(ranking, "movie-1", "movie-2");
    }

    expect(ranking["movie-1"].rating).toBeLessThanOrEqual(4000);
    expect(sanitizeRanking(ranking)).toEqual(ranking);
  });

  it("holds a runaway loser at the floor", () => {
    let ranking: Ranking = { "movie-2": { rating: 10, matches: 0 } };

    for (let round = 0; round < 50; round++) {
      ranking = recordChoice(ranking, "movie-1", "movie-2");
    }

    expect(ranking["movie-2"].rating).toBeGreaterThanOrEqual(0);
    expect(sanitizeRanking(ranking)).toEqual(ranking);
  });
});

describe("rankingFor", () => {
  it("keeps only the entries the list still names", () => {
    const ranking = recordChoice({}, "movie-1", "movie-9");

    expect(rankingFor(ranking, items(2))).toEqual({
      "movie-1": ranking["movie-1"],
    });
  });

  it("does not invent an entry for a title never compared", () => {
    expect(rankingFor({}, items(3))).toEqual({});
  });

  it("tells a film and a show of the same id apart", () => {
    const ranking = recordChoice({}, "tv-1", "tv-2");

    expect(rankingFor(ranking, [item(1, "movie")])).toEqual({});
    expect(rankingFor(ranking, [item(1, "tv")])).toEqual({
      "tv-1": ranking["tv-1"],
    });
  });
});

describe("progressFor", () => {
  it("is complete for a list too short to rank", () => {
    expect(progressFor(items(1), {})).toBe(1);
  });

  it("starts at nothing", () => {
    expect(progressFor(items(10), {})).toBe(0);
  });

  it("never exceeds one, however long someone keeps playing", () => {
    let ranking: Ranking = {};
    for (let round = 0; round < 200; round++) {
      ranking = recordChoice(ranking, "movie-1", "movie-2");
    }

    expect(progressFor(items(4), ranking)).toBe(1);
  });

  // The bug this pair of tests exists for: rounds played against titles that
  // have since left the watchlist used to count towards the new list's bar, so
  // a freshly saved list could open at 100% having never been compared once.
  it("ignores rounds played by titles no longer on the list", () => {
    let ranking: Ranking = {};
    for (let round = 0; round < 40; round++) {
      ranking = recordChoice(ranking, "movie-90", "movie-91");
    }

    expect(progressFor(items(5), ranking)).toBe(0);
  });

  it("still counts rounds played by titles that remain", () => {
    const ranking = recordChoice({}, "movie-1", "movie-2");

    expect(progressFor(items(5), ranking)).toBeGreaterThan(0);
  });
});

describe("roundsRemaining", () => {
  it("counts down as rounds are played", () => {
    const before = roundsRemaining(items(10), {});
    const after = roundsRemaining(
      items(10),
      recordChoice({}, "movie-1", "movie-2"),
    );

    expect(after).toBe(before - 1);
  });

  it("never goes below zero, however long someone keeps going", () => {
    let ranking: Ranking = {};
    for (let round = 0; round < 100; round++) {
      ranking = recordChoice(ranking, "movie-1", "movie-2");
    }

    expect(roundsRemaining(items(4), ranking)).toBe(0);
  });

  it("asks for more from a longer list", () => {
    expect(roundsRemaining(items(40), {})).toBeGreaterThan(
      roundsRemaining(items(10), {}),
    );
  });

  it("asks for the full count again once the ranked titles are gone", () => {
    let ranking: Ranking = {};
    for (let round = 0; round < 40; round++) {
      ranking = recordChoice(ranking, "movie-90", "movie-91");
    }

    expect(roundsRemaining(items(5), ranking)).toBe(
      roundsRemaining(items(5), {}),
    );
  });
});

describe("positionOf", () => {
  it("counts from one, so it can be shown to a person", () => {
    const items = [item(1), item(2)];
    const ranking = recordChoice({}, "movie-2", "movie-1");

    expect(positionOf(items, ranking, "movie-2")).toBe(1);
    expect(positionOf(items, ranking, "movie-1")).toBe(2);
  });

  it("has no position for a title that is not on the list", () => {
    expect(positionOf([item(1)], {}, "movie-99")).toBeNull();
  });

  it("reports the move a winning choice produced", () => {
    const items = [item(1), item(2), item(3)];
    // Title 3 starts last on a tie-break and wins its way to the front.
    let ranking = recordChoice({}, "movie-3", "movie-1");
    ranking = recordChoice(ranking, "movie-3", "movie-2");

    expect(positionOf(items, ranking, "movie-3")).toBe(1);
  });
});
