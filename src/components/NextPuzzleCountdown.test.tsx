// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { NextPuzzleCountdown, describeRemaining } from "./NextPuzzleCountdown";

/**
 * The countdown on a finished board. The ticking clock is hidden from screen
 * readers – a live region would announce every second – and that used to leave
 * them with "Next puzzle in" and nothing after it.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  const view = render(
    <p>
      Next puzzle in <NextPuzzleCountdown />
    </p>,
  );
  act(() => {});
  return view;
}

describe("NextPuzzleCountdown", () => {
  it("gives a screen reader the time left, in words", () => {
    const view = renderAt("2026-08-01T20:47:30.000Z");
    const spoken = view.container.querySelector(".sr-only");

    expect(spoken?.textContent).toBe("3 hours 12 minutes");
    // The clock itself stays visual only.
    expect(view.container.querySelector("time")?.getAttribute("aria-hidden")).toBe("true");
    expect(view.container.querySelector("time")?.textContent).toBe("03:12:30");
  });

  it("changes the words by the minute, not with every tick, and never announces them", () => {
    const view = renderAt("2026-08-01T20:47:30.000Z");
    const spoken = () => view.container.querySelector(".sr-only")?.textContent;

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(view.container.querySelector("time")?.textContent).toBe("03:12:25");
    expect(spoken()).toBe("3 hours 12 minutes");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(spoken()).toBe("3 hours 11 minutes");

    expect(view.container.querySelector("[aria-live], [role=status], [role=timer]")).toBeNull();
  });
});

describe("describeRemaining", () => {
  it.each([
    [0, "less than a minute"],
    [59_999, "less than a minute"],
    [60_000, "1 minute"],
    [45 * 60_000, "45 minutes"],
    [60 * 60_000, "1 hour"],
    [61 * 60_000, "1 hour 1 minute"],
    [86_400_000, "24 hours"],
  ])("reads %i ms as %j", (ms, words) => {
    expect(describeRemaining(ms)).toBe(words);
  });
});
