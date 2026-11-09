import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://watch-list.test";
const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

type WorkerEvent = {
  request?: Request;
  data?: unknown;
  preloadResponse?: Promise<Response | undefined>;
  waitUntil: (task: Promise<unknown>) => void;
  respondWith: (task: Promise<Response>) => void;
};

type Registration = { navigationPreload?: { enable: () => Promise<void> } };

/** Exercise the shipped worker with real Request/Response bodies and persistent caches. */
function worker(
  buckets = new Map<string, Map<string, Response>>(),
  registration?: Registration,
) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const network = new Map<string, { body: string; type: string }>();
  let online = true;
  let stalled: Promise<void> | null = null;
  let storageFailure: "open" | "match" | "put" | "keys" | null = null;
  const key = (request: Request | string) => new URL(
    typeof request === "string" ? request : request.url, ORIGIN,
  ).href;

  const caches = {
    open: async (name: string) => {
      if (storageFailure === "open") throw new DOMException("Cache quota exceeded", "QuotaExceededError");
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name)!;
      return {
        match: async (request: Request | string) => bucket.get(key(request))?.clone(),
        put: async (request: Request | string, response: Response) => {
          if (storageFailure === "put") throw new DOMException("Cache quota exceeded", "QuotaExceededError");
          // Consume the body as Cache.put does, so early body reuse fails the test.
          const stored = new Response(await response.arrayBuffer(), {
            status: response.status, headers: response.headers,
          });
          // As in the Cache API, a put replaces the entry and moves it to the
          // end of `keys()` – the order eviction reads.
          bucket.delete(key(request));
          bucket.set(key(request), stored);
        },
        keys: async () => [...bucket.keys()].map((url) => new Request(url)),
        delete: async (request: Request | string) => bucket.delete(key(request)),
      };
    },
    match: async (request: Request | string, options: { cacheName: string }) => {
      if (storageFailure === "match") throw new DOMException("Cache access denied", "SecurityError");
      return buckets.get(options.cacheName)?.get(key(request))?.clone();
    },
    keys: async () => {
      if (storageFailure === "keys") throw new DOMException("Cache access denied", "SecurityError");
      return [...buckets.keys()];
    },
    delete: async (name: string) => buckets.delete(name),
  };

  const fetch = vi.fn(async (request: Request | string) => {
    if (stalled) await stalled;
    if (!online) throw new TypeError("offline");
    const url = new URL(key(request));
    const found = network.get(url.pathname);
    const response = new Response(found?.body ?? "Not found", {
      status: found ? 200 : 404,
      headers: { "Content-Type": found?.type ?? "text/plain" },
    });
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  });

  runInNewContext(workerSource, {
    self: {
      location: { origin: ORIGIN },
      registration,
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
        listeners.set(type, handler),
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
    },
    caches, fetch, Request, Response, Headers, URL, Date,
    // Looked up per call, so a test's fake timers reach the worker too.
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });

  /**
   * The response, and separately the end of the event's lifetime: the response
   * first, then every promise passed to waitUntil – including those passed after
   * the response, as a browser allows while earlier ones are still pending.
   */
  function fire(type: string, fields: Partial<WorkerEvent>) {
    const waiting: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      ...fields,
      waitUntil: (task) => waiting.push(task),
      respondWith: (task) => { response = task; },
    });
    const settled = (async () => {
      await response?.catch(() => undefined);
      for (let index = 0; index < waiting.length; index++) await waiting[index];
      return waiting.length;
    })();
    return { response: response ?? Promise.resolve(undefined), settled };
  }

  async function dispatch(type: string, fields: Partial<WorkerEvent>) {
    const { response, settled } = fire(type, fields);
    const result = await response;
    return { response: result, waiting: await settled };
  }

  function fetchEvent(
    path: string,
    mode: string,
    headers: Record<string, string>,
    preloadResponse?: Promise<Response | undefined>,
  ) {
    const request = new Request(new URL(path, ORIGIN), { headers });
    // Request's constructor forbids navigate; browsers create these internally.
    Object.defineProperty(request, "mode", { value: mode });
    return { request, preloadResponse };
  }

  return {
    buckets,
    fetch,
    add: (path: string, body: string, type: string) => network.set(path, { body, type }),
    offline: () => { online = false; },
    /** Hold every later network request until the returned function is called. */
    stall: () => {
      let release!: () => void;
      stalled = new Promise((resolve) => { release = resolve; });
      return () => { stalled = null; release(); };
    },
    refuseStorage: (stage: "open" | "match" | "put" | "keys") => { storageFailure = stage; },
    install: () => dispatch("install", {}),
    activate: () => dispatch("activate", {}),
    cachePage: (path: string) => dispatch("message", {
      data: { type: "CACHE_PAGE", url: new URL(path, ORIGIN).href },
    }),
    request: (
      path: string,
      mode = "cors",
      headers: Record<string, string> = {},
      preloadResponse?: Promise<Response | undefined>,
    ) => dispatch("fetch", fetchEvent(path, mode, headers, preloadResponse)),
    /** A fetch event whose response can be observed before its lifetime ends. */
    start: (path: string, mode = "cors", headers: Record<string, string> = {}) =>
      fire("fetch", fetchEvent(path, mode, headers)),
  };
}

/** Paths in the order a cache would evict them, oldest first. */
function cachedPaths(app: ReturnType<typeof worker>, cacheName: string) {
  return [...(app.buckets.get(cacheName)?.keys() ?? [])].map((url) => new URL(url).pathname);
}

const STATIC_CACHE = "static-v9";
const IMAGE_CACHE = "images-v9";
const HOUR = 60 * 60 * 1000;

function addWatchlist(app: ReturnType<typeof worker>) {
  app.add("/watchlist", `<!doctype html><head>
    <link rel="stylesheet" href="/_next/static/style.hash.css">
    <link rel="preload" href="/_next/static/font.hash.woff2">
    </head><body>WATCHLIST<script src="/_next/static/app.hash.js"></script></body>`, "text/html");
  app.add("/watchlist.txt", "FULL_RSC", "text/plain");
  app.add("/_next/static/style.hash.css", "CSS", "text/css");
  app.add("/_next/static/font.hash.woff2", "FONT", "font/woff2");
  app.add("/_next/static/app.hash.js", "JS", "application/javascript");
}

describe("service worker offline routes", () => {
  it.each(["open", "match", "put", "keys"] as const)(
    "serves scripts, posters and pages from the network when cache %s fails",
    async (stage) => {
      const app = worker();
      addWatchlist(app);
      app.add("/t/p/w500/poster.jpg", "POSTER", "image/jpeg");
      app.refuseStorage(stage);

      const script = await app.request("/_next/static/app.hash.js");
      expect(await script.response!.text()).toBe("JS");
      const poster = await app.request("https://image.tmdb.org/t/p/w500/poster.jpg");
      expect(await poster.response!.text()).toBe("POSTER");
      const page = await app.request("/watchlist", "navigate");
      expect(await page.response!.text()).toContain("WATCHLIST");
      const rsc = await app.request("/watchlist.txt", "cors", { RSC: "1" });
      expect(await rsc.response!.text()).toBe("FULL_RSC");
    },
  );

  it("returns the offline response when neither network nor cache can be read", async () => {
    const app = worker();
    app.offline();
    app.refuseStorage("match");

    const page = await app.request("/watchlist", "navigate");
    expect(page.response!.status).toBe(503);
    expect(await page.response!.text()).toBe("You are offline.");
    await expect(app.request("/watchlist.txt", "cors", { RSC: "1" })).rejects.toThrow("offline");
  });

  it("keeps posters available offline after a successful cache write", async () => {
    const app = worker();
    const url = "https://image.tmdb.org/t/p/w500/poster.jpg";
    app.add("/t/p/w500/poster.jpg", "POSTER", "image/jpeg");
    await app.request(url);
    app.offline();

    const poster = await app.request(url);
    expect(await poster.response!.text()).toBe("POSTER");
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["static-v4", "static-v5", "static-v6"])(
    "keeps %s through activation even when the visitor skipped releases",
    async (previousCache) => {
      const app = worker();
      const url = new URL("/_next/static/previous.hash.js", ORIGIN).href;
      app.buckets.set(previousCache, new Map([[url, new Response("PREVIOUS_JS")]]));
      app.buckets.set("static-v3", new Map());
      app.buckets.set("pages-v3", new Map());
      app.add("/offline", "OFFLINE", "text/html");
      app.add("/_next/static/current.hash.js", "CURRENT_JS", "application/javascript");

      // Install precaches this build's assets before activation. The current
      // static cache must not be mistaken for the previous worker's cache.
      await app.request("/_next/static/current.hash.js");

      await app.activate();
      expect(app.buckets.has(previousCache)).toBe(true);
      expect(app.buckets.has("static-v3")).toBe(false);
      expect(app.buckets.has("pages-v3")).toBe(false);
      app.fetch.mockClear();
      app.offline();

      const script = await app.request(url);
      expect(await script.response!.text()).toBe("PREVIOUS_JS");
      const current = await app.request("/_next/static/current.hash.js");
      expect(await current.response!.text()).toBe("CURRENT_JS");
      expect(app.fetch).not.toHaveBeenCalled();
    },
  );

  it("finds retained chunks again after the activated worker restarts", async () => {
    const app = worker();
    const url = new URL("/_next/static/previous.hash.js", ORIGIN).href;
    app.buckets.set("static-v4", new Map([[url, new Response("PREVIOUS_JS")]]));
    await app.activate();

    // A fresh worker has no module state; Cache Storage remains on the device.
    const restarted = worker(app.buckets);
    restarted.offline();

    const script = await restarted.request(url);
    expect(await script.response!.text()).toBe("PREVIOUS_JS");
    expect(restarted.fetch).not.toHaveBeenCalled();
  });

  it("retains only the newest existing older static cache", async () => {
    const app = worker();
    const url = new URL("/_next/static/previous.hash.js", ORIGIN).href;
    app.buckets.set("static-v4", new Map([[url, new Response("OLDER_JS")]]));
    app.buckets.set("static-v6", new Map([[url, new Response("PREVIOUS_JS")]]));
    app.add("/offline", "OFFLINE", "text/html");
    await app.activate();

    expect(app.buckets.has("static-v4")).toBe(false);
    expect(app.buckets.has("static-v6")).toBe(true);
    app.fetch.mockClear();
    app.offline();

    const script = await app.request(url);
    expect(await script.response!.text()).toBe("PREVIOUS_JS");
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("keeps the first page and its assets even when they loaded before registration", async () => {
    const app = worker();
    addWatchlist(app);

    // Registrar posts once ready, including on a first direct visit to this URL.
    const { waiting } = await app.cachePage("/watchlist?tab=movies");
    expect(waiting).toBe(1);
    app.offline();

    const page = await app.request("/watchlist?tab=tv", "navigate");
    expect(await page.response!.text()).toContain("WATCHLIST");
    for (const [path, body] of [
      ["/_next/static/app.hash.js", "JS"],
      ["/_next/static/style.hash.css", "CSS"],
      ["/_next/static/font.hash.woff2", "FONT"],
    ]) {
      expect(await (await app.request(path)).response!.text()).toBe(body);
    }
    const rsc = await app.request("/watchlist.txt?_rsc=new", "cors", { RSC: "1" });
    expect(await rsc.response!.text()).toBe("FULL_RSC");
  });

  it("supports an offline reload and Link transition after visiting through Next RSC", async () => {
    const app = worker();
    addWatchlist(app);
    app.add("/watchlist/__next._tree.txt", "RSC_TREE", "text/plain");

    // Link fetches RSC, then usePathname changes and Registrar saves the document.
    const first = await app.request("/watchlist.txt?_rsc=first", "cors", { RSC: "1" });
    expect(await first.response!.text()).toBe("FULL_RSC");
    // The network answer, and the copy stored from it.
    expect(first.waiting).toBe(2);
    await app.request("/watchlist/__next._tree.txt?_rsc=prefetch");
    await app.cachePage("/watchlist");
    app.offline();

    const document = await app.request("/watchlist", "navigate");
    expect(await document.response!.text()).toContain("WATCHLIST");
    const nextLink = await app.request("/watchlist.txt?_rsc=second", "cors", { RSC: "1" });
    expect(await nextLink.response!.text()).toBe("FULL_RSC");
    const tree = await app.request("/watchlist/__next._tree.txt?_rsc=different");
    expect(await tree.response!.text()).toBe("RSC_TREE");
  });

  it("does not re-fetch a page that a full load and a Link transition just stored", async () => {
    const app = worker();
    addWatchlist(app);
    await app.request("/watchlist", "navigate");
    await app.request("/watchlist.txt?_rsc=link", "cors", { RSC: "1" });
    app.fetch.mockClear();

    await app.cachePage("/watchlist");
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("re-fetches a saved page once its copy is more than a day old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const app = worker();
      addWatchlist(app);
      await app.cachePage("/watchlist");
      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
      app.add("/watchlist", "<!doctype html><body>NEW_WATCHLIST</body>", "text/html");
      app.fetch.mockClear();

      await app.cachePage("/watchlist");
      const fetched = app.fetch.mock.calls.map(([request]) =>
        new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname);
      expect(fetched).toEqual(["/watchlist", "/watchlist.txt"]);
      app.offline();
      const page = await app.request("/watchlist", "navigate");
      expect(await page.response!.text()).toContain("NEW_WATCHLIST");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches the offline page once across its own install and activation", async () => {
    const offlineFetches = (app: ReturnType<typeof worker>) => app.fetch.mock.calls.filter(([request]) =>
      new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname === "/offline").length;
    const app = worker();
    app.add("/offline", "OFFLINE", "text/html");
    await app.install();
    await app.activate();
    expect(offlineFetches(app)).toBe(1);

    // A worker activated without installing in this lifetime still refreshes it.
    const restarted = worker(app.buckets);
    restarted.add("/offline", "OFFLINE", "text/html");
    await restarted.activate();
    expect(offlineFetches(restarted)).toBe(1);
  });

  it("uses fresh RSC online and leaves HTML fallbacks out of the RSC cache", async () => {
    const app = worker();
    app.add("/watchlist.txt", "OLD", "text/plain");
    await app.request("/watchlist.txt?_rsc=one", "cors", { RSC: "1" });
    app.add("/watchlist.txt", "NEW", "text/plain");
    const fresh = await app.request("/watchlist.txt?_rsc=two", "cors", { RSC: "1" });
    expect(await fresh.response!.text()).toBe("NEW");

    app.add("/missing.txt", "<html>Fallback</html>", "text/html");
    await app.request("/missing.txt", "cors", { RSC: "1" });
    app.offline();
    await expect(app.request("/missing.txt", "cors", { RSC: "1" })).rejects.toThrow("offline");
  });

  it("does not precache another origin or intercept TMDB data", async () => {
    const app = worker();
    await app.cachePage("https://other.test/watchlist");
    expect(app.fetch).not.toHaveBeenCalled();
    const result = await app.request("https://api.themoviedb.org/3/tv/1396");
    expect(result.response).toBeUndefined();
    expect(app.buckets.size).toBe(0);
  });
});

/**
 * One build is about ninety static files and the cache holds 150, so two or
 * three code-only deploys – which keep this cache's name – fill it. What it
 * gives up then decides whether a saved page still opens offline.
 */
describe("service worker cache eviction", () => {
  async function fillStatic(app: ReturnType<typeof worker>, prefix: string, count: number) {
    for (let index = 0; index < count; index++) {
      const path = `/_next/static/chunks/${prefix}-${index}.js`;
      app.add(path, prefix, "application/javascript");
      await app.request(path);
    }
  }

  it("keeps every chunk a saved page or payload names when later deploys fill the static cache", async () => {
    const app = worker();
    addWatchlist(app);
    app.add("/watchlist.txt", '1:I[1,["1","static/chunks/link-only.hash.js"],"Rows"]', "text/plain");
    app.add("/_next/static/chunks/link-only.hash.js", "LINK_JS", "application/javascript");
    await app.request("/watchlist", "navigate");
    await app.request("/watchlist.txt?_rsc=a", "cors", { RSC: "1" });
    // Stored first, so the oldest entries – the ones insertion order evicted.
    for (const path of [
      "/_next/static/app.hash.js",
      "/_next/static/style.hash.css",
      "/_next/static/font.hash.woff2",
      "/_next/static/chunks/link-only.hash.js",
    ]) await app.request(path);

    await fillStatic(app, "later-deploys", 200);
    expect(app.buckets.get(STATIC_CACHE)!.size).toBe(150);

    app.offline();
    const page = await app.request("/watchlist", "navigate");
    expect(await page.response!.text()).toContain("WATCHLIST");
    for (const [path, body] of [
      ["/_next/static/app.hash.js", "JS"],
      ["/_next/static/style.hash.css", "CSS"],
      ["/_next/static/font.hash.woff2", "FONT"],
      ["/_next/static/chunks/link-only.hash.js", "LINK_JS"],
    ]) {
      expect(await (await app.request(path)).response!.text()).toBe(body);
    }
  });

  it("gives up the chunks of the oldest saved page first once saved pages alone overfill it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const app = worker();
      const page = (name: string) =>
        `<!doctype html><script src="/_next/static/chunks/shared.js"></script>${
          Array.from({ length: 100 }, (_, index) =>
            `<script src="/_next/static/chunks/${name}-${index}.js"></script>`).join("")}`;
      app.add("/_next/static/chunks/shared.js", "SHARED", "application/javascript");
      app.add("/old", page("old"), "text/html");
      app.add("/new", page("new"), "text/html");

      await app.request("/old", "navigate");
      await app.request("/_next/static/chunks/shared.js");
      await fillStatic(app, "old", 100);
      vi.setSystemTime(Date.now() + 2 * HOUR);
      await app.request("/new", "navigate");
      await fillStatic(app, "new", 100);

      const kept = new Set(cachedPaths(app, STATIC_CACHE));
      expect(kept.size).toBe(150);
      // Stored first of all, but named by the newest page too.
      expect(kept.has("/_next/static/chunks/shared.js")).toBe(true);
      expect(Array.from({ length: 100 }, (_, index) =>
        kept.has(`/_next/static/chunks/new-${index}.js`)).every(Boolean)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the least recently used chunk rather than the first one stored", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const app = worker();
      await fillStatic(app, "first", 2);
      // A hit within the hour is not worth a rewrite: the order stays put.
      await app.request("/_next/static/chunks/first-0.js");
      expect(cachedPaths(app, STATIC_CACHE)).toEqual([
        "/_next/static/chunks/first-0.js",
        "/_next/static/chunks/first-1.js",
      ]);

      vi.setSystemTime(Date.now() + 2 * HOUR);
      await fillStatic(app, "filler", 148);
      // The runtime chunk, used again on a later visit.
      const used = await app.request("/_next/static/chunks/first-0.js");
      expect(await used.response!.text()).toBe("first");
      await fillStatic(app, "next-deploy", 2);

      const kept = cachedPaths(app, STATIC_CACHE);
      expect(kept).toHaveLength(150);
      expect(kept).toContain("/_next/static/chunks/first-0.js");
      expect(kept).not.toContain("/_next/static/chunks/first-1.js");
      expect(kept).not.toContain("/_next/static/chunks/filler-0.js");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the posters the visitor keeps looking at while browsing adds new ones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const app = worker();
      const poster = (index: number) => `https://image.tmdb.org/t/p/w342/${index}.jpg`;
      for (let index = 0; index < 200; index++) {
        app.add(`/t/p/w342/${index}.jpg`, `POSTER_${index}`, "image/jpeg");
        await app.request(poster(index));
      }
      vi.setSystemTime(Date.now() + 2 * HOUR);
      // The watchlist, opened again on the next visit.
      await app.request(poster(0));
      app.add("/t/p/w342/200.jpg", "POSTER_200", "image/jpeg");
      await app.request(poster(200));

      const kept = cachedPaths(app, IMAGE_CACHE);
      expect(kept).toHaveLength(200);
      expect(kept).not.toContain("/t/p/w342/1.jpg");
      app.offline();
      const watchlistPoster = await app.request(poster(0));
      expect(await watchlistPoster.response!.text()).toBe("POSTER_0");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("service worker navigation timing", () => {
  it("enables navigation preload on activation where the browser supports it", async () => {
    const enable = vi.fn(async () => {});
    const app = worker(undefined, { navigationPreload: { enable } });
    await app.activate();
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("serves and saves the preloaded navigation instead of fetching it again", async () => {
    const app = worker();
    addWatchlist(app);
    const preloaded = new Response("<!doctype html><body>PRELOADED</body>", {
      headers: { "Content-Type": "text/html" },
    });
    Object.defineProperty(preloaded, "type", { value: "basic" });

    const page = await app.request("/watchlist", "navigate", {}, Promise.resolve(preloaded));
    expect(await page.response!.text()).toContain("PRELOADED");
    expect(app.fetch.mock.calls.map(([request]) =>
      new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname,
    )).not.toContain("/watchlist");

    app.offline();
    const copy = await app.request("/watchlist", "navigate");
    expect(await copy.response!.text()).toContain("PRELOADED");
  });

  it("fetches the page itself when the preload failed", async () => {
    const app = worker();
    addWatchlist(app);
    const page = await app.request(
      "/watchlist", "navigate", {}, Promise.reject(new TypeError("preload failed")),
    );
    expect(await page.response!.text()).toContain("WATCHLIST");
  });

  it("serves the saved page when the network stalls, and saves the late answer for next time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const app = worker();
      addWatchlist(app);
      await app.request("/watchlist", "navigate");
      app.add("/watchlist", "<!doctype html><body>NEW_WATCHLIST</body>", "text/html");

      const release = app.stall();
      const navigation = app.start("/watchlist", "navigate");
      let served: Response | undefined;
      void navigation.response.then((response) => { served = response; });

      await vi.advanceTimersByTimeAsync(3999);
      expect(served).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      const copy = await served!.text();
      expect(copy).toContain("WATCHLIST");
      expect(copy).not.toContain("NEW_WATCHLIST");

      release();
      await navigation.settled;
      app.offline();
      const next = await app.request("/watchlist", "navigate");
      expect(await next.response!.text()).toContain("NEW_WATCHLIST");
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for a slow network when there is no saved page to fall back to", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const app = worker();
      addWatchlist(app);
      const release = app.stall();
      const navigation = app.start("/watchlist", "navigate");
      let served: Response | undefined;
      void navigation.response.then((response) => { served = response; });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(served).toBeUndefined();
      release();
      await navigation.settled;
      expect(await served!.text()).toContain("WATCHLIST");
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers a Link transition from the saved payload when the network stalls", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const app = worker();
      app.add("/watchlist.txt", "OLD_RSC", "text/plain");
      await app.request("/watchlist.txt?_rsc=one", "cors", { RSC: "1" });
      app.add("/watchlist.txt", "NEW_RSC", "text/plain");

      const release = app.stall();
      const transition = app.start("/watchlist.txt?_rsc=two", "cors", { RSC: "1" });
      let served: Response | undefined;
      void transition.response.then((response) => { served = response; });
      await vi.advanceTimersByTimeAsync(4000);
      expect(await served!.text()).toBe("OLD_RSC");

      release();
      await transition.settled;
      app.offline();
      const next = await app.request("/watchlist.txt?_rsc=three", "cors", { RSC: "1" });
      expect(await next.response!.text()).toBe("NEW_RSC");
    } finally {
      vi.useRealTimers();
    }
  });
});
