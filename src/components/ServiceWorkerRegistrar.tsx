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

    // Register after load, then the route effect below warms what loaded before
    // the worker took control as well as later client-side navigations.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    };

    // A first visit waits for a click, tap or key before installing anything.
    // Installing is not free: `sw.js`, the offline page and its chunks, and the
    // page itself saved once more – and almost every first visit here is a
    // crawler rendering one page in a fresh browser, paying all of it on every
    // single page it renders, against a host that bills per request. A person
    // interacts long before they go offline or install the app; a crawler
    // never does. A worker that already controls the page is a returning
    // visitor, and registers on load as before.
    const firstInteraction = ["pointerdown", "keydown"] as const;
    const onFirstInteraction = () => {
      stopWaiting();
      register();
    };
    const stopWaiting = () => {
      window.removeEventListener("load", register);
      for (const type of firstInteraction) {
        window.removeEventListener(type, onFirstInteraction, true);
      }
    };

    if (!navigator.serviceWorker.controller) {
      for (const type of firstInteraction) {
        window.addEventListener(type, onFirstInteraction, true);
      }
    } else if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }

    return stopWaiting;
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
