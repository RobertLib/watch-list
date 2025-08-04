import { describe, expect, it } from "vitest";
import { isNotFoundError } from "./NotFoundNotice";

/**
 * The one question that separates "this film does not exist" from "TMDB did
 * not answer". Every detail page used to give the first answer to both, so a
 * rate limit read as a dead link. The transport throws a plain `Error` whose
 * message carries the status, and that message is the only signal there is.
 */
describe("isNotFoundError", () => {
  it("recognises the transport's 404", () => {
    expect(
      isNotFoundError(
        new Error(
          "TMDB API error: 404 Not Found (https://api.themoviedb.org/3/movie/1)",
        ),
      ),
    ).toBe(true);
  });

  it("does not mistake a rate limit, a server error or a timeout for a miss", () => {
    expect(
      isNotFoundError(new Error("TMDB API error: 429 Too Many Requests (u)")),
    ).toBe(false);
    expect(
      isNotFoundError(new Error("TMDB API error: 500 Internal Server Error (u)")),
    ).toBe(false);
    expect(isNotFoundError(new DOMException("timed out", "TimeoutError"))).toBe(
      false,
    );
    expect(isNotFoundError(new TypeError("Failed to fetch"))).toBe(false);
  });

  // A URL that happens to contain "404" is not a 404.
  it("reads the status, not the URL", () => {
    expect(
      isNotFoundError(
        new Error("TMDB API error: 500 Internal Server Error (/movie/404)"),
      ),
    ).toBe(false);
  });

  it("answers no for anything that is not an Error", () => {
    expect(isNotFoundError("TMDB API error: 404")).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
