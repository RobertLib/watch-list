"use client";

import Link from "@/i18n/Link";
import { Compass } from "lucide-react";
import { LegacyPathRedirect } from "@/components/LegacyPathRedirect";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { useEffect } from "react";

/**
 * The body of the 404 page, in whichever language the address is in.
 *
 * Rendered for every `notFound()` in either tree, and – through
 * `app/global-not-found.tsx` – for URLs that match no route. In the static
 * export that is `404.html`, which GitHub Pages serves for every path it has no
 * file for.
 *
 * The point of having one at all is the links: the default Next.js 404 is a bare
 * message on a white page with no way out, which for a crawler is a dead end and
 * for a visitor who mistyped a slug is worse than the page they wanted. A URL
 * from before the static export – `/movie/550-fight-club` and the like – gets
 * more than links: `LegacyPathRedirect` sends it on to the page it became.
 */
export function NotFoundContent() {
  const t = useT();
  const locale = useLocale();

  // The shared `404.html` is prerendered with the English title; a Czech
  // address gets the Czech one once the page knows which it is. Watched rather
  // than set once: Next commits the metadata's own `<title>` after hydration,
  // which would put the English one back.
  useEffect(() => {
    if (locale !== "cs") return;
    const czech = "Stránka nenalezena | WatchList";
    const apply = () => {
      if (document.title !== czech) document.title = czech;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [locale]);

  return (
    <div className="container mx-auto px-6 py-24 text-center">
      <LegacyPathRedirect />
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
        <Compass className="w-10 h-10 text-gray-500" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold mb-3">
        {t("This page does not exist", "Tato stránka neexistuje")}
      </h1>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
        {t(
          "The link may be old, or the title may have been renamed on TMDb. Nothing in your watchlist is affected.",
          "Odkaz může být starý, nebo byl titul na TMDb přejmenován. Na vašem seznamu se nic nezměnilo.",
        )}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          {t("Go to the home page", "Přejít na úvodní stránku")}
        </Link>
        <Link
          href="/movies"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
        >
          {t("Browse movies", "Procházet filmy")}
        </Link>
        <Link
          href="/tv-shows"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
        >
          {t("Browse TV shows", "Procházet seriály")}
        </Link>
      </div>

      <p className="mt-10 text-sm text-gray-500">
        {t("Looking for something specific?", "Hledáte něco konkrétního?")}{" "}
        <Link
          href="/search"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          {t("Search WatchList", "Prohledejte WatchList")}
        </Link>
        {t(" or pick a ", " nebo si vyberte ")}
        <Link
          href="/genres"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          {t("genre", "žánr")}
        </Link>
        .
      </p>
    </div>
  );
}
