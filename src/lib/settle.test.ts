import { afterEach, describe, expect, it, vi } from "vitest";
import { settle } from "./settle";

/**
 * The point of `settle` is what it does to `Promise.all`: one rejection stops
 * taking the other sections down with it. So these tests are mostly about the
 * combination rather than the function on its own.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settle", () => {
  it("passes a resolved value straight through", async () => {
    await expect(settle(Promise.resolve(42), "answer")).resolves.toBe(42);
  });

  it("turns a rejection into null rather than propagating it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      settle(Promise.reject(new Error("boom")), "trending movies"),
    ).resolves.toBeNull();

    // The console is the only record that a section is missing rather than
    // empty, so the label has to reach it.
    expect(error).toHaveBeenCalledWith(
      "Failed to load trending movies:",
      expect.any(Error),
    );
  });

  it("keeps the other entries of a Promise.all when one fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await Promise.all([
      settle(Promise.resolve("popular"), "popular"),
      settle(Promise.reject(new Error("429")), "trending"),
      settle(Promise.resolve("top rated"), "top rated"),
    ]);

    expect(results).toEqual(["popular", null, "top rated"]);
  });

  it("resolves rather than rejecting even when every entry fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await Promise.all([
      settle(Promise.reject(new Error("a")), "a"),
      settle(Promise.reject(new Error("b")), "b"),
    ]);

    // All-null is what tells a page to show its failure notice. It has to be a
    // value it can read, not an exception thrown past it.
    expect(results).toEqual([null, null]);
  });
});
