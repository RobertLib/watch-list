import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMovieDetails: vi.fn(),
  getTVShowDetails: vi.fn(),
}));
const people = vi.hoisted(() => ({ loadPopularPeople: vi.fn() }));

vi.mock("./tmdb", () => ({ tmdbApi: api }));
vi.mock("./listing-sections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./listing-sections")>()),
  loadPopularPeople: people.loadPopularPeople,
}));

const { getMovieSnapshot, getPeopleSnapshot, getTVSnapshot } = await import(
  "./build-time-tmdb"
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "token");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * The build fails on a TMDB failure, deliberately – a deployment that silently
 * lost its snapshots would go live serving skeletons. A title that left TMDB
 * between the prebuild choosing it and its page rendering is not a failure,
 * though: one such title used to fail the deployment of every other.
 */
describe("build-time snapshots", () => {
  it("builds a title TMDB answers 404 for without a snapshot, asking once", async () => {
    api.getMovieDetails.mockRejectedValue(new Error("TMDB API error: 404 Not Found"));
    api.getTVShowDetails.mockRejectedValue(new Error("TMDB API error: 404 Not Found"));

    await expect(getMovieSnapshot(1)).resolves.toBeNull();
    await expect(getTVSnapshot(2)).resolves.toBeNull();
    expect(api.getMovieDetails).toHaveBeenCalledTimes(1);
  });

  it("still fails the build when a listing answers 404", async () => {
    people.loadPopularPeople.mockRejectedValue(new Error("TMDB API error: 404 Not Found"));

    await expect(getPeopleSnapshot()).rejects.toThrow(/Could not load the \/people list/);
    expect(people.loadPopularPeople).toHaveBeenCalledTimes(1);
  });

  it("still fails the build when a title keeps failing for any other reason", async () => {
    vi.useFakeTimers();
    api.getMovieDetails.mockRejectedValue(new Error("TMDB API error: 503 Service Unavailable"));

    const snapshot = getMovieSnapshot(3);
    const outcome = expect(snapshot).rejects.toThrow(/Could not load film 3/);
    await vi.runAllTimersAsync();
    await outcome;
    expect(api.getMovieDetails).toHaveBeenCalledTimes(5);
  });

  it("answers null without asking when the build has no token", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "");

    await expect(getMovieSnapshot(4)).resolves.toBeNull();
    expect(api.getMovieDetails).not.toHaveBeenCalled();
  });
});
