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
    expect(screen.getByText("Load More")).toBeDefined();

    // And it is still usable, which is the whole point of restoring it.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
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
});
