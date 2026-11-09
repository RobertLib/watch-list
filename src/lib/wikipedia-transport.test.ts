import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGenreWikipediaContent, getPersonWikipediaContent } from "./wikipedia";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Wikipedia JSON transport", () => {
  it("recovers an interrupted Wikidata identity body without searching by name", async () => {
    let identityAttempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get("action") === "wbgetentities") {
        identityAttempts += 1;
        if (identityAttempts === 1) {
          return new Response(new ReadableStream({
            start(controller) {
              controller.error(new TypeError("Identity connection dropped"));
            },
          }));
        }
        return new Response(JSON.stringify({ entities: {
          Q131285: { id: "Q131285", sitelinks: { enwiki: { site: "enwiki", title: "John Williams" } } },
        } }));
      }
      expect(params.get("titles")).toBe("John Williams");
      return new Response(JSON.stringify({ query: { pages: {
        "123": { extract: "John Williams is a composer whose music accompanies many well-known films." },
      } } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = getPersonWikipediaContent("Q131285");
    await vi.advanceTimersByTimeAsync(200);

    await expect(content).resolves.toMatchObject({ pageTitle: "John Williams" });
    expect(identityAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every((call) => !new URL(call[0]).searchParams.has("srsearch")))
      .toBe(true);
  });

  it.each(["search", "article"] as const)("recovers an interrupted %s body", async (stage) => {
    const attempts = { search: 0, article: 0 };
    const fetchMock = vi.fn(async (url: string) => {
      const step = new URL(url).searchParams.get("list") === "search" ? "search" : "article";
      attempts[step] += 1;
      if (step === stage && attempts[step] === 1) {
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"query":'));
            controller.error(new TypeError("Body connection dropped"));
          },
        }));
      }
      const data = step === "search"
        ? { query: { search: [{ title: "The Matrix" }] } }
        : { query: { pages: { "123": { extract: "The Matrix is a science fiction film." } } } };
      return new Response(JSON.stringify(data));
    });
    vi.stubGlobal("fetch", fetchMock);

    const content = getGenreWikipediaContent("Science fiction", "movie");
    await vi.advanceTimersByTimeAsync(200);

    await expect(content).resolves.toMatchObject({
      pageTitle: "The Matrix",
      intro: "The Matrix is a science fiction film.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(attempts[stage]).toBe(2);
  });
});
