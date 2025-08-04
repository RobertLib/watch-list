// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastContainer, toast } from "./Toast";

/**
 * The app's one notification surface, and the one timer in it that used to
 * outlive what it referred to.
 *
 * A toast closed by hand left its auto-dismissal running to filter a list the
 * toast had already left, and unmounting the container left every outstanding
 * timer holding a `setToasts` for state that no longer existed. Neither was
 * visible – React 18 stopped warning about the second – so what is asserted here
 * is the timer itself: `vi.getTimerCount()` is the only witness there is.
 */

/** Let the container's effect register its listener before anything is shown. */
function mountContainer() {
  const view = render(<ToastContainer />);
  return view;
}

function show(message: string, duration?: number) {
  act(() => {
    toast.showToast(message, "success", duration);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastContainer", () => {
  it("shows what it is asked to show", () => {
    mountContainer();
    show("Added to your watchlist");

    expect(screen.getByText("Added to your watchlist")).toBeDefined();
  });

  it("takes it away again once the duration is up", async () => {
    mountContainer();
    show("Added to your watchlist", 3000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.queryByText("Added to your watchlist")).toBeNull();
  });

  it("keeps it up until then", async () => {
    mountContainer();
    show("Added to your watchlist", 3000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(screen.getByText("Added to your watchlist")).toBeDefined();
  });

  it("stacks several at once", () => {
    mountContainer();
    show("First");
    show("Second");

    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
  });

  // Two toasts carrying the same words are still two toasts: a shared React key
  // is a dismissal that closes the wrong one.
  it("gives two identical messages two identities", () => {
    mountContainer();
    show("Saved");
    show("Saved");

    expect(screen.getAllByText("Saved")).toHaveLength(2);
  });
});

describe("dismissing", () => {
  it("closes the one that was clicked", () => {
    mountContainer();
    show("First");
    show("Second");

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);

    expect(screen.queryByText("First")).toBeNull();
    expect(screen.getByText("Second")).toBeDefined();
  });

  /**
   * The regression. A hand-dismissed toast used to leave its timer pending for
   * the rest of its duration, to eventually filter a list it had already left.
   */
  it("cancels the auto-dismissal it no longer needs", () => {
    mountContainer();
    show("Saved", 3000);
    expect(vi.getTimerCount()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves the other toasts' timers alone", () => {
    mountContainer();
    show("First", 3000);
    show("Second", 3000);
    expect(vi.getTimerCount()).toBe(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);

    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("unmounting", () => {
  /**
   * The other half of the regression: the container lives in the root layout, so
   * in the app it effectively never unmounts – which is exactly why a leak here
   * went unnoticed. It does unmount in a test, and it would in any future layout
   * that moved it.
   */
  it("clears every timer it still has running", () => {
    const { unmount } = mountContainer();
    show("First", 3000);
    show("Second", 5000);
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops listening, so a later toast reaches nothing", () => {
    const { unmount } = mountContainer();
    unmount();

    expect(() => show("After the fact")).not.toThrow();
    expect(screen.queryByText("After the fact")).toBeNull();
  });
});

describe("as a screen reader meets it", () => {
  it("names the region the notifications arrive in", () => {
    mountContainer();

    expect(screen.getByRole("region", { name: "Notifications" })).toBeDefined();
  });

  it("announces each toast as an alert", () => {
    mountContainer();
    show("Added to your watchlist");

    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("gives the close button a label rather than an icon alone", () => {
    mountContainer();
    show("Added to your watchlist");

    expect(
      screen.getByRole("button", { name: "Dismiss notification" }),
    ).toBeDefined();
  });
});
