// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useUtcDay } from "./useUtcDay";

/**
 * The day the puzzle is on, kept current.
 *
 * `todayUtc()` read once at render was right until midnight and wrong after it,
 * and the only thing that would have corrected it was an unrelated re-render.
 * What is pinned here is the two moments the day is re-read: the timer that
 * fires as UTC midnight passes, and the tab coming back into view after a sleep
 * that swallowed the timer.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useUtcDay", () => {
  it("starts on today's UTC date", () => {
    vi.setSystemTime(new Date("2026-09-14T10:00:00.000Z"));

    const { result } = renderHook(() => useUtcDay());

    expect(result.current).toBe("2026-09-14");
  });

  it("rolls over as UTC midnight passes", async () => {
    vi.setSystemTime(new Date("2026-09-14T23:59:00.000Z"));

    const { result } = renderHook(() => useUtcDay());
    expect(result.current).toBe("2026-09-14");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(result.current).toBe("2026-09-15");
  });

  // Once the first midnight has passed there is another one to wait for.
  it("keeps rolling over on the following nights", async () => {
    vi.setSystemTime(new Date("2026-09-14T23:59:00.000Z"));

    const { result } = renderHook(() => useUtcDay());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(result.current).toBe("2026-09-15");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    });
    expect(result.current).toBe("2026-09-16");
  });

  /**
   * A closed laptop suspends the timer. The clock has moved on when the tab is
   * looked at again, and that look is the moment to re-read the day.
   */
  it("re-reads the day when the tab comes back into view", () => {
    vi.setSystemTime(new Date("2026-09-14T10:00:00.000Z"));

    const { result } = renderHook(() => useUtcDay());
    expect(result.current).toBe("2026-09-14");

    // The clock jumps without the timer firing, as it does after a sleep.
    vi.setSystemTime(new Date("2026-09-16T08:00:00.000Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe("2026-09-16");
  });

  it("clears its timer on unmount", () => {
    const { unmount } = renderHook(() => useUtcDay());
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
