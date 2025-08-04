// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransientFlag } from "./useTransientFlag";

function Probe({ duration = 1000 }: { duration?: number }) {
  const [flag, raise] = useTransientFlag(duration);

  return (
    <button onClick={raise} data-testid="probe">
      {flag ? "on" : "off"}
    </button>
  );
}

describe("useTransientFlag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function click() {
    act(() => {
      screen.getByTestId("probe").click();
    });
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("starts down", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("off");
  });

  it("goes up on demand and back down after the duration", () => {
    render(<Probe duration={1000} />);

    click();
    expect(screen.getByTestId("probe").textContent).toBe("on");

    advance(999);
    expect(screen.getByTestId("probe").textContent).toBe("on");

    advance(1);
    expect(screen.getByTestId("probe").textContent).toBe("off");
  });

  /**
   * The bug the hook exists to fix. Two clicks 600ms apart used to leave the
   * first click's timer running, and it lowered the flag 400ms into the second
   * click's window instead of 1000ms.
   */
  it("re-raising restarts the clock rather than inheriting the old one", () => {
    render(<Probe duration={1000} />);

    click();
    advance(600);
    click();

    // Where the first timer would have fired.
    advance(400);
    expect(screen.getByTestId("probe").textContent).toBe("on");

    advance(600);
    expect(screen.getByTestId("probe").textContent).toBe("off");
  });

  it("clears its timer on unmount", () => {
    const { unmount } = render(<Probe duration={1000} />);

    click();
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no timer behind once it has fired", () => {
    render(<Probe duration={1000} />);

    click();
    advance(1000);

    expect(vi.getTimerCount()).toBe(0);
  });
});
