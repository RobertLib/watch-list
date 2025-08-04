import { describe, expect, it } from "vitest";
import {
  resolveMovieCertification,
  resolveTVCertification,
} from "./media-certification";
import type { ContentRatingEntry, ReleaseDateEntry } from "@/types/tmdb";

function release(certification: string): ReleaseDateEntry {
  return {
    certification,
    iso_639_1: "",
    release_date: "2020-01-01T00:00:00.000Z",
    type: 3,
    note: "",
  };
}

const resolvers = [
  {
    name: "movie",
    resolve: (entries: ContentRatingEntry[], region: string) =>
      resolveMovieCertification({
        id: 1,
        results: entries.map((entry) => ({
          iso_3166_1: entry.iso_3166_1,
          release_dates: [release(""), release(entry.rating)],
        })),
      }, region),
  },
  {
    name: "TV",
    resolve: (entries: ContentRatingEntry[], region: string) =>
      resolveTVCertification({ id: 1, results: entries }, region),
  },
];

describe.each(resolvers)("$name certification", ({ resolve }) => {
  const entries = [
    { iso_3166_1: "DE", rating: "16" },
    { iso_3166_1: "US", rating: "R" },
    { iso_3166_1: "GB", rating: "15" },
  ];

  it("prefers the selected country over US and response order", () => {
    expect(resolve(entries, "GB")).toEqual({ rating: "15", region: "GB" });
    expect(resolve(entries, "US")).toEqual({ rating: "R", region: "US" });
  });

  it("keeps the US fallback and its actual country when the regional rating is blank", () => {
    expect(resolve([
      ...entries.filter((entry) => entry.iso_3166_1 !== "GB"),
      { iso_3166_1: "GB", rating: "   " },
    ], "GB")).toEqual({ rating: "R", region: "US" });
    expect(resolve(entries, "CZ")).toEqual({ rating: "R", region: "US" });
  });

  it("uses the first nonempty fallback when neither selected country nor US has one", () => {
    expect(resolve([
      { iso_3166_1: "GB", rating: "" },
      { iso_3166_1: "US", rating: " " },
      { iso_3166_1: "DE", rating: " 16 " },
    ], "GB")).toEqual({ rating: "16", region: "DE" });
  });

  it("omits certification if every entry is blank", () => {
    expect(resolve([
      { iso_3166_1: "GB", rating: "" },
      { iso_3166_1: "US", rating: " " },
    ], "GB")).toBeUndefined();
    expect(resolve([], "GB")).toBeUndefined();
  });
});

it("handles absent appended certification payloads", () => {
  expect(resolveMovieCertification(undefined, "GB")).toBeUndefined();
  expect(resolveTVCertification(undefined, "GB")).toBeUndefined();
});
