import { describe, expect, it } from "vitest";
import {
  buildMatchPath,
  extractListFromInput,
  matchLists,
} from "./list-match";
import { decodeSharedList, MAX_SHARED_LIST_ITEMS, type SharedListRef } from "./shared-list";

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
  it("puts both lists in the query", () => {
    expect(buildMatchPath([movie(550)], [show(1396)])).toBe(
      "/match?mine=m550&theirs=t1396",
    );
  });

  it("has no page to offer when one side is empty", () => {
    expect(buildMatchPath([], [movie(1)])).toBe("");
    expect(buildMatchPath([movie(1)], [])).toBe("");
  });

  it("keeps a shared title beyond the first sixty local titles", () => {
    const mine = Array.from({ length: 61 }, (_, index) => movie(index + 1));
    const params = new URLSearchParams(buildMatchPath(mine, [movie(61)]).split("?")[1]);
    const restored = decodeSharedList(params.get("mine")!);

    expect(matchLists(restored, decodeSharedList(params.get("theirs")!)).shared).toEqual([movie(61)]);
    expect(restored).toHaveLength(MAX_SHARED_LIST_ITEMS);
    expect(params.get("mineTruncated")).toBe("1");
  });

  it("preserves every match when the full other list overlaps the end of a long watchlist", () => {
    const mine = Array.from({ length: 200 }, (_, index) => movie(index + 1));
    const theirs = mine.slice(-MAX_SHARED_LIST_ITEMS);
    const params = new URLSearchParams(buildMatchPath(mine, theirs).split("?")[1]);

    expect(matchLists(
      decodeSharedList(params.get("mine")!),
      decodeSharedList(params.get("theirs")!),
    ).shared).toEqual(theirs);
  });

  it("keeps the order of both shared and unique titles", () => {
    const params = new URLSearchParams(
      buildMatchPath([movie(3), movie(1), show(3), movie(2)], [movie(2), movie(1)]).split("?")[1],
    );

    expect(matchLists(decodeSharedList(params.get("mine")!), decodeSharedList(params.get("theirs")!))).toEqual({
      shared: [movie(1), movie(2)],
      onlyMine: [movie(3), show(3)],
      onlyTheirs: [],
    });
    expect(params.has("mineTruncated")).toBe(false);
  });

  it("does not count duplicate or invalid entries as omitted titles", () => {
    const params = new URLSearchParams(buildMatchPath(
      [...Array.from({ length: 100 }, () => movie(1)), movie(0)],
      [movie(1)],
    ).split("?")[1]);

    expect(params.get("mine")).toBe("m1");
    expect(params.has("mineTruncated")).toBe(false);
  });
});

describe("extractListFromInput", () => {
  it("accepts a whole share URL, which is what people paste", () => {
    expect(
      extractListFromInput("https://www.watch-list.me/list?items=m550.t1396"),
    ).toEqual([movie(550), show(1396)]);
  });

  it("accepts a URL carrying a list title", () => {
    expect(
      extractListFromInput(
        "https://www.watch-list.me/list?items=m550&t=Rob%27s%20picks",
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

  // A malformed percent escape made `decodeURIComponent` throw out of the
  // submit handler, and the page went to the error boundary instead of saying
  // "not a share link". Whatever survives the bad escape is still read.
  it("does not throw on a malformed percent escape", () => {
    expect(() => extractListFromInput("m550.t1396 100%")).not.toThrow();
    expect(extractListFromInput("m550.t1396 100%")).toEqual([movie(550)]);
    expect(
      extractListFromInput("https://www.watch-list.me/list?items=m550%2"),
    ).toEqual([]);
    expect(
      extractListFromInput("https://www.watch-list.me/list?items=m550.t1396%2"),
    ).toEqual([movie(550)]);
  });
});
