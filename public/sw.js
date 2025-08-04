/**
 * WatchList service worker.
 *
 * Three jobs, and deliberately no fourth:
 *
 *   1. Keep the app usable offline – not merely openable. Everything a visitor
 *      records here lives in this browser's own storage, so the watchlist, the
 *      ratings, the stats and the profile are all readable with no network at
 *      all. A generic "you are offline" card in front of data that is sitting
 *      on the device is the wrong answer, so pages visited before are kept and
 *      served when the network is gone. The registrar also saves pages reached
 *      through Next Link, whose RSC requests never navigate a document.
 *   2. Serve the build's own JS and CSS from cache. Every file under
 *      `/_next/static/` carries a content hash in its name, so a given URL can
 *      never change meaning – which makes cache-first both safe and the only
 *      way a page arrives offline as anything but bare markup.
 *   3. Serve posters from cache. They are immutable at their URL too – TMDB
 *      paths carry a hash – so re-fetching one is pure waste. Only a poster
 *      that actually arrived, though: a 404 or a 429 kept under that URL would
 *      be a broken image for as long as the entry lived (see `handleImage`).
 *
 * TMDB responses are still never cached: those are somebody else's data, they
 * change, and a stale-response cache is the classic way a service worker turns
 * into a bug report about content that will not update. Pages are cached, but
 * strictly network-first – the network's answer is what a visitor gets whenever
 * there is one, and the copy is only a fallback for when there is not. That is
 * what keeps rule 2 safe: an online visitor's markup is always this
 * deployment's, so the hashed assets it names are always ones this deployment
 * emitted. Offline, the markup may be a previous deployment's and the chunks it
 * names may have aged out of the static cache – in which case the page fails
 * exactly the way it does today, which is the floor this can sink to rather
 * than a regression.
 *
 * Nothing that could fail the visitor's request is awaited on the way to
 * `respondWith`. Writing to a cache is housekeeping: it happens after the
 * response is in hand, off the critical path, and a storage error – quota, most
 * often – costs a cache entry and nothing else. The one time it was awaited, a
 * full disk turned into a poster that would not load.
 */

// Bump on any change to this file: it is what re-runs `install` and retires
// the caches below – all but the previous version's static cache, which is
// held back one release for the tabs still running that build (see
// `findPreviousStaticCache`). A bump is not what keeps the offline page fresh,
// though, and cannot be: a code-only deploy leaves this file byte-identical, so
// `install` never re-runs for it. `/offline` is refreshed on activation and
// then opportunistically after navigations (see `refreshOfflinePage`).
const VERSION = "v8";
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const RSC_CACHE = `rsc-${VERSION}`;

/**
 * The newest older static cache actually on this device.
 *
 * `skipWaiting` plus `clients.claim` means a new worker takes over tabs that
 * are still running the previous build's markup – and that markup lazily
 * loads chunks by the previous build's hashed names. Delete the cache they sit
 * in and the next route change in such a tab is a ChunkLoadError, because the
 * network has moved on to the new build and no longer serves the old names.
 *
 * A visitor can skip releases, so subtracting one from VERSION does not name
 * the cache their open tab uses. Select from the caches that exist instead.
 * One older version is retained, bounded by MAX_STATIC_ENTRIES, and the same
 * lookup works when the browser restarts this worker after activation.
 * A tab kept open across multiple upgrades, or a chunk never cached in the
 * first place, can still require the old deployment to remain on the host.
 */
function findPreviousStaticCache(keys) {
  let previous = null;
  let newestVersion = -1;
  for (const key of keys) {
    if (key === STATIC_CACHE) continue;
    const match = /^static-v(\d+)$/.exec(key);
    if (!match) continue;
    const version = Number(match[1]);
    if (version > newestVersion) {
      previous = key;
      newestVersion = version;
    }
  }
  return previous;
}

let previousStaticCachePromise;

function getPreviousStaticCache() {
  if (!previousStaticCachePromise) {
    previousStaticCachePromise = caches.keys().then(findPreviousStaticCache).catch((error) => {
      // A temporary storage failure must not disable later cache reads.
      previousStaticCachePromise = undefined;
      throw error;
    });
  }
  return previousStaticCachePromise;
}

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
 * How many page shells to keep.
 *
 * The whole app is 34 routes, so this holds every page a visitor could reach –
 * the bound is here to cap a cache, not to ration it.
 */
const MAX_PAGE_ENTRIES = 40;
const MAX_RSC_ENTRIES = 200;

/**
 * How old a saved page may be before the registrar's CACHE_PAGE re-fetches it.
 *
 * The registrar posts CACHE_PAGE on every route change, and most of the time the
 * page is already here and current: a full load was just stored by
 * `handleNavigation`, a Link transition's RSC payload by `handleRsc`. Fetching
 * both again anyway was two CDN requests per page view on a hosting plan that
 * counts every one. A day keeps the offline copy no staler than the visitor's
 * own browsing, and a deploy reaches it through the next full load regardless.
 */
const PAGE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * How often `/offline` is re-fetched behind a successful navigation.
 *
 * Tracked in module state, which resets whenever the browser stops an idle
 * worker – it does so after roughly half a minute – so "once an hour" is in
 * practice "once per browsing session, on the first page that loads". That is
 * the intended shape: often enough that a code-only deploy reaches the offline
 * page within a visit or two, rare enough that the re-fetch never rides along
 * with every navigation of a long session.
 */
const OFFLINE_REFRESH_INTERVAL = 60 * 60 * 1000;
let offlinePageRefreshedAt = 0;

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

      await cache.put(OFFLINE_URL, response.clone());
      await cachePageAssets(response);
      return true;
    } catch {
      // Try the other spelling. A failed precache must not fail the install:
      // everything this worker provides is an enhancement.
    }
  }

  return false;
}

/**
 * Re-fetch the offline page, throttled, off the critical path.
 *
 * Called behind every successful same-origin navigation, because that is the
 * one moment this worker knows both that the network is there and that the
 * deployment may have changed under it. `install` only runs when this file's
 * bytes change, so without this a deploy that touched every page but not the
 * worker would leave `/offline` as it was on the visitor's first ever visit.
 *
 * Attached to the fetch event's lifetime without delaying its response. A
 * refresh that fails leaves the previous copy in place.
 */
function refreshOfflinePage() {
  const now = Date.now();
  if (now - offlinePageRefreshedAt < OFFLINE_REFRESH_INTERVAL) return Promise.resolve();
  offlinePageRefreshedAt = now;

  return caches
    .open(SHELL_CACHE)
    .then(cacheOfflinePage)
    .catch(() => undefined);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cacheOfflinePage(cache))
      .then((cached) => {
        // Counts as the first throttled refresh, so the activation that
        // `skipWaiting` triggers next does not fetch the same page again.
        if (cached) offlinePageRefreshedAt = Date.now();
      })
      // A failed precache must not leave a half-installed worker in place.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const previous = findPreviousStaticCache(keys);
        previousStaticCachePromise = Promise.resolve(previous);
        const keep = new Set([SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE, RSC_CACHE]);
        if (previous) keep.add(previous);

        return Promise.all(
          keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
        );
      })
      // Refreshed on activation as well as on install, so a worker that is
      // bumped for any reason picks up a rewritten offline page rather than
      // serving whatever was cached on the visitor's first ever visit. Through
      // the throttle, though: an activation straight after this worker's own
      // install would otherwise fetch the page install has just stored.
      .then(refreshOfflinePage)
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
 * Store a copy of a response and trim the cache, off the critical path.
 *
 * Deliberately not awaited: the response is already in hand, and making the
 * visitor wait on storage is paying for tidiness with latency. More than
 * latency, in fact – `cache.put` rejects when the origin is out of quota, and
 * awaited on the way to `respondWith` that rejection failed the request itself:
 * a poster or a JS chunk that had arrived from the network perfectly well was
 * thrown away over a full disk. Caught because nothing is watching this
 * promise on the response path. Fetch handlers pass it to waitUntil so the
 * browser keeps the worker alive until the copy has been stored.
 *
 * `response` has to be a clone the caller made before returning the original;
 * a body can only be read once.
 */
function storeInCache(cacheName, request, response, maxEntries) {
  return caches
    .open(cacheName)
    .then(async (cache) => {
      await cache.put(request, response);
      await trimCache(cacheName, maxEntries);
    })
    .catch(() => undefined);
}

/** A denied or unavailable cache is a miss, never a failed network request. */
async function readFromCache(cacheName, request) {
  try {
    // match does not create a cache: opening a new one can itself exceed quota.
    return await caches.match(request, { cacheName });
  } catch {
    return undefined;
  }
}

/**
 * Whether a `/_next/static/` response is the file it claims to be.
 *
 * Status alone is not enough. A host with a single-page-app fallback answers
 * 200 for every path it has no file for, with the app's index page – so a tab
 * running a retired build that asks for a chunk the new deploy no longer ships
 * gets HTML under a JS URL. Cache that, and the URL is poisoned for as long as
 * the entry lives: every later request for it is answered with markup that the
 * script loader cannot parse. The one signal that separates the two is the
 * Content-Type, so a response declaring itself HTML is passed through uncached.
 * A missing header is let through: a static host that omits Content-Type is
 * unusual but is not a fallback page, and refusing it would mean caching
 * nothing behind such a host.
 */
function isStaticAsset(response) {
  const type = response.headers.get("content-type");
  return !type || !type.toLowerCase().startsWith("text/html");
}

/**
 * Cache-first for the build's own hashed output.
 *
 * Safe precisely because the name changes when the bytes do: a stale entry here
 * is unreachable rather than wrong, since no HTML this deployment serves will
 * ever name it again.
 *
 * A miss is checked against the previous version's cache before the network,
 * for the tab that is still running the previous build after this worker took
 * it over (see `findPreviousStaticCache`). Its chunks are not copied forward:
 * the old cache lives exactly one more version, and so, in practice, do the
 * tabs that need it.
 */
async function handleStatic(request, event) {
  const cached = await readFromCache(STATIC_CACHE, request);
  if (cached) return cached;

  try {
    const previousCache = await getPreviousStaticCache();
    if (previousCache) {
      const previous = await readFromCache(previousCache, request);
      if (previous) return previous;
    }
  } catch {
    // Cache enumeration can be refused just like reading a cached response.
  }

  const response = await fetch(request);

  if (response.ok && isStaticAsset(response)) {
    const stored = storeInCache(STATIC_CACHE, request, response.clone(), MAX_STATIC_ENTRIES);
    if (event) event.waitUntil(stored);
    else await stored;
  }

  return response;
}

/**
 * Cache-first for posters, with the status visible.
 *
 * An `<img>` on another origin is a `no-cors` request, and the response to one
 * is opaque: status 0, no headers, no way to tell a poster from a 404 page or
 * from a 429 sent by a CDN that has had enough of this visitor. This worker
 * used to cache those opaque responses as they were – it was the only way to
 * cache them at all – and so a poster that failed once was a broken image for
 * as long as the entry lived, because the cache hit came before any retry.
 *
 * So the fetch is made as a CORS request instead, for the same URL. TMDB's
 * image CDN sends `Access-Control-Allow-Origin: *`, which makes the response a
 * readable one with its status intact – and only an `ok` one is stored. A CORS
 * response serves an `<img>` exactly as well as an opaque one would have.
 *
 * Should the CDN ever stop sending that header, the CORS fetch fails outright –
 * a network error, not a status – and the request falls back to the plain
 * fetch the browser would have made without a worker. That response is opaque
 * and is returned without being cached: better to re-fetch every poster than
 * to freeze a failure. (A network outage takes the same path, and the fallback
 * fails too, which is what an outage looked like before as well.)
 */
async function handleImage(request, event) {
  const cached = await readFromCache(IMAGE_CACHE, request);
  if (cached) return cached;

  let response;
  try {
    response = await fetch(
      new Request(request.url, { mode: "cors", credentials: "omit" }),
    );
  } catch {
    return fetch(request);
  }

  if (response.ok) {
    event.waitUntil(storeInCache(IMAGE_CACHE, request, response.clone(), MAX_IMAGE_ENTRIES));
  }

  return response;
}

/**
 * The cache key for a page.
 *
 * The path without its query string, because in a static export that is exactly
 * what the server keys on too: `/movie?id=550` and `/movie?id=13` are one file,
 * and the id is read from the URL bar by the page itself once it is running.
 * Keying on the full URL would store the same shell once per title browsed and
 * evict the other routes to make room for the copies.
 */
function pageKey(url) {
  return new Request(url.origin + url.pathname);
}

/** Initial HTML loads before registration; precache the assets it names too. */
async function cachePageAssets(response) {
  const html = await response.text();
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
      urls.add(url.href);
    }
  }
  await Promise.allSettled([...urls].map((url) => handleStatic(new Request(url))));
}

/** Static exports serve RSC as .txt files; headers and query do not vary them. */
function isRscRequest(request, url) {
  return url.pathname.endsWith(".txt") && (
    request.headers.get("RSC") === "1" ||
    /\/__next\.[^/]+\.txt$/.test(url.pathname) ||
    url.pathname === "/index.txt"
  );
}

async function handleRsc(request, event) {
  const key = pageKey(new URL(request.url));
  try {
    const response = await fetch(request);
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && /^(text\/plain|text\/x-component)(?:;|$)/i.test(type)) {
      const stored = storeInCache(RSC_CACHE, key, withSavedAt(response.clone()), MAX_RSC_ENTRIES);
      if (event) event.waitUntil(stored);
      else await stored;
    }
    return response;
  } catch (error) {
    const cached = await readFromCache(RSC_CACHE, key);
    if (cached) return cached;
    throw error;
  }
}

const precachingPages = new Map();

/**
 * When this worker stored a page or RSC copy, carried on the copy itself.
 *
 * Not the response's `Date`: a CDN may answer from its cache with the Date of
 * the original fetch, hours old, which would make every copy look stale and
 * bring back the re-fetch on every route change.
 */
const SAVED_AT_HEADER = "X-SW-Saved-At";

/** Re-wrap a response, body unread, with the moment it is being stored. */
function withSavedAt(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers, [SAVED_AT_HEADER, String(Date.now())]],
  });
}

/**
 * Whether a cached copy was stored within `PAGE_REFRESH_INTERVAL`. A copy
 * without the stamp – one saved by an earlier worker – counts as stale, so the
 * worst case is the re-fetch that used to happen every time.
 */
async function isFresh(cacheName, key) {
  const cached = await readFromCache(cacheName, key);
  const savedAt = Number(cached?.headers.get(SAVED_AT_HEADER));
  return savedAt > 0 && Date.now() - savedAt < PAGE_REFRESH_INTERVAL;
}

async function cachePage(url) {
  const rscPath = url.pathname.endsWith("/")
    ? `${url.pathname}index.txt`
    : `${url.pathname}.txt`;
  const rscRequest = new Request(url.origin + rscPath, { headers: { RSC: "1" } });
  const [pageFresh, rscFresh] = await Promise.all([
    isFresh(PAGE_CACHE, pageKey(url)),
    isFresh(RSC_CACHE, pageKey(new URL(rscRequest.url))),
  ]);

  const tasks = [];
  if (!pageFresh) {
    const response = await fetch(pageKey(url), { cache: "reload" });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) return;
    tasks.push(
      storeInCache(PAGE_CACHE, pageKey(url), withSavedAt(response.clone()), MAX_PAGE_ENTRIES),
      cachePageAssets(response),
    );
  }
  if (!rscFresh) tasks.push(handleRsc(rscRequest));
  await Promise.allSettled(tasks);
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_PAGE" || typeof event.data.url !== "string") return;
  let url;
  try {
    url = new URL(event.data.url, self.location.origin);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  url.search = "";
  url.hash = "";

  let task = precachingPages.get(url.href);
  if (!task) {
    task = cachePage(url).catch(() => undefined).finally(() => precachingPages.delete(url.href));
    precachingPages.set(url.href, task);
  }
  event.waitUntil(task);
});

/**
 * Network-first, falling back to the last copy of this page, then to `/offline`.
 *
 * The ordering is the whole design. While there is a network the visitor gets
 * the network's markup and the cache is only written to, never read – so a
 * deployment goes out the moment it is deployed, which is the failure mode this
 * worker refused to cache HTML at all to avoid. The copy exists for the tunnel.
 */
async function handleNavigation(request, event) {
  const url = new URL(request.url);
  const cacheable = url.origin === self.location.origin;

  try {
    const response = await fetch(request);

    // Only a page that actually rendered. A 404 or a host's error page cached
    // here would be served as this route for as long as the visitor is offline.
    if (cacheable && response.ok && response.type === "basic") {
      // Not awaited: the response is in hand and the visitor should not wait on
      // housekeeping. Caught because nothing is watching this promise.
      event.waitUntil(storeInCache(PAGE_CACHE, pageKey(url), withSavedAt(response.clone()), MAX_PAGE_ENTRIES));

      // A page just arrived from this deployment, so the offline page of this
      // deployment is reachable too – the one moment it can be picked up
      // without a worker bump.
      event.waitUntil(refreshOfflinePage());
    }

    return response;
  } catch {
    if (cacheable) {
      const cached = await readFromCache(PAGE_CACHE, pageKey(url));

      // The shell is all that is needed: every page here fills itself in from
      // browser storage, and that storage is on the device whether or not the
      // network is.
      if (cached) return cached;
    }

    const offline = await readFromCache(SHELL_CACHE, OFFLINE_URL);

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
    event.respondWith(handleImage(request, event));
    return;
  }

  // The build's own output: hashed JS, CSS and fonts. Same-origin only, so a
  // path that merely looks like ours on another host is left alone.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleStatic(request, event));
    return;
  }

  if (url.origin === self.location.origin && isRscRequest(request, url)) {
    event.respondWith(handleRsc(request, event));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, event));
  }
});
