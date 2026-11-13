// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { SimilarMovies } from "./movie/SimilarMovies";
import { SimilarTVShows } from "./tv/SimilarTVShows";
import { WhereToWatch } from "./WhereToWatch";
import { MovieDetails } from "./movie/MovieDetails";
import { TVDetails } from "./tv/TVDetails";
import { MovieCast } from "./movie/MovieCast";
import { TVCast } from "./tv/TVCast";
import { MovieCollection } from "./movie/MovieCollection";
import { PersonFilmography } from "./person/PersonFilmography";
import type {
  Credits,
  Movie,
  MovieDetails as MovieDetailsType,
  RegionWatchProviders,
  TVShow,
  TVShowDetails,
} from "@/types/tmdb";

/**
 * Every small image on the detail pages, at the size it is fetched.
 *
 * `next.config.ts` sets `images.unoptimized`, so there is no optimiser between
 * the URL and the network: whatever size the URL names is what the browser
 * downloads. These all used to name `w500` – a 500px poster for a 40px
 * thumbnail, a 500px logo for a 24px icon – which on a long filmography is
 * megabytes nobody sees. Each is now the smallest TMDB size that still covers
 * its box on a 2x screen.
 */

vi.mock("@/lib/tmdb", async () => ({
  tmdbApi: { getImageUrl: (await import("@/lib/tmdb-image")).getImageUrl },
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

function sizeOf(name: string): string | undefined {
  return screen
    .getByRole("img", { name })
    .getAttribute("data-src")
    ?.match(/^https:\/\/image\.tmdb\.org\/t\/p\/([^/]+)\//)?.[1];
}

const movie = {
  id: 1, title: "A Film", poster_path: "/film.jpg", release_date: "2020-01-01",
  overview: "", backdrop_path: null, vote_average: 7, vote_count: 10, genre_ids: [],
  adult: false, original_language: "en", original_title: "A Film", popularity: 1, video: false,
} satisfies Movie;
const show = {
  id: 2, name: "A Show", poster_path: "/show.jpg", first_air_date: "2020-01-01",
  overview: "", backdrop_path: null, vote_average: 7, vote_count: 10, genre_ids: [],
  adult: false, original_language: "en", original_name: "A Show", popularity: 1,
} satisfies TVShow;

const providers: RegionWatchProviders = {
  streaming: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 1 }],
  rent: [],
  buy: [],
};

const company = { id: 3, name: "A Studio", logo_path: "/studio.png", origin_country: "US" };
const network = { id: 4, name: "A Network", logo_path: "/network.png", origin_country: "US" };

const credits: Credits = {
  cast: [{ id: 5, name: "An Actor", character: "Someone", order: 0, profile_path: "/actor.jpg" }],
  crew: [],
};

it.each<[string, () => ReactElement, string, string]>([
  ["a similar film's 64px poster", () => <SimilarMovies similar={[movie]} title="Another Film" />, "A Film", "w154"],
  ["a similar show's 64px poster", () => <SimilarTVShows similar={[show]} title="Another Show" />, "A Show", "w154"],
  ["a title's 24px provider logo", () => <WhereToWatch providers={providers} title="A Film" regionName="Canada" />, "Netflix", "w92"],
  [
    "a film's 40px studio logo",
    () => (
      <MovieDetails
        details={{ original_title: "A Film", status: "Released", budget: 0, revenue: 0, production_companies: [company] } as unknown as MovieDetailsType}
      />
    ),
    "A Studio",
    "w92",
  ],
  [
    "a show's 40px studio logo",
    () => (
      <TVDetails
        details={{ original_name: "A Show", status: "Ended", first_air_date: "2020-01-01", last_air_date: null, networks: [], production_companies: [company] } as unknown as TVShowDetails}
      />
    ),
    "A Studio",
    "w92",
  ],
  [
    "a show's 56px network logo",
    () => (
      <TVDetails
        details={{ original_name: "A Show", status: "Ended", first_air_date: "2020-01-01", last_air_date: null, networks: [network], production_companies: [] } as unknown as TVShowDetails}
      />
    ),
    "A Network",
    "w154",
  ],
  ["a film's cast photo", () => <MovieCast credits={credits} />, "An Actor", "w300"],
  ["a show's cast photo", () => <TVCast credits={credits} />, "An Actor", "w300"],
  [
    "a collection's 64px poster",
    () => <MovieCollection collection={{ id: 6, name: "A Collection", poster_path: "/collection.jpg", backdrop_path: null }} />,
    "A Collection",
    "w154",
  ],
  [
    "a filmography's 40px film thumbnail",
    () => (
      <PersonFilmography
        movieCredits={[{ ...movie, characters: ["Someone"], jobs: [], hasCastCredit: true }]}
        tvCredits={[]}
      />
    ),
    "A Film",
    "w92",
  ],
  [
    "a filmography's 40px series thumbnail",
    () => (
      <PersonFilmography
        movieCredits={[]}
        tvCredits={[{ ...show, episode_count: 3, characters: ["Someone"], jobs: [], hasCastCredit: true }]}
      />
    ),
    "A Show",
    "w92",
  ],
])("fetches %s at %3$s's size, %4$s", (_name, element, alt, size) => {
  render(element());
  expect(sizeOf(alt)).toBe(size);
});

describe("a large image that is meant to be large", () => {
  // The collection banner spans the main column, up to ~960px wide – w1280 is
  // what covers it. Pinned so that shrinking the thumbnails did not shrink it.
  it("keeps the collection backdrop at w1280 for a full-width banner", () => {
    render(
      <MovieCollection collection={{ id: 6, name: "A Collection", poster_path: null, backdrop_path: "/wide.jpg" }} />,
    );
    expect(sizeOf("A Collection")).toBe("w1280");
  });
});
