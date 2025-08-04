/**
 * WatchList service worker.
 *
 * Three jobs, and deliberately no fourth:
 *
 *   1. Keep the app openable offline. An installed app that shows the browser's
 *      dinosaur when the train goes into a tunnel stops being an app.
 *   2. Serve the build's own JS and CSS from cache. Every file under
 *      `/_next/static/` carries a content hash in its name, so a given URL can
 *      never change meaning – which makes cache-first both safe and the only
 *      way the offline page arrives as anything but bare markup.
 *   3. Serve posters from cache. They are immutable at their URL too – TMDB
 *      paths carry a hash – so re-fetching one is pure waste.
 *
 * What it does *not* do is cache HTML or TMDB responses. Every page here is a
 * static shell that fills itself in from browser storage and from TMDB, and a
 * stale-response cache is the classic way a service worker turns into a bug
 * report about content that will not update. Keeping HTML on the network is
 * also what makes rule 2 safe: the markup a visitor gets is always this
 * deployment's, so the hashed assets it names are always ones this deployment
 * emitted.
 */

// Bump on any change to this file: it is what retires the caches below and
// re-runs `install`. The activate handler re-fetches the offline page as well,
// so a bumped worker always picks up a rewritten one.
const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;

/** The page shown when navigation fails and nothing is cached for it. */
const OFFLINE_URL = "/offline";

// Posters accumulate quickly on a browsing session; the cache is trimmed to a
// bound rather than allowed to grow until the browser evicts the whole origin.
const MAX_IMAGE_ENTRIES = 200;

// A deploy renames every hashed asset, so the previous build's chunks linger
// here until they age out. An evicted chunk costs a network fetch and nothing
// else – the HTML naming it always came from the network – so the bound can be
// tight enough to stay honest about disk.
const MAX_STATIC_ENTRIES = 150;

/**
 * Put the offline page in the shell cache.
 *
 * `/offline` is what the app links to; `/offline.html` is the file the static
 * export actually writes. Hosts that map extension-less paths serve the first,
 * and hosts that do not serve only the second – so both are tried, and whichever
 * answers is stored under the `/offline` key the fetch handler looks for.
 *
 * `cache: "reload"` rather than `cache.add`, so re-installing gets a fresh copy
 * instead of whatever the HTTP cache is still holding.
 */
async function cacheOfflinePage(cache) {
  for (const url of [OFFLINE_URL, `${OFFLINE_URL}.html`]) {
    try {
      const response = await fetch(url, { cache: "reload" });
      // A host that answers 200 for everything would otherwise park its own
      // "not found" page here as the offline experience.
      if (!response.ok) continue;

      await cache.put(OFFLINE_URL, response);
      return true;
    } catch {
      // Try the other spelling. A failed precache must not fail the install:
      // everything this worker provides is an enhancement.
    }
  }

  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cacheOfflinePage(cache))
      // A failed precache must not leave a half-installed worker in place.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const current = new Set([SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !current.has(key)).map((key) => caches.delete(key)),
        ),
      )
      // Refreshed on activation as well as on install, so a worker that is
      // bumped for any reason picks up a rewritten offline page rather than
      // serving whatever was cached on the visitor's first ever visit.
      .then(() => caches.open(SHELL_CACHE).then(cacheOfflinePage))
      .catch(() => undefined)
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

/**
 * Cache-first for anything whose URL carries a content hash.
 *
 * Safe precisely because the name changes when the bytes do: a stale entry here
 * is unreachable rather than wrong, since no HTML this deployment serves will
 * ever name it again.
 */
async function handleImmutable(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);

  // Opaque responses (`type: "opaque"`) are cached too: TMDB serves images
  // cross-origin without CORS, and refusing them would mean caching nothing.
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());

    // Deliberately not awaited: trimming is housekeeping, and the response is
    // already in hand – making the visitor wait on an eviction pass would be
    // paying for tidiness with latency. Caught for the same reason it is not
    // awaited: nothing is watching this promise, so a storage error would
    // otherwise surface as an unhandled rejection in the worker, which is the
    // kind of noise that buries a real one.
    trimCache(cacheName, maxEntries).catch(() => undefined);
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

  // Only GET. Nothing here answers a POST – the deployment is static files – so
  // anything else is a request this worker has no business standing in for.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.hostname === "image.tmdb.org") {
    event.respondWith(handleImmutable(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES));
    return;
  }

  // The build's own output: hashed JS, CSS and fonts. Same-origin only, so a
  // path that merely looks like ours on another host is left alone.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      handleImmutable(request, STATIC_CACHE, MAX_STATIC_ENTRIES),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  }
});
