"use client";

import { useEffect } from "react";

/**
 * Register the service worker.
 *
 * Renders nothing – it exists because registration has to happen from the client
 * and the root layout is a Server Component. Registration is what makes the site
 * installable and what keeps it openable in a tunnel; an installed app is the
 * single biggest difference between a site someone visited once and one they
 * come back to.
 *
 * Failure is silent on purpose. Everything the worker provides is an
 * enhancement, and a browser refusing it (private mode, an unsupported engine, a
 * blocked scope) should cost the visitor nothing at all.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
