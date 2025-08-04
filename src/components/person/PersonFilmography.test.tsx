// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ComponentProps } from "react";
import type { PersonMovieWork } from "@/lib/person-credits";
import { PersonFilmography } from "./PersonFilmography";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

const ORIGINAL_TZ = process.env.TZ;

function movie(release_date: string): PersonMovieWork {
  return {
    id: 1, title: "A Film", release_date, poster_path: null,
    vote_average: 0, vote_count: 0, popularity: 1,
    characters: [], jobs: [], hasCastCredit: false,
  };
}

function filmography(releaseDate: string) {
  return <PersonFilmography movieCredits={[movie(releaseDate)]} tvCredits={[]} />;
}

beforeEach(() => {
  process.env.TZ = "Europe/Prague";
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("PersonFilmography release days", () => {
  it.each([
    ["America/New_York", "2026-10-06T02:30:00Z", "2026-10-06", "Soon"],
    ["America/New_York", "2026-10-06T02:30:00Z", "2026-10-05", "2026"],
    ["Europe/Prague", "2026-10-05T22:30:00Z", "2026-10-06", "2026"],
    ["Europe/Prague", "2026-10-05T22:30:00Z", "", "—"],
  ])("labels the %s calendar release %s / %s as %s", (zone, instant, releaseDate, label) => {
    process.env.TZ = zone;
    vi.setSystemTime(new Date(instant));
    render(filmography(releaseDate));

    const row = screen.getByRole("link", { name: `${label} A Film` });
    expect(within(row).getByText(label)).toBeTruthy();
    if (label !== "Soon") expect(screen.queryByText("Soon")).toBeNull();
  });

  it("removes Soon when the release day starts without another interaction", async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
    render(filmography("2026-10-06"));
    expect(screen.getByText("Soon")).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.queryByText("Soon")).toBeNull();
    expect(screen.getByText("2026")).toBeTruthy();
  });

  it("hydrates a static export on a later year without stale date badges", () => {
    vi.setSystemTime(new Date(2025, 11, 31, 23));
    const content = filmography("2026-01-02");
    const container = document.createElement("div");
    container.innerHTML = renderToString(content);
    document.body.append(container);
    expect(container.textContent).not.toContain("Soon");

    vi.setSystemTime(new Date(2026, 0, 1, 9));
    const onRecoverableError = vi.fn();
    render(content, { container, hydrate: true, onRecoverableError });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(screen.getByText("Soon")).toBeTruthy();
  });
});

it("names the sort control and exposes which media filter is selected", () => {
  render(filmography("2026-01-01"));

  expect(screen.getByRole("combobox", { name: "Sort filmography" })).toBeTruthy();
  const filters = screen.getByRole("group", { name: "Filter filmography by media type" });
  expect(within(filters).getByRole("button", { name: "All", pressed: true })).toBeTruthy();

  fireEvent.click(within(filters).getByRole("button", { name: "Movies (1)" }));

  expect(within(filters).getByRole("button", { name: "Movies (1)", pressed: true })).toBeTruthy();
  expect(within(filters).getByRole("button", { name: "All", pressed: false })).toBeTruthy();
});
