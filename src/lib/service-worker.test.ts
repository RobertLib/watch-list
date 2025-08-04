import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://watch-list.test";
const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

type WorkerEvent = {
  request?: Request;
  data?: unknown;
  waitUntil: (task: Promise<unknown>) => void;
  respondWith: (task: Promise<Response>) => void;
};

/** Exercise the shipped worker with real Request/Response bodies and persistent caches. */
function worker(buckets = new Map<string, Map<string, Response>>()) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const network = new Map<string, { body: string; type: string }>();
  let online = true;
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
          bucket.set(key(request), new Response(await response.arrayBuffer(), {
            status: response.status, headers: response.headers,
          }));
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
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
        listeners.set(type, handler),
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
    },
    caches, fetch, Request, Response, URL, Date,
  });

  async function dispatch(type: string, fields: Partial<WorkerEvent>) {
    const waiting: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      ...fields,
      waitUntil: (task) => waiting.push(task),
      respondWith: (task) => { response = task; },
    });
    const result = response ? await response : undefined;
    await Promise.all(waiting);
    return { response: result, waiting: waiting.length };
  }

  return {
    buckets,
    fetch,
    add: (path: string, body: string, type: string) => network.set(path, { body, type }),
    offline: () => { online = false; },
    refuseStorage: (stage: "open" | "match" | "put" | "keys") => { storageFailure = stage; },
    install: () => dispatch("install", {}),
    activate: () => dispatch("activate", {}),
    cachePage: (path: string) => dispatch("message", {
      data: { type: "CACHE_PAGE", url: new URL(path, ORIGIN).href },
    }),
    request: (path: string, mode = "cors", headers: Record<string, string> = {}) => {
      const request = new Request(new URL(path, ORIGIN), { headers });
      // Request's constructor forbids navigate; browsers create these internally.
      Object.defineProperty(request, "mode", { value: mode });
      return dispatch("fetch", { request });
    },
  };
}

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
    expect(first.waiting).toBe(1);
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
