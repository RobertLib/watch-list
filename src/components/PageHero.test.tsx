// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { PageHero, backdropForDay } from "./PageHero";

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    preload,
    loading,
  }: {
    alt: string;
    src: string;
    preload?: boolean;
    loading?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      src={src}
      data-preload={preload ? "true" : undefined}
      data-loading={loading}
    />
  ),
}));

const FILM = "https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg";
const SERIES = "https://image.tmdb.org/t/p/w1280/rkB4LyZHo1NHXFEDHl9vSD9r1lI.jpg";

// Local wall-clock times, so each test means the same day in every zone.
const FILM_DAY = new Date(2026, 10, 9, 12); // 2026-11-09
const SERIES_DAY = new Date(2026, 10, 10, 12); // 2026-11-10

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function backdrop() {
  return screen.getByRole("img").getAttribute("src");
}

describe("PageHero backdrops", () => {
  // `original` is often 1920–3840px wide, and with `unoptimized` set the size
  // named is the size downloaded – for the largest paint on the page.
  it("asks for w1280 rather than the original", () => {
    render(<PageHero title="Movies" description="Films" mediaType="movie" />);
    expect(backdrop()).toBe(FILM);
    cleanup();

    render(<PageHero title="TV Shows" description="Series" mediaType="tv" />);
    expect(backdrop()).toBe(SERIES);
  });

  it("preloads a backdrop that is settled at build time", () => {
    render(<PageHero title="Movies" description="Films" mediaType="movie" />);

    expect(screen.getByRole("img").getAttribute("data-preload")).toBe("true");
  });

  it("keeps the page's h1", () => {
    render(<PageHero title="Genres" description="Both" mediaType="all" />);

    expect(screen.getByRole("heading", { level: 1, name: "Genres" })).toBeTruthy();
  });
});

/**
 * The mixed banner on /genres. It used to choose in a Server Component – once,
 * at build time, in a static export – so "changes daily" stopped being true the
 * day after each deploy.
 */
describe("PageHero on a page about both films and series", () => {
  it("alternates by the visitor's day", () => {
    vi.useFakeTimers({ now: FILM_DAY });
    render(<PageHero title="Genres" description="Both" />);
    expect(backdrop()).toBe(FILM);
    cleanup();

    vi.setSystemTime(SERIES_DAY);
    render(<PageHero title="Genres" description="Both" />);
    expect(backdrop()).toBe(SERIES);
  });

  it("prerenders the same backdrop whatever day the build runs", () => {
    vi.useFakeTimers({ now: FILM_DAY });
    const filmDayHtml = renderToString(<PageHero title="Genres" description="Both" />);
    vi.setSystemTime(SERIES_DAY);
    const seriesDayHtml = renderToString(<PageHero title="Genres" description="Both" />);

    expect(seriesDayHtml).toBe(filmDayHtml);
    expect(filmDayHtml).toContain(FILM);
  });

  // The prerendered HTML cannot know the day, so the hydration pass has to
  // render what the HTML holds and switch only afterwards – never mismatch.
  it("hydrates the prerendered backdrop, then switches to today's", async () => {
    vi.useFakeTimers({ now: SERIES_DAY });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(<PageHero title="Genres" description="Both" />);
    document.body.appendChild(container);

    const recoverable = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <PageHero title="Genres" description="Both" />, {
        onRecoverableError: recoverable,
      });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector("img")!.getAttribute("src")).toBe(SERIES);

    act(() => root.unmount());
    container.remove();
  });

  // It does not ask to be preloaded: on half of all days the prerendered file
  // is replaced as soon as the page hydrates.
  it("loads eagerly instead of preloading a backdrop it may replace", () => {
    render(<PageHero title="Genres" description="Both" />);
    const image = screen.getByRole("img");

    expect(image.getAttribute("data-preload")).toBeNull();
    expect(image.getAttribute("data-loading")).toBe("eager");
  });

  it("turns over at local midnight while the page stays open", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 23, 59, 59) });
    render(<PageHero title="Genres" description="Both" />);
    expect(backdrop()).toBe(FILM);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(backdrop()).toBe(SERIES);
  });
});

describe("backdropForDay", () => {
  it("changes every day", () => {
    expect(backdropForDay("2026-11-09")).not.toBe(backdropForDay("2026-11-10"));
    expect(backdropForDay("2026-11-10")).not.toBe(backdropForDay("2026-11-11"));
  });

  // Day-of-year parity gave the 31st of December (365) and the 1st of January
  // (1) the same backdrop.
  it("changes across New Year too", () => {
    expect(backdropForDay("2025-12-31")).not.toBe(backdropForDay("2026-01-01"));
    expect(backdropForDay("2024-12-31")).not.toBe(backdropForDay("2025-01-01"));
  });
});
