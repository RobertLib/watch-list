"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Register the service worker.
 *
 * Renders nothing – it exists because registration has to happen from an effect,
 * and the root layout is not a Client Component. Registration is what makes the
 * site installable and what keeps it openable in a tunnel; an installed app is the
 * single biggest difference between a site someone visited once and one they
 * come back to.
 *
 * Failure is silent on purpose. Everything the worker provides is an
 * enhancement, and a browser refusing it (private mode, an unsupported engine, a
 * blocked scope) should cost the visitor nothing at all.
 *
 * Not under `next dev`, ever. The worker serves `/_next/static/` cache-first on
 * the strength of content-hashed filenames – and the dev server's chunks are
 * not hashed, so the same URL means new bytes on every edit and cache-first
 * means the edit never arrives. A developer who once ran a production build on
 * localhost and still has that worker installed is in the same trap, which is
 * why a leftover registration is torn down here rather than merely not renewed.
 */
export function ServiceWorkerRegistrar() {
  const pathname = usePathname();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((r) => r.unregister())),
        )
        // Same reasoning as the registration below: nothing a stuck dev worker
        // could do is worth a console error in the way of the real ones.
        .catch(() => undefined);
      return;
    }

    // Registered once the page has loaded and the browser is idle, and then the
    // route effect below saves what loaded before the worker took control as
    // well as later client-side navigations.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    };

    // Load, then idle: installing fetches `sw.js`, the offline page and its
    // chunks, and the current page once more, and none of that should compete
    // with what the visitor is waiting for. Not later than that, though – a
    // first visit used to wait for a click or a key press as well, so that a
    // crawler rendering one page in a fresh browser never installed anything,
    // on a host that billed every request. GitHub Pages bills nothing per
    // request; a rendering crawler's install is a couple of hundred kilobytes
    // against Pages' soft monthly bandwidth limit, and the crawlers that cost
    // the most are turned away in `robots.ts` anyway. The wait, meanwhile, had a
    // real cost: a visitor who opened a page, read it and lost signal before
    // touching anything had no worker, so no saved copy and no offline page.
    //
    // `requestIdleCallback` is missing from Safari, where the next task after
    // load is the nearest equivalent. The timeout keeps a page whose main
    // thread never goes quiet from putting registration off indefinitely.
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const registerWhenIdle = () => {
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(register, { timeout: 5000 });
      } else {
        timer = setTimeout(register, 0);
      }
    };

    if (document.readyState === "complete") {
      registerWhenIdle();
    } else {
      window.addEventListener("load", registerWhenIdle, { once: true });
    }

    return () => {
      window.removeEventListener("load", registerWhenIdle);
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) return;

    let current = true;
    const cachePage = () => {
      navigator.serviceWorker.ready.then((registration) => {
        if (!current) return;
        const worker = navigator.serviceWorker.controller ?? registration.active;
        worker?.postMessage({
          type: "CACHE_PAGE",
          url: new URL(pathname, window.location.origin).href,
        });
      }).catch(() => undefined);
    };

    // A first visit and a Next Link transition do not issue a document fetch
    // through the worker. Save their HTML and dependencies explicitly.
    cachePage();
    navigator.serviceWorker.addEventListener("controllerchange", cachePage);
    return () => {
      current = false;
      navigator.serviceWorker.removeEventListener("controllerchange", cachePage);
    };
  }, [pathname]);

  return null;
}
