// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MovieTrailerButton } from "./MovieTrailerButton";
import { TVTrailerButton } from "@/components/tv/TVTrailerButton";
import type { Video } from "@/types/tmdb";

/**
 * The detail pages' "Play Trailer". It is only shown when the page's appended
 * `videos` hold a trailer – so the key is in hand before the click. It used to
 * have the overlay fetch `/videos` again anyway: an extra request and a
 * spinner, and when that request failed the overlay said "Video is not
 * available" over a trailer the page had already found.
 */

const api = vi.hoisted(() => ({
  getMovieVideos: vi.fn(() => Promise.reject(new Error("TMDB API error: 503"))),
  getTVShowVideos: vi.fn(() => Promise.reject(new Error("TMDB API error: 503"))),
}));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));

const trailer: Video = {
  id: "abc",
  key: "k-appended",
  name: "Official Trailer",
  site: "YouTube",
  type: "Trailer",
  official: true,
  published_at: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.clearAllMocks();
});

describe.each([
  ["film", () => <MovieTrailerButton trailer={trailer} />, "Play movie trailer"],
  ["series", () => <TVTrailerButton trailer={trailer} />, "Play TV show trailer"],
] as const)("the %s trailer button", (_kind, button, label) => {
  it("plays the trailer it was given, with no request and no spinner", () => {
    render(button());

    fireEvent.click(screen.getByRole("button", { name: label }));

    const player = screen.getByTitle("Official Trailer");
    expect(player.getAttribute("src")).toContain("/embed/k-appended?");
    expect(screen.queryByText("Loading video...")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.getMovieVideos).not.toHaveBeenCalled();
    expect(api.getTVShowVideos).not.toHaveBeenCalled();
  });

  it("closes, and plays again on the next click", () => {
    render(button());

    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: "Close video player" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTitle("Official Trailer")).toBeTruthy();
  });
});

it.each([
  () => <MovieTrailerButton />,
  () => <TVTrailerButton />,
])("shows no button when the page found no trailer", (button) => {
  render(button());
  expect(screen.queryByRole("button")).toBeNull();
});
