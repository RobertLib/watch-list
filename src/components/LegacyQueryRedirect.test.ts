import { describe, expect, it } from "vitest";
import { legacyGenreQueryTarget, legacyMoodQueryTarget } from "./LegacyQueryRedirect";

/**
 * The query-string genre and mood addresses from before they became paths.
 * `provider` meant two different things there, and only one of them is a path
 * now.
 */
describe("legacyGenreQueryTarget", () => {
  const target = (query: string) =>
    legacyGenreQueryTarget("movie", new URLSearchParams(query));

  it("sends a genre with no platform to its path", () => {
    expect(target("genre=action-28")).toBe("/genres/movie/action-28");
  });

  it("turns a platform slug into the landing path", () => {
    expect(target("genre=action-28&provider=netflix")).toBe(
      "/genres/movie/action-28/netflix",
    );
  });

  it.each([
    ["8", "8"],
    ["8,337", "8|337"],
    ["mine", "mine"],
    ["any", "any"],
  ])("keeps the filter value provider=%s as a filter", (provider, kept) => {
    const href = target(`genre=action-28&provider=${provider}&page=2&year=2020`);
    const [path, query] = href!.split("?");
    const params = new URLSearchParams(query);

    expect(path).toBe("/genres/movie/action-28");
    expect(params.get("provider")).toBe(kept);
    expect(params.get("page")).toBe("2");
    expect(params.get("year")).toBe("2020");
    expect(params.has("genre")).toBe(false);
  });

  it("drops a provider that is neither a platform nor a filter value", () => {
    expect(target("genre=action-28&provider=nonsense&page=3")).toBe(
      "/genres/movie/action-28?page=3",
    );
  });

  it("sends a bare listing to the genre index and an unknown genre nowhere", () => {
    expect(target("")).toBe("/genres");
    expect(target("genre=nothing-999999")).toBeNull();
  });
});

describe("legacyMoodQueryTarget", () => {
  it("sends a mood to its path, page included", () => {
    expect(legacyMoodQueryTarget(new URLSearchParams("id=easy-watch&page=2"))).toBe(
      "/mood/easy-watch?page=2",
    );
  });
});
