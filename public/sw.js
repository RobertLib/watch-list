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
 *      served when the network is gone, or too slow to answer. The registrar
 *      also saves pages reached through Next Link, whose RSC requests never
 *      navigate a document.
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
 * network-first – the network's answer is what a visitor gets whenever it
 * arrives within NETWORK_TIMEOUT, and the copy is only a fallback for when it
 * does not. That is what keeps rule 2 safe: markup that arrived in time is this
 * deployment's, so the hashed assets it names are ones this deployment emitted.
 * The copy – served offline, or on a connection too slow to answer in time –
 * may be a previous deployment's markup, naming that deployment's chunks, which
 * the host no longer serves. So the static cache never gives up a chunk a saved
 * page still names while it has anything else to give up (see
 * `trimStaticCache`), and a saved page lives no longer than the static caches
 * its chunks were read from (see `findPreviousStaticCache`).
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
const VERSION = "v11";
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
 *
 * The same retention is what lets a saved page outlive a bump: the page cache
 * is versioned too, so every saved page was stored under this worker, and the
 * chunks it names are either in this worker's static cache or were read from
 * the one retained here – which is deleted by the same later bump that deletes
 * the page.
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
// Least recently used first (see `markUsed`), so a session of browsing does not
// push out the posters of the visitor's own watchlist, which they see every
// visit and want offline.
const MAX_IMAGE_ENTRIES = 200;

// One build writes about 115 files under `/_next/static/` (113 when last
// measured, 81 of them named by some route's markup), and a deploy that moves
// a shared dependency renames nearly all of them – while a code-only deploy,
// which leaves this file and so this cache's name unchanged, adds just the files
// it changed. The bound has to hold two complete builds at once: the one the
// network serves now, and the one a page saved before the deploy still names.
// Below that, `trimStaticCache` runs out of leftovers and starts giving up the
// chunks of saved pages, which then open offline as markup with no script.
// Three hundred is two builds with room to grow. What goes first is decided in
// `trimStaticCache`.
const MAX_STATIC_ENTRIES = 300;

/**
 * Pages the build prerendered from TMDB's catalogue, rather than routes of the
 * app itself: a title or a person at a path of its own, a genre alone or on one
 * platform, a mood.
 *
 * A deploy built with a TMDB token has about 1,500 of them – 1,225 titles and
 * people (`LIMITS` in `scripts/prebuild.mjs`), 280 genre pages and 9 moods –
 * against 29 fixed routes, and each is an entry of its own in the page and RSC
 * caches. The fixed routes are the ones offline is for: they fill themselves in
 * from browser storage (the watchlist, ratings, stats, profile, calendar), and
 * `/movie`, `/tv` and `/person` are the one shell every title not prerendered
 * opens in. A catalogue page offline has its build-time snapshot and nothing
 * that needs TMDB. So these are what a full page or RSC cache gives up first –
 * and a session of browsing titles can no longer push out the home page.
 *
 * An RSC payload belongs to the page it was written for: `<page>.txt`, and the
 * segment files Next writes beside it as `<page>/__next.….txt`.
 */
const CATALOGUE_PAGE =
  /^\/(?:(?:movie|tv|person|mood)\/[^/]+|genres\/(?:movie|tv)\/[^/]+(?:\/[^/]+)?)$/;

function isCataloguePath(pathname) {
  return CATALOGUE_PAGE.test(pathname.replace(/(?:\/__next\.[^/]+)?\.txt$/, ""));
}

/**
 * How many page shells to keep.
 *
 * Every fixed route, with room to spare, and the catalogue pages visited most
 * recently. Catalogue pages are evicted before any fixed route (see
 * `isCataloguePath` and `trimCache`), and among themselves in the order they
 * were last used: a full load stores its page again, a Link transition stores
 * its RSC payload again, and the CACHE_PAGE that follows a transition moves the
 * page it found fresh to the back (see `touchSavedPage`).
 */
const MAX_PAGE_ENTRIES = 80;
const MAX_RSC_ENTRIES = 200;

/**
 * How old a saved page may be before the registrar's CACHE_PAGE re-fetches it.
 *
 * The registrar posts CACHE_PAGE on every route change, and most of the time the
 * page is already here and current: a full load was just stored by
 * `handleNavigation`, a Link transition's RSC payload by `handleRsc`. Fetching
 * both again anyway would be two requests and a page's worth of bytes on every
 * route change – out of the visitor's data plan, and out of the host's monthly
 * bandwidth allowance – to replace a copy with an identical one. A day keeps the
 * offline copy no staler than the visitor's own browsing, and a deploy reaches
 * it through the next full load regardless. A copy that is a deploy behind still
 * opens offline: the chunks it names are kept for it (see `trimStaticCache`).
 */
const PAGE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * How long a page or RSC request may take before a saved copy is served instead.
 *
 * A connection that is up but barely moving – a train, a basement, one bar –
 * otherwise holds the visitor on a blank screen until the browser gives up on
 * the request, which takes minutes, while the copy that would have rendered
 * at once sits in the cache. Four seconds is long past what a working mobile
 * connection needs for one of these files, and short enough to beat the
 * visitor's patience. Only when there is a copy: with nothing to fall back to
 * but `/offline`, waiting for the network is still the better answer.
 *
 * The request is not abandoned. Its response, whenever it lands, still
 * replaces the copy, so the next visit gets this deployment's markup.
 */
const NETWORK_TIMEOUT = 4000;

/**
 * How long a cache hit counts as recent before `markUsed` rewrites the entry.
 *
 * Eviction reads the order entries were written in, so recency has to be a
 * write – and rewriting every chunk and poster on every hit would trade one
 * waste for another. An hour keeps the order true to what the visitor has
 * used across visits, which is the only scale on which a full cache is ever
 * trimmed.
 */
const RECENCY_INTERVAL = 60 * 60 * 1000;

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
      forgetPinnedAssets();
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

/**
 * Ask the browser to start each navigation's request while this worker boots.
 *
 * Without it, every navigation waits for the worker to start – tens of
 * milliseconds on a desktop, a good deal more on a phone that stopped it – and
 * only then sends the request `handleNavigation` was always going to send. With
 * it, the two overlap, and `handleNavigation` picks the response up from
 * `preloadResponse` instead of fetching again. Feature-detected: an engine
 * without it simply keeps the old order.
 */
function enableNavigationPreload() {
  const preload = self.registration && self.registration.navigationPreload;
  if (!preload) return Promise.resolve();
  return Promise.resolve()
    .then(() => preload.enable())
    .catch(() => undefined);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    enableNavigationPreload()
      .then(() => caches.keys())
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

/**
 * Least-recently-written-first eviction. `keys()` returns entries in the order
 * they were written, and `put` over an existing entry moves it to the end – so
 * with `markUsed` rewriting hits, the front of the list is what has gone unused
 * longest.
 *
 * The page and RSC caches give up catalogue pages first (see
 * `isCataloguePath`), in that same order, and the app's own routes only if the
 * catalogue pages alone are not enough.
 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;

  if (excess <= 0) return;

  const expendable = cacheName === PAGE_CACHE || cacheName === RSC_CACHE
    ? (key) => isCataloguePath(new URL(key.url).pathname)
    : () => false;
  const victims = [
    ...keys.filter((key) => expendable(key)),
    ...keys.filter((key) => !expendable(key)),
  ].slice(0, excess);

  await Promise.all(victims.map((key) => cache.delete(key)));
}

/**
 * When this worker stored a copy, carried on the copy itself.
 *
 * Not the response's `Date`: a CDN may answer from its cache with the Date of
 * the original fetch, hours old, which would make every copy look stale and
 * bring back the re-fetch on every route change. Pages and RSC payloads read it
 * to decide whether CACHE_PAGE should re-fetch them; chunks and posters, to
 * decide whether a hit is worth rewriting (see `markUsed`); and the static
 * cache's eviction, to rank the assets saved pages name (see `pinnedAssets`).
 */
const SAVED_AT_HEADER = "X-SW-Saved-At";

/**
 * Re-wrap a response, body unread, with the moment it is being stored. Replaces
 * any stamp it already carries – a rewritten hit has one, and two values in
 * one header would read as no number at all.
 */
function withSavedAt(response) {
  const headers = new Headers(response.headers);
  headers.set(SAVED_AT_HEADER, String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Whether a copy carries a stamp younger than `interval`. */
function savedWithin(response, interval) {
  const savedAt = Number(response?.headers.get(SAVED_AT_HEADER));
  return savedAt > 0 && Date.now() - savedAt < interval;
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
      // A new page or payload can name chunks no saved copy named before.
      if (cacheName === PAGE_CACHE || cacheName === RSC_CACHE) forgetPinnedAssets();
      if (cacheName === STATIC_CACHE) await trimStaticCacheInTurn();
      else await trimCache(cacheName, maxEntries);
    })
    .catch(() => undefined);
}

/**
 * Record a cache hit as a use, off the critical path.
 *
 * Without this, a hit moved nothing, and "oldest" meant "first stored" rather
 * than "least used". The first things stored are the ones every page needs and
 * that outlive deploys – the React runtime, the layout's chunks, the font, CSS
 * that did not change – and the posters on the visitor's own watchlist. They
 * were exactly what a full cache gave up first, and exactly what an offline
 * visit cannot do without.
 *
 * Rewritten at most once per RECENCY_INTERVAL, judged by the stamp the copy
 * carries, so a page of twenty chunks is not twenty disk writes per view. A
 * copy stored before stamps existed has none, and is rewritten on its first
 * hit. Must be called before `cached` is returned: the clone has to be taken
 * while its body is still unread.
 */
function markUsed(cacheName, request, cached, event) {
  if (!event || savedWithin(cached, RECENCY_INTERVAL)) return;
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.put(request, withSavedAt(cached.clone())))
      .catch(() => undefined),
  );
}

/**
 * When a saved page was last used, on the copy – kept apart from when it was
 * saved, which is what decides whether CACHE_PAGE re-fetches it.
 */
const USED_AT_HEADER = "X-SW-Used-At";

/**
 * Move a saved page to the back of its cache's eviction order, keeping the
 * stamp it was saved with.
 *
 * A Link transition stores its RSC payload again, but not the page: the
 * CACHE_PAGE that follows finds the copy fresh and fetches nothing. Without
 * this, a page revisited by Link all day kept the place it was first stored in,
 * and went before pages opened once since. Not `markUsed`, which re-stamps: the
 * saved-at stamp is what lets CACHE_PAGE refresh a copy older than
 * PAGE_REFRESH_INTERVAL, and a touch that reset it would keep a page that is
 * revisited every day from ever being refreshed. At most once per
 * RECENCY_INTERVAL, so a page is not rewritten on every route change.
 *
 * `copy` must be unread: its body becomes the new entry's.
 */
function touchSavedPage(cacheName, key, copy) {
  const usedAt =
    Number(copy.headers.get(USED_AT_HEADER)) || Number(copy.headers.get(SAVED_AT_HEADER)) || 0;
  if (Date.now() - usedAt < RECENCY_INTERVAL) return Promise.resolve();

  const headers = new Headers(copy.headers);
  headers.set(USED_AT_HEADER, String(Date.now()));
  return caches
    .open(cacheName)
    .then((cache) => cache.put(key, new Response(copy.body, {
      status: copy.status,
      statusText: copy.statusText,
      headers,
    })))
    .catch(() => undefined);
}

/**
 * Every `/_next/static/` path a saved copy names, with how recent it is.
 *
 * Read from the pages, the RSC payloads and the offline page in the cache,
 * because those are what an offline visit – or a visit on a connection that
 * timed out – will render, and each is markup from whichever deployment it was
 * saved under. A chunk one of them names is not dead weight from a retired
 * build: it is the only copy of something that copy cannot load without,
 * because the host serves the current deployment and nothing older.
 *
 * Each path maps to the stamp of the newest copy naming it – the offline page
 * counts as newest of all, since it is the fallback for every route never
 * saved. Matching is textual and generous on purpose: HTML names assets in
 * `src`/`href` attributes and RSC payloads as bare `static/chunks/…` strings,
 * and a false match only keeps a file a little longer, while a missed one breaks
 * a page.
 *
 * Kept for the life of this worker and dropped whenever a page, a payload or the
 * offline page is stored, so a full static cache costs one pass over the saved
 * copies per new page rather than one per evicted chunk.
 */
let pinnedAssetsPromise;

function forgetPinnedAssets() {
  pinnedAssetsPromise = undefined;
}

const STATIC_REFERENCE = /(?:\/_next\/)?static\/[^"'\s\\<>]+/g;

async function readPinnedAssets() {
  const pinned = new Map();
  for (const cacheName of [SHELL_CACHE, PAGE_CACHE, RSC_CACHE]) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    await Promise.all(keys.map(async (key) => {
      const copy = await cache.match(key);
      if (!copy) return;
      const rank = cacheName === SHELL_CACHE
        ? Infinity
        : Number(copy.headers.get(SAVED_AT_HEADER)) || 0;
      for (const [reference] of (await copy.text()).matchAll(STATIC_REFERENCE)) {
        const path = `/_next/${reference.replace(/^\/_next\//, "")}`;
        if (!(pinned.get(path) >= rank)) pinned.set(path, rank);
      }
    }));
  }
  return pinned;
}

function pinnedAssets() {
  if (!pinnedAssetsPromise) {
    pinnedAssetsPromise = readPinnedAssets().catch((error) => {
      pinnedAssetsPromise = undefined;
      throw error;
    });
  }
  return pinnedAssetsPromise;
}

/**
 * Bring the static cache back to MAX_STATIC_ENTRIES, giving up first what no
 * saved copy needs.
 *
 * Order of eviction: chunks no saved page, payload or offline page names, least
 * recently used first – a retired build's leftovers, mostly. Then, only if that
 * is not enough, the named ones, starting with those whose newest naming copy
 * is oldest – so a chunk that every page shares goes last, and the chunks of a
 * page saved weeks ago go before those of one saved today.
 *
 * If the saved copies cannot be read, recency alone decides, as `trimCache`
 * does for the other caches.
 */
async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  if (excess <= 0) return;

  let pinned = new Map();
  try {
    pinned = await pinnedAssets();
  } catch {
    // Recency alone, below.
  }

  const victims = keys
    .map((key, written) => ({
      key,
      written,
      rank: pinned.get(new URL(key.url).pathname) ?? -1,
    }))
    // `Infinity - Infinity` is NaN, which is falsy, so ties fall to the order.
    .sort((a, b) => a.rank - b.rank || a.written - b.written)
    .slice(0, excess);

  await Promise.all(victims.map(({ key }) => cache.delete(key)));
}

/**
 * One trim at a time. A page load stores a few dozen chunks at once, and
 * overlapping trims read the list at different moments, each deleting enough
 * to fit what it saw – together, more than the bound asks for.
 */
let staticTrimQueue = Promise.resolve();

function trimStaticCacheInTurn() {
  const run = staticTrimQueue.then(trimStaticCache);
  staticTrimQueue = run.catch(() => undefined);
  return run;
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
  if (cached) {
    markUsed(STATIC_CACHE, request, cached, event);
    return cached;
  }

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
    const stored = storeInCache(STATIC_CACHE, request, withSavedAt(response.clone()), MAX_STATIC_ENTRIES);
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
 * It sends that header only when the request carries an `Origin`, though, and
 * without `Vary: Origin` – while letting the browser keep the file for a year.
 * So a plain `<img>` load that bypassed this worker (the first visit, before it
 * took control; a hard reload; the no-cors fallback below; an earlier version
 * of this file) leaves a copy in the HTTP cache with no CORS header, and a CORS
 * fetch answered from that copy fails.
 *
 * Every miss here used to go past the HTTP cache (`cache: "reload"`) to avoid
 * that copy. It also avoided every good one: each poster this cache had
 * evicted – and at MAX_IMAGE_ENTRIES a few listings evict plenty – was
 * downloaded again in full although the browser held it for a year, which made
 * repeat browsing heavier with this worker than without it. So the HTTP cache
 * is asked first, and only a fetch that fails is retried past it. The retry
 * reaches the CDN with an `Origin`, and its readable answer replaces the copy in
 * the HTTP cache as well – so a copy without the header fails once, not on
 * every later miss, which is what the console used to show.
 *
 * The trade: that one failure is still a CORS error in the console, once per
 * poster loaded outside this worker, and it costs a round trip to the HTTP
 * cache and no download. Going past the cache every time cost a full download
 * per eviction, on every visit. A copy the HTTP cache holds also opens offline
 * now, where `reload` could only fail.
 *
 * Should the CDN ever stop sending that header, both CORS fetches fail outright
 * – network errors, not statuses – and the request falls back to the plain
 * fetch the browser would have made without a worker. That response is opaque
 * and is returned without being cached: better to re-fetch every poster than
 * to freeze a failure. (A network outage takes the same path, and the fallback
 * fails too, which is what an outage looked like before as well.)
 */
function posterRequest(request, cache) {
  return new Request(request.url, { mode: "cors", credentials: "omit", cache });
}

async function handleImage(request, event) {
  const cached = await readFromCache(IMAGE_CACHE, request);
  if (cached) {
    markUsed(IMAGE_CACHE, request, cached, event);
    return cached;
  }

  let response;
  try {
    response = await fetch(posterRequest(request, "default"));
  } catch {
    try {
      response = await fetch(posterRequest(request, "reload"));
    } catch {
      return fetch(request);
    }
  }

  if (response.ok) {
    event.waitUntil(storeInCache(IMAGE_CACHE, request, withSavedAt(response.clone()), MAX_IMAGE_ENTRIES));
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

/**
 * The network's answer, or `copy` once NETWORK_TIMEOUT has passed without one.
 *
 * Also `copy` when the network fails outright, which is the offline case. The
 * network promise is left running either way: the caller has already handed
 * it to `waitUntil` along with whatever it stores when it lands.
 */
function networkOrCopy(network, copy) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(resolve, NETWORK_TIMEOUT, copy);
  });
  return Promise.race([network.catch(() => copy), timedOut]).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * Network-first for a Link transition's RSC payload, falling back to the copy.
 *
 * Same shape as `handleNavigation`, timeout included. A copy from an earlier
 * deployment is safe to hand over: the payload carries its build id, and the
 * router answers a mismatch with a full navigation rather than loading the
 * other build's chunks into this one.
 *
 * Without an event – a precache from `cachePage` – nobody is waiting, so there
 * is nothing to time out and no reason to read the copy: only the network's
 * answer is worth storing, and the store is awaited instead.
 */
function handleRsc(request, event) {
  const key = pageKey(new URL(request.url));
  const network = fetch(request).then((response) => {
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && /^(text\/plain|text\/x-component)(?:;|$)/i.test(type)) {
      const stored = storeInCache(RSC_CACHE, key, withSavedAt(response.clone()), MAX_RSC_ENTRIES);
      if (!event) return stored.then(() => response);
      event.waitUntil(stored);
    }
    return response;
  });
  if (!event) return network;

  // Keeps the worker alive for a response that lands after the copy was served.
  event.waitUntil(network.catch(() => undefined));
  return readFromCache(RSC_CACHE, key).then((cached) =>
    cached ? networkOrCopy(network, cached) : network,
  );
}

const precachingPages = new Map();

/**
 * Save a page the visitor just reached, and its RSC payload, unless both are
 * already here and current.
 *
 * Current means stored within PAGE_REFRESH_INTERVAL. A copy without the stamp –
 * one saved by an earlier worker – counts as stale, so the worst case is the
 * re-fetch that used to happen every time. A page found current is still
 * recorded as used (see `touchSavedPage`).
 */
async function cachePage(url) {
  const rscPath = url.pathname.endsWith("/")
    ? `${url.pathname}index.txt`
    : `${url.pathname}.txt`;
  const rscRequest = new Request(url.origin + rscPath, { headers: { RSC: "1" } });
  const key = pageKey(url);
  const [pageCopy, rscCopy] = await Promise.all([
    readFromCache(PAGE_CACHE, key),
    readFromCache(RSC_CACHE, pageKey(new URL(rscRequest.url))),
  ]);
  const pageFresh = savedWithin(pageCopy, PAGE_REFRESH_INTERVAL);
  const rscFresh = savedWithin(rscCopy, PAGE_REFRESH_INTERVAL);

  const tasks = [];
  if (pageFresh) {
    tasks.push(touchSavedPage(PAGE_CACHE, key, pageCopy));
  } else {
    const response = await fetch(key, { cache: "reload" });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) return;
    tasks.push(
      storeInCache(PAGE_CACHE, key, withSavedAt(response.clone()), MAX_PAGE_ENTRIES),
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
 * The ordering is the whole design. While the network answers in time the
 * visitor gets the network's markup and the copy is only written to – so a
 * deployment goes out the moment it is deployed, which is the failure mode this
 * worker refused to cache HTML at all to avoid. The copy exists for the tunnel,
 * and for the connection that is technically up but delivers nothing: past
 * NETWORK_TIMEOUT the copy is served, and the late answer, if it ever comes,
 * replaces it for next time. That copy may be a deployment behind, which is the
 * case `trimStaticCache` keeps its chunks for.
 *
 * The request itself is the browser's navigation preload when there is one
 * (see `enableNavigationPreload`), already under way before this ran.
 */
async function handleNavigation(request, event) {
  const url = new URL(request.url);
  const cacheable = url.origin === self.location.origin;

  const network = Promise.resolve(event.preloadResponse)
    // A failed preload is retried as an ordinary fetch rather than read as
    // offline: when the network really is gone, that fails just as fast.
    .catch(() => undefined)
    .then((preloaded) => preloaded ?? fetch(request))
    .then((response) => {
      // Only a page that actually rendered. A 404 or a host's error page cached
      // here would be served as this route for as long as the visitor is offline.
      if (cacheable && response.ok && response.type === "basic") {
        // Not awaited: the response is in hand and the visitor should not wait
        // on housekeeping. Caught because nothing is watching this promise.
        event.waitUntil(storeInCache(PAGE_CACHE, pageKey(url), withSavedAt(response.clone()), MAX_PAGE_ENTRIES));

        // A page just arrived from this deployment, so the offline page of this
        // deployment is reachable too – the one moment it can be picked up
        // without a worker bump.
        event.waitUntil(refreshOfflinePage());
      }
      return response;
    });
  // Keeps the worker alive for a response that lands after the copy was served.
  event.waitUntil(network.catch(() => undefined));

  // The shell is all that is needed: every page here fills itself in from
  // browser storage, and that storage is on the device whether or not the
  // network is.
  const cached = cacheable ? await readFromCache(PAGE_CACHE, pageKey(url)) : undefined;
  if (cached) return networkOrCopy(network, cached);

  try {
    return await network;
  } catch {
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
