import { describe, expect, it } from "vitest";
import {
  buildMatchPath,
  extractListFromInput,
  matchLists,
} from "./list-match";
import type { SharedListRef } from "./shared-list";

const movie = (id: number): SharedListRef => ({ id, mediaType: "movie" });
const show = (id: number): SharedListRef => ({ id, mediaType: "tv" });

describe("matchLists", () => {
  it("finds what both lists hold", () => {
    const match = matchLists([movie(1), movie(2)], [movie(2), movie(3)]);

    expect(match.shared).toEqual([movie(2)]);
  });

  it("keeps each side's own titles apart", () => {
    const match = matchLists([movie(1), movie(2)], [movie(2), movie(3)]);

    expect(match.onlyMine).toEqual([movie(1)]);
    expect(match.onlyTheirs).toEqual([movie(3)]);
  });

  it("does not confuse a film with a series of the same id", () => {
    const match = matchLists([movie(1)], [show(1)]);

    expect(match.shared).toEqual([]);
    expect(match.onlyMine).toEqual([movie(1)]);
    expect(match.onlyTheirs).toEqual([show(1)]);
  });

  it("preserves the first list's order in the overlap", () => {
    const match = matchLists(
      [movie(3), movie(1), movie(2)],
      [movie(1), movie(2), movie(3)],
    );

    expect(match.shared.map((ref) => ref.id)).toEqual([3, 1, 2]);
  });

  it("has no overlap with an empty list", () => {
    expect(matchLists([movie(1)], []).shared).toEqual([]);
    expect(matchLists([], [movie(1)]).onlyTheirs).toEqual([movie(1)]);
  });
});

describe("buildMatchPath", () => {
  it("puts both lists in the path", () => {
    expect(buildMatchPath([movie(550)], [show(1396)])).toBe(
      "/match/m550/t1396",
    );
  });

  it("has no page to offer when one side is empty", () => {
    expect(buildMatchPath([], [movie(1)])).toBe("");
    expect(buildMatchPath([movie(1)], [])).toBe("");
  });
});

describe("extractListFromInput", () => {
  it("accepts a whole share URL, which is what people paste", () => {
    expect(
      extractListFromInput("https://www.watch-list.me/list/m550.t1396"),
    ).toEqual([movie(550), show(1396)]);
  });

  it("accepts a URL carrying a list title", () => {
    expect(
      extractListFromInput(
        "https://www.watch-list.me/list/m550?t=Rob%27s%20picks",
      ),
    ).toEqual([movie(550)]);
  });

  it("accepts the bare encoded list", () => {
    expect(extractListFromInput("m550.t1396")).toEqual([movie(550), show(1396)]);
  });

  it("tolerates surrounding whitespace from a chat app", () => {
    expect(extractListFromInput("  m550  ")).toEqual([movie(550)]);
  });

  it("returns nothing for something that is not a list", () => {
    expect(extractListFromInput("https://example.com")).toEqual([]);
    expect(extractListFromInput("")).toEqual([]);
  });
});
