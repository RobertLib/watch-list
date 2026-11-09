// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoadMoreButton } from "./LoadMoreButton";

/**
 * Paging, on every listing in the app.
 *
 * The failure case is the one that matters: a load that throws must still put
 * the button back, or a single blip against TMDB ends the listing permanently
 * and the only way on is a page reload. `finally` is what guarantees that, and a
 * test is the only thing that keeps it there.
 *
 * The double-click guard is the other half. Two clicks during a slow load would
 * otherwise fetch the same page twice and append it twice.
 */

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LoadMoreButton", () => {
  it("calls the loader and then the completion callback", async () => {
    const onLoadMore = vi.fn(async () => {});
    const onLoadComplete = vi.fn();

    render(
      <LoadMoreButton onLoadMore={onLoadMore} onLoadComplete={onLoadComplete} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onLoadComplete).toHaveBeenCalledTimes(1);
  });

  it("shows it is busy while the load is in flight", async () => {
    const { promise, resolve } = deferred();
    render(<LoadMoreButton onLoadMore={() => promise} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Loading...")).toBeDefined();

    await act(async () => {
      resolve();
      await promise;
    });

    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("false");
  });

  /** One blip must not end the listing for good. */
  it("puts the button back after a failed load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onLoadMore = vi.fn(async () => {
      throw new Error("TMDB API error: 429 Too Many Requests");
    });

    render(<LoadMoreButton onLoadMore={onLoadMore} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("Could not load more titles");
    expect(screen.getByText("Try again")).toBeDefined();
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);

    // And it is still usable, which is the whole point of restoring it.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("clears the failure on retry and calls completion only after recovery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = deferred();
    const onLoadMore = vi.fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockReturnValueOnce(retry.promise);
    const onLoadComplete = vi.fn();
    render(<LoadMoreButton onLoadMore={onLoadMore} onLoadComplete={onLoadComplete} />);

    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("alert")).toBeDefined();
    expect(onLoadComplete).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");

    await act(async () => { retry.resolve(); await retry.promise; });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Load More")).toBeDefined();
    expect(onLoadComplete).toHaveBeenCalledTimes(1);
  });

  it("does not call the completion callback when the load failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onLoadComplete = vi.fn();

    render(
      <LoadMoreButton
        onLoadMore={async () => {
          throw new Error("nope");
        }}
        onLoadComplete={onLoadComplete}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(onLoadComplete).not.toHaveBeenCalled();
  });

  /** Two clicks during a slow load would fetch and append the same page twice. */
  it("ignores a second click while already loading", async () => {
    const { promise, resolve } = deferred();
    const onLoadMore = vi.fn(() => promise);

    render(<LoadMoreButton onLoadMore={onLoadMore} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
      await promise;
    });
  });

  it("does nothing at all when disabled", async () => {
    const onLoadMore = vi.fn(async () => {});

    render(<LoadMoreButton onLoadMore={onLoadMore} disabled />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("renders its own label when given one", () => {
    render(<LoadMoreButton onLoadMore={async () => {}}>More films</LoadMoreButton>);

    expect(screen.getByText("More films")).toBeDefined();
  });

  // A blanket "Load more content" label replaced whatever the button said, so
  // "Load More Movies" and "Try again" were not names a voice-control user could
  // speak (WCAG 2.5.3). The accessible name has to be the visible text.
  it("is named by the text it shows, in every state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = deferred();
    const onLoadMore = vi.fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockReturnValueOnce(retry.promise);
    render(<LoadMoreButton onLoadMore={onLoadMore}>Load More Movies</LoadMoreButton>);

    const button = screen.getByRole("button", { name: "Load More Movies" });
    expect(button.hasAttribute("aria-label")).toBe(false);

    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("button", { name: "Try again" })).toBe(button);

    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("button", { name: "Loading..." })).toBe(button);

    await act(async () => { retry.resolve(); await retry.promise; });
    expect(screen.getByRole("button", { name: "Load More Movies" })).toBe(button);
  });

  it("is named by the default label when given none", () => {
    render(<LoadMoreButton onLoadMore={async () => {}} />);

    expect(screen.getByRole("button", { name: "Load More" })).toBeDefined();
  });
});
