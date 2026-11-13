import { describe, expect, it } from "vitest";
import {
  changedUrls,
  findKey,
  sitemapUrls,
  submissions,
} from "../../scripts/indexnow.mjs";

const SITE = "https://watch-list.test";

describe("sitemapUrls", () => {
  it("reads every <loc>, in order", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>${SITE}/</loc><priority>1</priority></url>
      <url><loc> ${SITE}/movies </loc></url>
    </urlset>`;

    expect(sitemapUrls(xml)).toEqual([`${SITE}/`, `${SITE}/movies`]);
  });

  it("decodes the entities a sitemap escapes its URLs with", () => {
    expect(sitemapUrls(`<loc>${SITE}/list?a=1&amp;b=2</loc>`)).toEqual([
      `${SITE}/list?a=1&b=2`,
    ]);
  });
});

describe("changedUrls", () => {
  it("reports what was added, then what was removed", () => {
    const previous = [`${SITE}/`, `${SITE}/gone`];
    const next = [`${SITE}/`, `${SITE}/new`];

    expect(changedUrls(previous, next)).toEqual([`${SITE}/new`, `${SITE}/gone`]);
  });

  it("reports nothing when nothing moved", () => {
    expect(changedUrls([`${SITE}/`], [`${SITE}/`])).toEqual([]);
  });

  // Without the old sitemap every URL would look new, and the whole site would
  // be announced as changed on a day the live site merely failed to answer.
  it("reports nothing when there is no previous sitemap to compare with", () => {
    expect(changedUrls(null, [`${SITE}/`, `${SITE}/new`])).toEqual([]);
  });
});

describe("submissions", () => {
  it("names the host, the key and where the key is published", () => {
    expect(submissions([`${SITE}/a`, `${SITE}/b`], "abcd1234")).toEqual([
      {
        host: "watch-list.test",
        key: "abcd1234",
        keyLocation: `${SITE}/abcd1234.txt`,
        urlList: [`${SITE}/a`, `${SITE}/b`],
      },
    ]);
  });

  it("sends each URL once, and only the first host's", () => {
    const [body] = submissions(
      [`${SITE}/a`, `${SITE}/a`, "https://elsewhere.test/b", "not a url"],
      "abcd1234",
    );

    expect(body.urlList).toEqual([`${SITE}/a`]);
  });

  it("splits a list longer than one request may carry", () => {
    const urls = Array.from({ length: 10_001 }, (_, i) => `${SITE}/${i}`);
    const bodies = submissions(urls, "abcd1234");

    expect(bodies.map((body) => body.urlList.length)).toEqual([10_000, 1]);
  });

  it("sends nothing for an empty list", () => {
    expect(submissions([], "abcd1234")).toEqual([]);
  });
});

describe("findKey", () => {
  // The repository's own key file: a submission signed with a key that is not
  // the one published is refused, so the two must be the same file.
  it("finds the key file that public/ publishes", () => {
    const key = findKey(new URL("../../public/", import.meta.url));

    expect(key).toMatch(/^[A-Za-z0-9-]{8,128}$/);
  });
});
