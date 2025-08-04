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

vi.mock("./fetch-with-retry", () => ({ fetchJsonWithRetry: vi.fn() }));

const { fetchJsonWithRetry } = await import("./fetch-with-retry");
const {
  getMovieWikipediaContent,
  getPersonWikipediaContent,
  getTVWikipediaContent,
} = await import("./wikipedia");

const fetchMock = vi.mocked(fetchJsonWithRetry);

function ok(body: unknown) {
  return { response: { ok: true } as Response, data: body };
}

function searchHit(title: string) {
  return ok({ query: { search: [{ title }] } });
}

function page(extract: string) {
  return ok({ query: { pages: { "1234": { extract } } } });
}

function sitelink(title: string, id = "Q131285") {
  return ok({ entities: {
    [id]: { id, sitelinks: { enwiki: { site: "enwiki", title } } },
  } });
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

  it("leaves the year out when there isn't one", async () => {
    fetchMock.mockResolvedValue(searchHit("Metropolis"));
    await getMovieWikipediaContent("Metropolis");

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("srsearch")).toBe(
      "Metropolis film",
    );
  });

  it("gives up quietly when nothing matches", async () => {
    fetchMock.mockResolvedValue(ok({ query: { search: [] } }));

    await expect(getMovieWikipediaContent("Nothing At All")).resolves.toBeNull();
  });

  // Every failure here is "no article", which every caller already renders as an
  // absent panel rather than as an error.
  it("answers null when the search itself fails", async () => {
    fetchMock.mockResolvedValue({ response: { ok: false } as Response, data: undefined });
    await expect(getMovieWikipediaContent("The Matrix")).resolves.toBeNull();
  });

  it("answers null when the request throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(getMovieWikipediaContent("The Matrix")).resolves.toBeNull();
  });
});

describe("identifying a TV series' article", () => {
  it("keeps articles for identically named series tied to their separate identities", async () => {
    fetchMock
      .mockResolvedValueOnce(sitelink("The Office (British TV series)", "Q123"))
      .mockResolvedValueOnce(page("The Office is a British sitcom set at a paper company in Slough."))
      .mockResolvedValueOnce(sitelink("The Office (American TV series)", "Q456"))
      .mockResolvedValueOnce(page("The Office is an American sitcom set at a paper company in Scranton."));

    const british = await getTVWikipediaContent("Q123");
    const american = await getTVWikipediaContent("Q456");

    expect(british?.pageTitle).toBe("The Office (British TV series)");
    expect(british?.intro).toContain("British sitcom");
    expect(american?.pageTitle).toBe("The Office (American TV series)");
    expect(american?.intro).toContain("American sitcom");
    const urls = fetchMock.mock.calls.map((call) => new URL(call[0]));
    expect(urls[0].searchParams.get("ids")).toBe("Q123");
    expect(urls[2].searchParams.get("ids")).toBe("Q456");
    expect(urls.every((url) => !url.searchParams.has("srsearch"))).toBe(true);
  });

  it.each([undefined, null, "", "The Office", "Q0", "Qabc", "Q123|Q456"])(
    "omits a series with unverified identity %s without searching its name",
    async (id) => {
      await expect(getTVWikipediaContent(id)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("omits a series with no English article without falling back to another version", async () => {
    fetchMock.mockResolvedValueOnce(ok({ entities: {
      Q123: { id: "Q123", sitelinks: {} },
    } }));

    await expect(getTVWikipediaContent("Q123")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has("srsearch")).toBe(false);
  });
});

describe("identifying a person's article", () => {

  it("resolves the composer's identity without searching for the actor with the same name", async () => {
    fetchMock
      .mockResolvedValueOnce(sitelink("John Williams"))
      .mockResolvedValueOnce(page("John Williams is a composer whose music accompanies many well-known films."));

    const content = await getPersonWikipediaContent("Q131285");

    expect(content?.pageTitle).toBe("John Williams");
    expect(content?.intro).toContain("is a composer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const identityUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(identityUrl.origin).toBe("https://www.wikidata.org");
    expect(identityUrl.searchParams.get("action")).toBe("wbgetentities");
    expect(identityUrl.searchParams.get("ids")).toBe("Q131285");
    expect(identityUrl.searchParams.get("sitefilter")).toBe("enwiki");
    expect(identityUrl.searchParams.get("origin")).toBe("*");
    const articleUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(articleUrl.searchParams.get("titles")).toBe("John Williams");
    expect(fetchMock.mock.calls.every((call) => !new URL(call[0]).searchParams.has("srsearch")))
      .toBe(true);
  });

  it.each(["An Actor", "A Director"])("keeps the verified article for %s", async (title) => {
    fetchMock
      .mockResolvedValueOnce(sitelink(title, "Q123"))
      .mockResolvedValueOnce(page(`${title} has worked in film and television for several decades.`));

    await expect(getPersonWikipediaContent("Q123")).resolves.toMatchObject({ pageTitle: title });
  });

  it.each([undefined, null, "", "Q0", "Qabc", "Q131285|Q123", "../Q131285"])(
    "omits unverified identity %s without making a name search",
    async (id) => {
      await expect(getPersonWikipediaContent(id)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { entities: {} },
    { entities: { Q131285: { id: "Q131285", sitelinks: { frwiki: { site: "frwiki", title: "John Williams" } } } } },
    { entities: { Q131285: { id: "Q123", sitelinks: { enwiki: { site: "enwiki", title: "John Williams (actor)" } } } } },
    { entities: { Q131285: { id: "Q131285", sitelinks: { enwiki: { site: "frwiki", title: "John Williams" } } } } },
    { entities: { Q131285: { id: "Q131285", sitelinks: { enwiki: { site: "enwiki", title: " " } } } } },
  ])("rejects a missing or mismatched English sitelink without falling back to a namesake", async (body) => {
    fetchMock.mockResolvedValueOnce(ok(body));

    await expect(getPersonWikipediaContent("Q131285")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits the optional panel when Wikidata cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));

    await expect(getPersonWikipediaContent("Q131285")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not follow an unsuccessful identity response", async () => {
    fetchMock.mockResolvedValueOnce({ response: { ok: false } as Response, data: undefined });

    await expect(getPersonWikipediaContent("Q131285")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
