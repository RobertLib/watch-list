// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AddToCalendarButton } from "./AddToCalendarButton";
import type { CalendarEvent } from "@/lib/release-calendar";

/**
 * The `.ics` export, built in the browser.
 *
 * The download itself is the part worth pinning, and it is easy to break
 * silently: the object URL has to outlive the click that uses it – revoking it
 * immediately cancels the download in some browsers – and it has to be revoked
 * eventually, or every press leaks a blob for the life of the tab.
 *
 * The confirmation is the other half, and it is where the shared
 * `useTransientFlag` hook replaced a bare `setTimeout` that no unmount ever
 * cleared.
 */

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    key: "movie-550",
    id: 550,
    mediaType: "movie",
    slug: "fight-club-550",
    title: "Fight Club",
    posterPath: "/poster.jpg",
    date: "2026-12-01",
    seasonNumber: null,
    episodeNumber: null,
    episodeName: null,
    stillPath: null,
    ...over,
  };
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();

  createObjectURL = vi.fn(() => "blob:watchlist/ics");
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    value: createObjectURL,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: revokeObjectURL,
    configurable: true,
  });

  // jsdom does not navigate, so the anchor's own click is stubbed rather than
  // letting it try.
  click = vi.fn<() => void>();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function press() {
  act(() => {
    fireEvent.click(screen.getByRole("button"));
  });
}

describe("AddToCalendarButton", () => {
  it("renders nothing when there is nothing to export", () => {
    const { container } = render(<AddToCalendarButton events={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("builds a calendar file and hands it to the browser", () => {
    render(<AddToCalendarButton events={[event()]} />);

    press();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toContain("text/calendar");
  });

  /** Revoking before the click is handled cancels the download in some browsers. */
  it("holds the object url open until the click has certainly been handled", () => {
    render(<AddToCalendarButton events={[event()]} />);

    press();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:watchlist/ics");
  });

  it("confirms the download and then goes back to offering it", () => {
    render(<AddToCalendarButton events={[event()]} />);

    press();
    expect(screen.getByText("Downloaded")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Add to my calendar")).toBeDefined();
  });

  /** The leak the shared hook fixed: a confirmation timer outliving its button. */
  it("leaves no timer behind when unmounted mid-confirmation", () => {
    const { unmount } = render(<AddToCalendarButton events={[event()]} />);

    press();
    // The object-url revocation is still legitimately pending; let it run so
    // only the confirmation timer is left to account for.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("exports every event it was given", () => {
    render(
      <AddToCalendarButton
        events={[
          event({ key: "movie-550", title: "Fight Club" }),
          event({ key: "movie-27205", id: 27205, title: "Inception" }),
        ]}
      />,
    );

    press();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
