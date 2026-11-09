// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SharedListContent } from "./SharedListContent";
import { MatchContent } from "./MatchContent";
import { getCachedMovieDetails } from "@/lib/tmdb-cache";
import type { MediaItem, MovieDetails } from "@/types/tmdb";

let query = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => "" }));
// Keep the shared-list resolver and loading hook real, so swallowing a failed
// catalogue request cannot masquerade as a successful empty result in the UI.
vi.mock("@/lib/tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));
vi.mock("@/components/MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <div>{items.map((item) => <p key={item.id}>{item.title}</p>)}</div>
  ),
}));
vi.mock("@/components/SaveSharedListButton", () => ({
  SaveSharedListButton: ({ items }: { items: MediaItem[] }) => (
    <button>Save {items.length} loaded titles</button>
  ),
}));
vi.mock("@/components/CompareWithMineButton", () => ({ CompareWithMineButton: () => null }));
vi.mock("@/components/MatchStarter", () => ({ MatchStarter: () => null }));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const movie: MovieDetails = {
  id: 550,
  title: "Fight Club",
  original_title: "Fight Club",
  overview: "",
  poster_path: "/poster.jpg",
  backdrop_path: null,
  release_date: "1999-10-15",
  vote_average: 8.4,
  vote_count: 100,
  popularity: 100,
  adult: false,
  video: false,
  original_language: "en",
  runtime: 139,
  budget: 63000000,
  revenue: 100000000,
  genres: [],
  production_companies: [],
  production_countries: [],
  spoken_languages: [],
  status: "Released",
  tagline: "",
  homepage: "",
  imdb_id: "tt0137523",
  belongs_to_collection: null,
};

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset().mockRejectedValue(
    new Error("TMDB API error: 503 Service Unavailable"),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared lists through the real resolver", () => {
  // Sixty or 120 reads used to run at interactive priority and outlive the page.
  it.each([
    ["shared list", "items=m550.m551", () => <SharedListContent />],
    ["comparison", "mine=m550&theirs=m551", () => <MatchContent />],
  ])("reads a %s as background work and releases it when the page leaves", async (_page, search, page) => {
    query = search;
    const signals: AbortSignal[] = [];
    vi.mocked(getCachedMovieDetails).mockImplementation((_id, _append, options) => {
      expect(options?.priority).toBe("background");
      signals.push(options!.signal!);
      return new Promise(() => {});
    });
    const view = render(page());
    await act(async () => {});

    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("reports a catalogue outage and reloads the shared list on retry", async () => {
    query = "items=m550";
    render(<SharedListContent />);

    expect(await screen.findByRole("heading", { name: "Could not load this list" })).toBeDefined();
    expect(screen.queryByText("0 titles")).toBeNull();

    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Fight Club")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(2);
  });

  it("explains partial shared-list failures and retries the missing titles", async () => {
    query = "items=m550.m551";
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 551) throw new Error("TMDB API error: 503 Service Unavailable");
      return movie;
    });
    render(<SharedListContent />);

    expect(await screen.findByText("Fight Club")).toBeDefined();
    expect(screen.getByText("1 title · 1 could not be loaded")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Saving this list includes only its 1 loaded title");
    expect(screen.getByRole("button", { name: "Save 1 loaded titles" })).toBeDefined();

    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => ({
      ...movie, id, title: id === 550 ? "Fight Club" : "Recovered title",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Recovered title")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save 2 loaded titles" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(4);
  });

  it("retries transient shared-list failures after reconnect and stops after recovery", async () => {
    query = "items=m550.m551";
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 551) throw new TypeError("Failed to fetch");
      return movie;
    });
    render(<SharedListContent />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeDefined();

    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => ({
      ...movie, id, title: id === 550 ? "Fight Club" : "Recovered title",
    }));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("Recovered title")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(4);
  });

  it("does not offer retries for removed shared titles", async () => {
    query = "items=m550.m551";
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 551) throw new Error("TMDB API error: 404 Not Found");
      return movie;
    });
    render(<SharedListContent />);
    expect(await screen.findByText("Fight Club")).toBeDefined();
    expect(screen.getByText("1 title · 1 could not be loaded")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(2);
  });

  it("does not report no overlap for identical lists while TMDB is down", async () => {
    query = "mine=m550&theirs=m550";
    render(<MatchContent />);

    expect(await screen.findByRole("heading", { name: "Could not compare these lists" })).toBeDefined();
    expect(screen.queryByText(/No overlap between these two lists/)).toBeNull();

    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("1 title you have both saved. Start there.")).toBeDefined();
    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(2);
  });

  it("keeps a removed shared title in the known overlap and displays the usable unique titles", async () => {
    query = "mine=m550.m1&theirs=m550.m2";
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 550) throw new Error("TMDB API error: 404 Not Found");
      return { ...movie, id, title: `Film ${id}` };
    });
    render(<MatchContent />);

    expect(await screen.findByText("1 title you have both saved. Start there.")).toBeDefined();
    expect(screen.queryByText(/No overlap between these two lists/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Both of you" })).toBeDefined();
    expect(screen.getByRole("note").textContent).toContain("Showing details for 0 of 1 title");
    expect(screen.getByRole("note").textContent).toContain("still counts");
    expect(screen.getByText("Film 1")).toBeDefined();
    expect(screen.getByText("Film 2")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the full overlap through a partial outage and restores missing cards on retry", async () => {
    query = "mine=m550.m551&theirs=m550.m551";
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 551) throw new Error("TMDB API error: 503 Service Unavailable");
      return movie;
    });
    render(<MatchContent />);

    expect(await screen.findByText("2 titles you have both saved. Start there.")).toBeDefined();
    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Details for 1 title could not be loaded");
    expect(screen.getByRole("note").textContent).toContain("Showing details for 1 of 2 titles");

    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => ({
      ...movie, id, title: id === 550 ? "Fight Club" : "Newly loaded film",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Newly loaded film")).toBeDefined();
    expect(screen.getByText("2 titles you have both saved. Start there.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(4);
  });

  it("keeps successful unique-title buckets when all shared-title details fail", async () => {
    query = "mine=m550.m1&theirs=m550.m2";
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 550) throw new TypeError("Failed to fetch");
      return { ...movie, id, title: `Film ${id}` };
    });
    render(<MatchContent />);

    expect(await screen.findByText("1 title you have both saved. Start there.")).toBeDefined();
    expect(screen.getByText("Film 1")).toBeDefined();
    expect(screen.getByText("Film 2")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Some title details could not be loaded");
    expect(screen.queryByText(/No overlap between these two lists/)).toBeNull();
  });
});
