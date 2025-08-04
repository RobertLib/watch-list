import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Wikipedia insights panel, which is all parsing.
 *
 * The Action API hands back one plain-text blob per article, with section
 * headings as bare short lines and nothing marking them as headings. So the
 * whole module rests on a heuristic – "short, no sentence punctuation" – and on
 * two lists of section names. That is exactly the kind of code that keeps
 * working on the article it was written against and quietly returns nothing for
 * everything else, which is why it is worth pinning to examples.
 */

vi.mock("./fetch-with-retry", () => ({ fetchWithRetry: vi.fn() }));

const { fetchWithRetry } = await import("./fetch-with-retry");
const {
  getMovieWikipediaContent,
  getPersonWikipediaContent,
  getTVWikipediaContent,
} = await import("./wikipedia");

const fetchMock = vi.mocked(fetchWithRetry);

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function searchHit(title: string) {
  return ok({ query: { search: [{ title }] } });
}

function page(extract: string) {
  return ok({ query: { pages: { "1234": { extract } } } });
}

/** One article, in the shape `prop=extracts&explaintext=1` returns it. */
const ARTICLE = [
  "The Matrix is a 1999 science fiction action film. It was written and directed by the Wachowskis. The film stars Keanu Reeves. A fourth sentence nobody asked for.",
  "Production",
  "Development began in 1994 when the Wachowskis wrote their first draft of the script. They pitched it to Warner Bros. The studio agreed after seeing Bound. Filming took place in Sydney.",
  "Reception",
  "The film received widespread acclaim from critics upon its release in cinemas. Reviewers praised the visual effects and the fight choreography throughout.",
  "Trivia",
  "This heading is on neither list, so everything under it belongs nowhere and should not reach the panel at all.",
  "See also",
  "Navigational noise that is not article content.",
  "References",
  "More noise of the same kind.",
].join("\n");

beforeEach(() => {
  fetchMock.mockReset();
});

describe("finding the article", () => {
  it("asks the Action API with the CORS escape hatch", async () => {
    fetchMock.mockResolvedValueOnce(searchHit("The Matrix"));
    fetchMock.mockResolvedValueOnce(page(ARTICLE));

    await getMovieWikipediaContent("The Matrix", 1999);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://en.wikipedia.org");
    // Without `origin=*` the request is made and then thrown away unread.
    expect(url.searchParams.get("origin")).toBe("*");
    expect(url.searchParams.get("srsearch")).toBe("The Matrix film 1999");
  });

  it("qualifies a search by media type", async () => {
    fetchMock.mockResolvedValue(searchHit("Severance"));
    await getTVWikipediaContent("Severance");

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("srsearch")).toBe(
      "Severance TV series",
    );
  });

  it("leaves the year out when there isn't one", async () => {
    fetchMock.mockResolvedValue(searchHit("Metropolis"));
    await getMovieWikipediaContent("Metropolis");

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("srsearch")).toBe(
      "Metropolis film",
    );
  });

  // A director does not answer to "actor", and the bare name is the last resort.
  it("retries a person on their name alone", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ query: { search: [] } }))
      .mockResolvedValueOnce(searchHit("Greta Gerwig"))
      .mockResolvedValueOnce(page(ARTICLE));

    await getPersonWikipediaContent("Greta Gerwig", "Directing");

    const queries = fetchMock.mock.calls
      .slice(0, 2)
      .map((call) => new URL(call[0]).searchParams.get("srsearch"));

    expect(queries).toEqual(["Greta Gerwig film director", "Greta Gerwig"]);
  });

  it("gives up quietly when nothing matches", async () => {
    fetchMock.mockResolvedValue(ok({ query: { search: [] } }));

    await expect(getMovieWikipediaContent("Nothing At All")).resolves.toBeNull();
  });

  // Every failure here is "no article", which every caller already renders as an
  // absent panel rather than as an error.
  it("answers null when the search itself fails", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);
    await expect(getMovieWikipediaContent("The Matrix")).resolves.toBeNull();
  });

  it("answers null when the request throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(getMovieWikipediaContent("The Matrix")).resolves.toBeNull();
  });
});

describe("parsing the article", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValueOnce(searchHit("The Matrix"));
  });

  it("takes the intro from everything before the first heading", async () => {
    fetchMock.mockResolvedValueOnce(page(ARTICLE));
    const content = await getMovieWikipediaContent("The Matrix", 1999);

    expect(content?.intro).toContain("The Matrix is a 1999 science fiction");
    // Three sentences, so the panel is a summary rather than the lead section.
    expect(content?.intro).not.toContain("A fourth sentence");
  });

  it("keeps the sections worth reading and drops the rest", async () => {
    fetchMock.mockResolvedValueOnce(page(ARTICLE));
    const content = await getMovieWikipediaContent("The Matrix", 1999);

    expect(content?.sections.map((section) => section.title)).toEqual([
      "Production",
      "Reception",
    ]);
  });

  it("keeps navigation lists out even when they are long", async () => {
    fetchMock.mockResolvedValueOnce(page(ARTICLE));
    const content = await getMovieWikipediaContent("The Matrix", 1999);

    const text = JSON.stringify(content);
    expect(text).not.toContain("Navigational noise");
    expect(text).not.toContain("belongs nowhere");
  });

  // A heading with two lines under it is a stub, and a panel of stubs reads as
  // broken rather than as brief.
  it("drops a relevant section that has almost nothing under it", async () => {
    fetchMock.mockResolvedValueOnce(
      page(["An intro sentence for the article.", "Legacy", "Short."].join("\n")),
    );

    const content = await getMovieWikipediaContent("X");
    expect(content?.sections).toEqual([]);
  });

  it("stops at five sections", async () => {
    const body =
      "A section body long enough to clear the floor this parser applies to every one of them.";
    const extract = [
      "An intro.",
      ...[
        "Production",
        "Reception",
        "Legacy",
        "Themes",
        "Music",
        "Accolades",
      ].flatMap((heading) => [heading, body]),
    ].join("\n");

    fetchMock.mockResolvedValueOnce(page(extract));
    const content = await getMovieWikipediaContent("X");

    expect(content?.sections).toHaveLength(5);
  });

  it("builds a link to the article it actually read", async () => {
    fetchMock.mockResolvedValueOnce(page(ARTICLE));
    const content = await getMovieWikipediaContent("The Matrix", 1999);

    expect(content?.pageTitle).toBe("The Matrix");
    expect(content?.pageUrl).toBe("https://en.wikipedia.org/wiki/The_Matrix");
  });

  it("answers null for an article with nothing in it", async () => {
    fetchMock.mockResolvedValueOnce(page(""));
    await expect(getMovieWikipediaContent("X")).resolves.toBeNull();
  });

  it("answers null when there is neither an intro nor a section", async () => {
    fetchMock.mockResolvedValueOnce(
      page(["References", "Only noise lives here."].join("\n")),
    );

    await expect(getMovieWikipediaContent("X")).resolves.toBeNull();
  });
});
