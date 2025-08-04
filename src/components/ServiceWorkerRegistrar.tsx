"use client";

import { useEffect } from "react";

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

    // Registered after load rather than during it: the worker competes with the
    // page for bandwidth otherwise, and nothing on the first visit needs it.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
