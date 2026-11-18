import { afterEach, describe, expect, it } from "vitest";
import {
  currentLocale,
  localeFromPathname,
  setServerLocaleGetter,
  stripLocale,
  t,
} from "./locale";
import { localizeTmdbUrl } from "@/lib/tmdb-cache";

afterEach(() => {
  setServerLocaleGetter(() => undefined);
});

describe("paths", () => {
  it("reads the language off a path", () => {
    expect(localeFromPathname("/cs")).toBe("cs");
    expect(localeFromPathname("/cs/movies")).toBe("cs");
    expect(localeFromPathname("/movies")).toBe("en");
    // A path that merely starts with the letters is English.
    expect(localeFromPathname("/csfd")).toBe("en");
  });

  it("strips the Czech prefix back to the English path", () => {
    expect(stripLocale("/cs")).toBe("/");
    expect(stripLocale("/cs/movies")).toBe("/movies");
    expect(stripLocale("/movies")).toBe("/movies");
  });
});

describe("currentLocale on the server", () => {
  it("is English unless a build load says otherwise", () => {
    expect(currentLocale()).toBe("en");
    setServerLocaleGetter(() => "cs");
    expect(currentLocale()).toBe("cs");
    expect(t(currentLocale(), "Movies", "Filmy")).toBe("Filmy");
  });
});

describe("localizeTmdbUrl", () => {
  const base = "https://api.themoviedb.org/3";

  it("leaves an English request exactly as it was", () => {
    const url = `${base}/movie/550?append_to_response=videos%2Cimages`;
    expect(localizeTmdbUrl(url)).toBe(url);
  });

  it("asks for Czech, and for trailers and images in English too", () => {
    setServerLocaleGetter(() => "cs");
    const url = new URL(
      localizeTmdbUrl(`${base}/movie/550?append_to_response=credits%2Cvideos%2Cimages`),
    );
    expect(url.searchParams.get("language")).toBe("cs-CZ");
    expect(url.searchParams.get("include_video_language")).toBe("cs,en,null");
    expect(url.searchParams.get("include_image_language")).toBe("cs,en,null");
  });

  it("adds only the language where nothing is filtered by it", () => {
    setServerLocaleGetter(() => "cs");
    const url = new URL(localizeTmdbUrl(`${base}/discover/movie?page=2`));
    expect(url.searchParams.get("language")).toBe("cs-CZ");
    expect(url.searchParams.has("include_video_language")).toBe(false);
  });

  it("keeps a language the caller chose – the English reviews", () => {
    setServerLocaleGetter(() => "cs");
    const url = `${base}/movie/550/reviews?language=en-US`;
    expect(localizeTmdbUrl(url)).toBe(url);
  });

  it("touches nothing that is not TMDB", () => {
    setServerLocaleGetter(() => "cs");
    const url = "https://en.wikipedia.org/w/api.php?action=query";
    expect(localizeTmdbUrl(url)).toBe(url);
  });
});
