import { fetchJsonWithRetry } from "./fetch-with-retry";

export interface WikipediaSection {
  title: string;
  text: string;
}

export interface WikipediaContent {
  pageTitle: string;
  pageUrl: string;
  intro: string | null;
  sections: WikipediaSection[];
}

// Section titles worth surfacing — editorial context not found in TMDB/IMDB
const INCLUDED_SECTIONS = new Set([
  "production",
  "development",
  "pre-production",
  "casting",
  "filming",
  "visual effects",
  "music",
  "soundtrack",
  "score",
  "reception",
  "critical reception",
  "critical response",
  "box office",
  "legacy",
  "cultural impact",
  "cultural significance",
  "accolades",
  "awards",
  "themes",
  "analysis",
  "career",
  "early career",
  "background",
  "early life",
  "commentary",
  "writing",
]);

// Lines that only contain these are navigation noise, not content
const SKIP_LINES = new Set([
  "see also",
  "notes",
  "references",
  "external links",
  "further reading",
]);

/** Return up to `max` complete sentences from plain text. */
function firstSentences(text: string, max: number): string {
  const sentences = text.match(/[^.!?]*(?:[.!?]+(?:\s|$))/g);
  if (!sentences) return text.slice(0, 400);
  return sentences.slice(0, max).join("").trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Wikipedia Action API helpers (REST v1 returns 403 from server environments)
//
// Called from the browser, which changes two things. `origin=*` is what makes
// the API answer with a permissive CORS header – without it the request is made
// and then thrown away unread. And the User-Agent header is gone: browsers
// forbid setting it, and a rejected header fails the whole request.
//
// Both calls read their JSON inside the retry budget and deadline. A request
// interrupted after its headers arrive is retried just like a dropped connection
// before the headers. Exhausted requests return null, which every caller here
// already handles as "no article".
// ──────────────────────────────────────────────────────────────────────────────

async function searchWikipediaTitle(query: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const { response, data } = await fetchJsonWithRetry<{
      query?: { search?: { title: string }[] };
    }>(url.toString());
    if (!response.ok || !data) return null;
    return (data.query?.search?.[0]?.title as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches the page via `action=query&prop=extracts&explaintext=1` which returns
 * plain text with section headings as standalone short lines. Parses intro and
 * editorially relevant sections.
 */
async function fetchPageContent(
  pageTitle: string,
): Promise<WikipediaContent | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", pageTitle);
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exsectionformat", "plain");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const { response, data } = await fetchJsonWithRetry<{
      query?: { pages?: Record<string, { extract?: string }> };
    }>(url.toString());
    if (!response.ok || !data) return null;

    const pages = Object.values(
      (data.query?.pages ?? {}) as Record<string, { extract?: string }>,
    );
    const extract: string = pages[0]?.extract ?? "";
    if (!extract) return null;

    // Split into lines; blank lines separate paragraphs/headings
    const blocks = extract
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);

    // A block is a "heading" when it's short, has no sentence punctuation,
    // and looks like a title (capitalised, no trailing period).
    const isHeading = (line: string) =>
      line.length <= 70 &&
      !line.includes(".") &&
      !line.includes(",") &&
      line === line.trim();

    // Extract the intro: all content before the first heading
    const introBlocks: string[] = [];
    let i = 0;
    while (i < blocks.length && !isHeading(blocks[i])) {
      introBlocks.push(blocks[i]);
      i++;
    }
    const introText = introBlocks.join(" ").trim();
    const intro = introText ? firstSentences(introText, 3) : null;

    // Collect section content
    const sections: WikipediaSection[] = [];
    while (i < blocks.length) {
      const heading = blocks[i];
      i++;

      // Skip noise sections
      if (SKIP_LINES.has(heading.toLowerCase())) {
        while (i < blocks.length && !isHeading(blocks[i])) i++;
        continue;
      }

      const isRelevant = [...INCLUDED_SECTIONS].some((kw) =>
        heading.toLowerCase().includes(kw),
      );

      // Collect the section's body blocks
      const bodyBlocks: string[] = [];
      while (i < blocks.length && !isHeading(blocks[i])) {
        bodyBlocks.push(blocks[i]);
        i++;
      }

      if (!isRelevant) continue;

      const bodyText = bodyBlocks.join(" ").trim();
      if (bodyText.length < 80) continue;

      sections.push({
        title: heading,
        text: firstSentences(bodyText, 4),
      });
    }

    if (!intro && sections.length === 0) return null;

    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
      pageTitle.replace(/ /g, "_"),
    )}`;

    return {
      pageTitle,
      pageUrl,
      intro,
      sections: sections.slice(0, 5),
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export async function getMovieWikipediaContent(
  title: string,
  year?: number,
): Promise<WikipediaContent | null> {
  const query = year ? `${title} film ${year}` : `${title} film`;
  const pageTitle = await searchWikipediaTitle(query);
  if (!pageTitle) return null;
  return fetchPageContent(pageTitle);
}

export async function getTVWikipediaContent(
  wikidataId: string | null | undefined,
): Promise<WikipediaContent | null> {
  return getWikidataWikipediaContent(wikidataId);
}

export async function getPersonWikipediaContent(
  wikidataId: string | null | undefined,
): Promise<WikipediaContent | null> {
  return getWikidataWikipediaContent(wikidataId);
}

async function getWikidataWikipediaContent(
  wikidataId: string | null | undefined,
): Promise<WikipediaContent | null> {
  // Names cannot distinguish people or different series with the same title.
  // TMDB's external ID identifies the entity; Wikidata supplies its English
  // article. Without that link, omit this optional panel instead of guessing.
  if (typeof wikidataId !== "string" || !/^Q[1-9]\d*$/.test(wikidataId)) return null;

  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", wikidataId);
  url.searchParams.set("props", "sitelinks");
  url.searchParams.set("sitefilter", "enwiki");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const { response, data } = await fetchJsonWithRetry<{
      entities?: Record<string, {
        id?: string;
        sitelinks?: { enwiki?: { site?: string; title?: string } };
      }>;
    }>(url.toString());
    if (!response.ok) return null;

    const entity = data?.entities?.[wikidataId];
    const article = entity?.sitelinks?.enwiki;
    if (entity?.id !== wikidataId || article?.site !== "enwiki" ||
        typeof article.title !== "string" || !article.title.trim()) return null;

    return fetchPageContent(article.title);
  } catch {
    return null;
  }
}

export async function getGenreWikipediaContent(
  genreName: string,
  mediaType: "movie" | "tv",
): Promise<WikipediaContent | null> {
  const suffix = mediaType === "movie" ? "film" : "television genre";
  const pageTitle = await searchWikipediaTitle(`${genreName} ${suffix}`);
  if (!pageTitle) return null;
  return fetchPageContent(pageTitle);
}
