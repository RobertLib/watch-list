/**
 * Tells IndexNow which URLs a deploy added or removed.
 *
 * IndexNow is the push half of crawling: one POST, and Bing, Seznam, Yandex and
 * Naver hear about a URL now rather than whenever they next read the sitemap.
 * The key file in `public/` is what proves the POST comes from this site – the
 * receiver fetches `https://<host>/<key>.txt` and compares – and until this
 * script existed that file was published and nothing ever used it.
 *
 * Two commands, run by `.github/workflows/deploy.yml` on either side of the
 * deploy:
 *
 *   node scripts/indexnow.mjs diff <live-sitemap-url> <new-sitemap-file> <out-file> [--all]
 *   node scripts/indexnow.mjs submit <urls-file>
 *
 * `diff` runs after the build and before the deploy, while the site still
 * serves the previous sitemap: what the new one lists and the old one does not
 * is new, and the other way round is gone. Both are worth saying – a receiver
 * that fetches a removed URL finds the 404 and drops it. `submit` runs after
 * the deploy, so nothing is announced before it can be fetched.
 *
 * Only that difference, never the whole sitemap every day. The protocol asks
 * for URLs whose content was added, updated or deleted, and the snapshots in
 * every page do move daily – a vote count, a provider – but a site that reports
 * each of its pages as changed each morning is saying nothing, and receivers
 * are free to stop listening. `--all` is for the one time that is true: the
 * first run, or after a change to what the pages contain (the workflow passes
 * it when the manual run asks).
 *
 * A failed submission is a warning, not a failed deploy: the site is live
 * either way, and the sitemap still says everything this would have.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The most URLs the protocol takes in one request. */
const MAX_URLS_PER_REQUEST = 10_000;

/** What an IndexNow key may be: 8–128 letters, digits and dashes. */
const KEY_SHAPE = /^[A-Za-z0-9-]{8,128}$/;

/**
 * Every `<loc>` of a sitemap, in order, with XML's five entities decoded.
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(([, loc]) =>
    loc
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&"),
  );
}

/**
 * The URLs to report: in the new sitemap and not the old one, then in the old
 * one and not the new. No previous sitemap – a first deploy, or the live site
 * not answering – means nothing can be called new, so nothing is.
 *
 * @param {string[] | null} previous
 * @param {string[]} next
 * @returns {string[]}
 */
export function changedUrls(previous, next) {
  if (previous === null) return [];
  const before = new Set(previous);
  const after = new Set(next);
  return [
    ...next.filter((url) => !before.has(url)),
    ...previous.filter((url) => !after.has(url)),
  ];
}

/**
 * The request bodies for a list of URLs: one host per submission, which is the
 * protocol's rule, so only URLs on the first one's host are sent.
 *
 * @param {string[]} urls
 * @param {string} key
 * @returns {{ host: string, key: string, keyLocation: string, urlList: string[] }[]}
 */
export function submissions(urls, key) {
  if (urls.length === 0) return [];
  const { host, origin } = new URL(urls[0]);
  const own = [...new Set(urls)].filter((url) => {
    try {
      return new URL(url).host === host;
    } catch {
      return false;
    }
  });

  const bodies = [];
  for (let start = 0; start < own.length; start += MAX_URLS_PER_REQUEST) {
    bodies.push({
      host,
      key,
      keyLocation: `${origin}/${key}.txt`,
      urlList: own.slice(start, start + MAX_URLS_PER_REQUEST),
    });
  }
  return bodies;
}

/**
 * The key, read from the file that publishes it: the one `.txt` in `public/`
 * whose content is its own name. Found rather than repeated here, so replacing
 * the key is replacing that file and nothing else.
 *
 * @param {URL} publicDir
 * @returns {string | null}
 */
export function findKey(publicDir) {
  for (const name of readdirSync(publicDir)) {
    if (!name.endsWith(".txt")) continue;
    const key = name.slice(0, -".txt".length);
    if (!KEY_SHAPE.test(key)) continue;
    if (readFileSync(new URL(name, publicDir), "utf8").trim() === key) return key;
  }
  return null;
}

/** @param {string[]} args */
async function diff([liveSitemapUrl, newSitemapFile, outFile, flag]) {
  if (!liveSitemapUrl || !newSitemapFile || !outFile) {
    throw new Error(
      "usage: indexnow.mjs diff <live-sitemap-url> <new-sitemap-file> <out-file> [--all]",
    );
  }
  const next = sitemapUrls(readFileSync(newSitemapFile, "utf8"));

  let urls;
  if (flag === "--all") {
    urls = next;
    console.log(`indexnow: all ${urls.length} URLs of the new sitemap, as asked.`);
  } else {
    let previous = null;
    try {
      const response = await fetch(liveSitemapUrl, {
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) previous = sitemapUrls(await response.text());
      else console.log(`indexnow: ${liveSitemapUrl} answered ${response.status}.`);
    } catch (error) {
      console.log(`indexnow: could not read ${liveSitemapUrl} (${error?.message ?? error}).`);
    }
    urls = changedUrls(previous, next);
    console.log(
      previous === null
        ? "indexnow: no previous sitemap to compare with – nothing to report."
        : `indexnow: ${urls.length} URLs added or removed since the last deploy.`,
    );
  }

  writeFileSync(outFile, urls.length > 0 ? `${urls.join("\n")}\n` : "");
}

/** @param {string[]} args */
async function submit([urlsFile]) {
  if (!urlsFile) throw new Error("usage: indexnow.mjs submit <urls-file>");

  const urls = readFileSync(urlsFile, "utf8").split("\n").filter(Boolean);
  if (urls.length === 0) {
    console.log("indexnow: nothing to submit.");
    return;
  }

  const key = findKey(new URL("../public/", import.meta.url));
  if (!key) {
    console.log("::warning::IndexNow: no key file in public/ – nothing was submitted.");
    return;
  }

  for (const body of submissions(urls, key)) {
    let status;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      status = response.status;
    } catch (error) {
      console.log(`::warning::IndexNow: the request failed (${error?.message ?? error}).`);
      continue;
    }
    // 200 is received; 202 is received, with the key still to be checked.
    if (status === 200 || status === 202) {
      console.log(`indexnow: submitted ${body.urlList.length} URLs (${status}).`);
    } else {
      console.log(
        `::warning::IndexNow answered ${status} for ${body.urlList.length} URLs. ` +
          "403 means the key file was not found at its URL; 422, URLs that are not this host's.",
      );
    }
  }
}

// Only when run, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  const commands = { diff, submit };
  if (!(command in commands)) {
    console.error("usage: indexnow.mjs <diff|submit> …");
    process.exit(1);
  }
  await commands[command](args);
}
