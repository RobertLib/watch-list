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

function show(message: string, duration?: number, type: "success" | "error" | "info" = "success") {
  act(() => {
    toast.showToast(message, type, duration);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function region() {
  return screen.getByRole("region", { name: "Notifications" });
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

  /**
   * Every toast used to be `role="alert"`, so a routine "Added to your
   * watchlist" interrupted a screen reader exactly as a failure did.
   */
  it("announces confirmations politely and only failures assertively", () => {
    mountContainer();
    show("Added to your watchlist");
    show("Heads up", undefined, "info");
    show("Could not save", undefined, "error");

    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status.textContent).toContain("Added to your watchlist");
    expect(status.textContent).toContain("Heads up");
    expect(status.textContent).not.toContain("Could not save");
    expect(alert.textContent).toContain("Could not save");
    expect(alert.textContent).not.toContain("Added to your watchlist");
  });

  // A live region inserted already holding its message is not reliably read,
  // so both regions are there, empty, before anything is said into them.
  it("keeps both live regions in place before any toast arrives", () => {
    mountContainer();

    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status.textContent).toBe("");
    expect(alert.textContent).toBe("");
    // A new toast is read on its own, not with the whole stack again.
    expect(status.getAttribute("aria-atomic")).toBe("false");
    expect(alert.getAttribute("aria-atomic")).toBe("false");

    show("Added to your watchlist");
    expect(screen.getByRole("status")).toBe(status);
  });

  it("gives the close button a label rather than an icon alone", () => {
    mountContainer();
    show("Added to your watchlist");

    expect(
      screen.getByRole("button", { name: "Dismiss notification" }),
    ).toBeDefined();
  });
});

describe("how long a toast stays", () => {
  it("keeps an error up longer than a confirmation", async () => {
    mountContainer();
    show("Saved");
    show("Could not save", undefined, "error");

    await advance(3000);
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.getByText("Could not save")).toBeDefined();

    await advance(4999);
    expect(screen.getByText("Could not save")).toBeDefined();
    await advance(1);
    expect(screen.queryByText("Could not save")).toBeNull();
  });

  it("still honours a duration the caller asks for", async () => {
    mountContainer();
    show("Could not save", 1000, "error");

    await advance(1000);
    expect(screen.queryByText("Could not save")).toBeNull();
  });
});

describe("pausing", () => {
  it("stops the clock while the pointer is over the notifications, then resumes it", async () => {
    mountContainer();
    show("Saved", 3000);
    await advance(1000);

    fireEvent.mouseEnter(region());
    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(screen.getByText("Saved")).toBeDefined();

    fireEvent.mouseLeave(region());
    // The two seconds it had left, not a fresh three.
    await advance(1999);
    expect(screen.getByText("Saved")).toBeDefined();
    await advance(1);
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("stops the clock while keyboard focus is inside, then resumes it", async () => {
    mountContainer();
    show("Saved", 3000);
    const outside = document.createElement("button");
    document.body.appendChild(outside);

    act(() => screen.getByRole("button", { name: "Dismiss notification" }).focus());
    await advance(10_000);
    expect(screen.getByText("Saved")).toBeDefined();

    act(() => outside.focus());
    await advance(3000);
    expect(screen.queryByText("Saved")).toBeNull();
    outside.remove();
  });

  it("holds a toast that arrives while paused until the pause ends", async () => {
    mountContainer();
    show("First", 3000);
    fireEvent.mouseEnter(region());

    show("Second", 3000);
    await advance(10_000);
    expect(screen.getByText("Second")).toBeDefined();

    fireEvent.mouseLeave(region());
    await advance(3000);
    expect(screen.queryByText("First")).toBeNull();
    expect(screen.queryByText("Second")).toBeNull();
  });

  /**
   * Closing a toast from the keyboard removes the focused button, and a removed
   * element is not reliably blurred. The rest must not stay up for good.
   */
  it("resumes the others once the focused toast has been dismissed", async () => {
    mountContainer();
    show("First", 3000);
    show("Second", 3000);
    const [firstDismiss] = screen.getAllByRole("button", { name: "Dismiss notification" });
    act(() => firstDismiss.focus());
    await advance(10_000);

    fireEvent.click(firstDismiss);
    expect(screen.queryByText("First")).toBeNull();

    await advance(3000);
    expect(screen.queryByText("Second")).toBeNull();
  });

  it("resumes when the last toast leaves from under a pointer that did not move", async () => {
    mountContainer();
    show("First", 3000);
    fireEvent.mouseEnter(region());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    show("Second", 3000);
    await advance(3000);
    expect(screen.queryByText("Second")).toBeNull();
  });
});
