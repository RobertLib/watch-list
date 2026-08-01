/**
 * WatchList service worker.
 *
 * Two jobs, and deliberately no third:
 *
 *   1. Keep the app openable offline. An installed app that shows the browser's
 *      dinosaur when the train goes into a tunnel stops being an app.
 *   2. Serve posters from cache. They are immutable at their URL – TMDB paths
 *      carry a hash – so re-fetching one is pure waste.
 *
 * What it does *not* do is cache HTML or API responses. Every page here is either
 * personal (rendered from browser storage anyway) or a TMDB listing that goes
 * stale within hours, and a stale-page cache is the classic way a service worker
 * turns into a bug report about content that will not update.
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;

/** The page shown when navigation fails and nothing is cached for it. */
const OFFLINE_URL = "/offline";

// Posters accumulate quickly on a browsing session; the cache is trimmed to a
// bound rather than allowed to grow until the browser evicts the whole origin.
const MAX_IMAGE_ENTRIES = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // A failed precache must not leave a half-installed worker in place.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== IMAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Oldest-first eviction. Insertion order is what `keys()` returns. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length <= maxEntries) return;

  await Promise.all(
    keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)),
  );
}

async function handleImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);

  // Opaque responses (`type: "opaque"`) are cached too: TMDB serves images
  // cross-origin without CORS, and refusing them would mean caching nothing.
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
    trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES);
  }

  return response;
}

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);

    return (
      offline ??
      new Response("You are offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET. A POST is a server action, and replaying one from a cache would be
  // a genuinely dangerous kind of clever.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.hostname === "image.tmdb.org") {
    event.respondWith(handleImage(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  }
});
