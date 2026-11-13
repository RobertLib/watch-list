import { describe, expect, it } from "vitest";
import type { RegionWatchProviders, WatchProvider } from "@/types/tmdb";
import { listServices, whereToWatchSummary } from "./where-to-watch";

function service(id: number, name: string): WatchProvider {
  return { provider_id: id, provider_name: name, logo_path: `/${id}.jpg`, display_priority: id };
}

function providers(parts: Partial<RegionWatchProviders>): RegionWatchProviders {
  return { streaming: [], rent: [], buy: [], ...parts };
}

describe("listServices", () => {
  it.each([
    [["Netflix"], "Netflix"],
    [["Netflix", "Hulu"], "Netflix and Hulu"],
    [["Netflix", "Hulu", "Max"], "Netflix, Hulu and Max"],
    [["Netflix", "Hulu", "Max", "Plex", "Tubi"], "Netflix, Hulu, Max and 2 more"],
  ])("writes %j as %s", (services, expected) => {
    expect(listServices(services)).toBe(expected);
  });
});

describe("whereToWatchSummary", () => {
  it("names where a title streams", () => {
    expect(
      whereToWatchSummary("Interstellar", providers({ streaming: [service(1, "Paramount+")] })),
    ).toBe("Interstellar is streaming on Paramount+.");
  });

  it("adds where it can be rented or bought", () => {
    expect(
      whereToWatchSummary(
        "Interstellar",
        providers({
          streaming: [service(1, "Paramount+")],
          rent: [service(2, "Apple TV Store")],
          buy: [service(2, "Apple TV Store"), service(3, "Amazon Video")],
        }),
      ),
    ).toBe(
      "Interstellar is streaming on Paramount+. You can also rent or buy it on Apple TV Store and Amazon Video.",
    );
  });

  it("says so when a title can only be rented", () => {
    expect(
      whereToWatchSummary("Heat", providers({ rent: [service(2, "Apple TV Store")] })),
    ).toBe(
      "Heat is not on a streaming service here right now, but you can rent it on Apple TV Store.",
    );
  });

  // No providers is an answer to the question, not a reason to say nothing.
  it("says so when a title cannot be had at all", () => {
    expect(whereToWatchSummary("Heat", providers({}))).toBe(
      "Heat is not available to stream, rent or buy here right now.",
    );
  });

  // TMDB lists one service under several ids – a plan, a channel – with the
  // same name, and "Netflix and Netflix" is not a sentence.
  it("names a service once however many ids it is listed under", () => {
    expect(
      whereToWatchSummary(
        "Heat",
        providers({ streaming: [service(8, "Netflix"), service(1796, "Netflix")] }),
      ),
    ).toBe("Heat is streaming on Netflix.");
  });
});
