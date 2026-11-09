import { describe, expect, it } from "vitest";
import { describe as describeText, movieMetadata } from "./title-metadata";
import type { MovieDetails } from "@/types/tmdb";

describe("describe", () => {
  const suffix = "Where to stream it.";

  it("keeps a short summary whole", () => {
    expect(describeText("A short one.", suffix)).toBe("A short one. Where to stream it.");
  });

  it("cuts a long summary at a word, inside the length a result shows", () => {
    const text = "word ".repeat(80);
    const result = describeText(text, suffix);

    expect(result.length).toBeLessThanOrEqual(155);
    expect(result).toMatch(/^(word )+word… Where to stream it\.$/);
  });

  it("falls back to the suffix alone where there is no summary", () => {
    expect(describeText("", suffix)).toBe(suffix);
    expect(describeText(null, suffix)).toBe(suffix);
  });
});

describe("movieMetadata", () => {
  const film = {
    id: 550,
    title: "Fight Club",
    overview: "An insomniac office worker forms an underground fight club.",
    release_date: "1999-10-15",
    backdrop_path: "/backdrop.jpg",
    poster_path: "/poster.jpg",
  } as MovieDetails;

  it("gives a prerendered film its own title, canonical and card", () => {
    const metadata = movieMetadata("/movie/fight-club-550", film);

    expect(metadata.title).toBe("Fight Club (1999) – Where to Watch");
    expect(metadata.alternates?.canonical).toMatch(/\/movie\/fight-club-550$/);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({
      type: "video.movie",
      images: [{ url: "https://image.tmdb.org/t/p/w1280/backdrop.jpg", width: 1280, height: 720 }],
    });
  });

  it("keeps a page the build had no data for out of the index", () => {
    const metadata = movieMetadata("/movie/fight-club-550", null);

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
