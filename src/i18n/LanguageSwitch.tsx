"use client";

import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { switchLocaleHref } from "@/lib/routes";
import { useLocale } from "./LocaleProvider";
import type { Locale } from "./locale";

const LABEL: Record<Locale, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  cs: { short: "CS", name: "Čeština" },
};

/**
 * The link to this page in the other language.
 *
 * A plain `<a>`, not `<Link>`: the two trees have different root layouts, so
 * the move is a full page load either way, and the href must not be run
 * through `localizeHref` – it already names the other tree.
 *
 * The href is built from the path alone, so the prerendered HTML and the first
 * render in the browser agree (a query string is not known to the prerender).
 * The query – a title's `?id=`, a genre's filters – is carried over at the
 * click instead, where it is known.
 */
export function LanguageSwitch({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Only the language's code ("CS"), for the crowded navigation bar. */
  compact?: boolean;
}) {
  const locale = useLocale();
  const pathname = usePathname() ?? "/";
  const target: Locale = locale === "cs" ? "en" : "cs";
  const href = switchLocaleHref(pathname, target);

  return (
    <a
      href={href}
      hrefLang={target}
      lang={target}
      onClick={(event) => {
        const search = window.location.search;
        if (!search) return;
        event.preventDefault();
        window.location.assign(
          switchLocaleHref(`${pathname}${search}${window.location.hash}`, target),
        );
      }}
      className={`inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${className}`}
      title={LABEL[target].name}
      aria-label={compact ? LABEL[target].name : undefined}
    >
      <Languages className="w-4 h-4" aria-hidden="true" />
      <span>{compact ? LABEL[target].short : LABEL[target].name}</span>
    </a>
  );
}
