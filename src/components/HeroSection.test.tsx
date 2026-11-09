// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { HeroSection } from "./HeroSection";
import {
  setRegion,
  setSelectedProviderIds,
  setWatchProviderFilter,
} from "@/lib/settings";
import type { Movie, TMDBResponse } from "@/types/tmdb";

// Keep settings, discovery queries and the loading hook real: a valid provider
// filter can return an empty catalogue without any request having failed.
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tmdb-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb-cache")>()),
  getCachedDiscoveryRequest: request,
}));
vi.mock("./HeroButtons", () => ({ HeroButtons: () => null }));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <span data-src={src}>{alt}</span>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const EMPTY_PAGE = {
  page: 1,
  results: [],
  total_pages: 0,
  total_results: 0,
};

function moviePage(): TMDBResponse<Movie> {
  return {
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [{
      id: 550,
      title: "Featured film",
      original_title: "Featured film",
      overview: "A film to watch tonight.",
      poster_path: null,
      backdrop_path: "/backdrop.jpg",
      release_date: "2020-01-01",
      vote_average: 8,
      vote_count: 100,
      genre_ids: [],
      adult: false,
      original_language: "en",
      popularity: 10,
      video: false,
    }],
  };
}

function resolveFeaturedMovie(url: string) {
  return Promise.resolve(
    new URL(url).pathname.endsWith("/movie") ? moviePage() : EMPTY_PAGE,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  setRegion("CZ");
  setSelectedProviderIds([15]);
  setWatchProviderFilter("streaming-only");
  request.mockReset().mockResolvedValue(EMPTY_PAGE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HeroSection", () => {
  it("offers settings for a successful empty regional catalogue without reporting an outage", async () => {
    await act(async () => { render(<HeroSection />); });

    expect(screen.getByRole("heading", { name: "No titles match your settings" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Review profile settings" }).getAttribute("href")).toBe("/profile");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/TMDB did not answer/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    for (const [rawUrl] of request.mock.calls) {
      const params = new URL(rawUrl).searchParams;
      expect(params.get("watch_region")).toBe("CZ");
      expect(params.get("with_watch_providers")).toBe("15");
    }
  });

  it("keeps failed requests retryable and replaces the error with a recovered feature", async () => {
    request.mockRejectedValue(new Error("TMDB is unavailable"));
    await act(async () => { render(<HeroSection />); });

    expect(screen.getByRole("alert").textContent).toContain("TMDB did not answer");
    expect(screen.queryByRole("heading", { name: "No titles match your settings" })).toBeNull();

    request.mockImplementation(resolveFeaturedMovie);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(screen.getByRole("heading", { name: "Featured film" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("loads a feature when the viewer changes settings after an empty catalogue", async () => {
    await act(async () => { render(<HeroSection />); });
    expect(screen.getByRole("heading", { name: "No titles match your settings" })).toBeDefined();

    request.mockImplementation(resolveFeaturedMovie);
    await act(async () => { setSelectedProviderIds([8]); });

    expect(screen.getByRole("heading", { name: "Featured film" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "No titles match your settings" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(request).toHaveBeenCalledTimes(4);
    for (const [rawUrl] of request.mock.calls.slice(2)) {
      expect(new URL(rawUrl).searchParams.get("with_watch_providers")).toBe("8");
    }
  });

  // The page's largest paint. `original` is often 1920–3840px wide, and with
  // `unoptimized` set the size named is the size downloaded.
  it("asks for the w1280 backdrop rather than the original", async () => {
    request.mockImplementation(resolveFeaturedMovie);
    await act(async () => { render(<HeroSection />); });

    expect(
      screen.getByText("Featured backdrop for Featured film").getAttribute("data-src"),
    ).toBe("https://image.tmdb.org/t/p/w1280/backdrop.jpg");
  });
});
