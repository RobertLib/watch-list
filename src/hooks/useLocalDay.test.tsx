// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useLocalDay } from "./useLocalDay";

const ORIGINAL_TZ = process.env.TZ;

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

describe("useLocalDay", () => {
  it.each([
    ["Europe/Prague", "2026-10-05T22:30:00Z", "2026-10-06"],
    ["America/New_York", "2026-10-06T02:30:00Z", "2026-10-05"],
  ])("reads the visitor's date in %s rather than the UTC date", (zone, instant, day) => {
    process.env.TZ = zone;
    vi.setSystemTime(new Date(instant));
    const { result } = renderHook(() => useLocalDay());
    expect(result.current).toBe(day);
  });

  it("rolls over at local midnight and arms the following night", async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
    const { result } = renderHook(() => useLocalDay());
    expect(result.current).toBe("2026-10-05");

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(result.current).toBe("2026-10-06");

    await act(async () => { await vi.advanceTimersByTimeAsync(86_400_000); });
    expect(result.current).toBe("2026-10-07");
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each([
    [2026, 2, 29, 23, "2026-03-30"],
    [2026, 9, 25, 25, "2026-10-26"],
  ])("uses the actual midnight after a %s-%s-%s DST day", async (year, month, day, hours, nextDay) => {
    vi.setSystemTime(new Date(year, month, day));
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const { result } = renderHook(() => useLocalDay());
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), hours * 3_600_000 + 50);

    await act(async () => { await vi.advanceTimersByTimeAsync(hours * 3_600_000 + 100); });
    expect(result.current).toBe(nextDay);
  });

  it("catches up and re-arms midnight when a suspended tab becomes visible", async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 10));
    const { result } = renderHook(() => useLocalDay());
    const visibility = vi.spyOn(document, "visibilityState", "get");
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59, 59));
    visibility.mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current).toBe("2026-10-05");

    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current).toBe("2026-10-07");
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(result.current).toBe("2026-10-08");
  });

  it("hydrates a static export from another day without a mismatch", () => {
    function Day() {
      return <span>{useLocalDay() || "Loading"}</span>;
    }
    vi.setSystemTime(new Date(2026, 9, 5, 10));
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Day />);
    document.body.append(container);
    expect(container.textContent).toBe("Loading");
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(new Date(2026, 9, 6, 10));
    const onRecoverableError = vi.fn();
    render(<Day />, { container, hydrate: true, onRecoverableError });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe("2026-10-06");
  });

  it("clears its timer and visibility listener on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useLocalDay());
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
