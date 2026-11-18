"use client";

import { useWatchlist } from "@/contexts/WatchlistContext";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleProvider";
import { formatCount, type PluralForms } from "@/i18n/format";

// Spoken after the link's own name: "Můj seznam, 1 uložený titul / 2 uložené
// tituly / 5 uložených titulů". The English sentence below stays as written.
const SAVED_TITLES: PluralForms = {
  en: ["title saved", "titles saved"],
  cs: ["uložený titul", "uložené tituly", "uložených titulů"],
};

interface WatchlistCounterProps {
  className?: string;
}

export function WatchlistCounter({ className }: WatchlistCounterProps) {
  const { watchlist, isLoading } = useWatchlist();
  const locale = useLocale();

  if (isLoading || watchlist.length === 0) {
    return null;
  }

  const count = watchlist.length;

  return (
    <span
      className={cn(
        "bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-4.5 h-4.5 flex items-center justify-center",
        className,
      )}
    >
      {/* The badge caps at "99+" to fit. What is spoken is the real number, in
          words, as part of the name of the link the badge sits in – a bare
          "3" after "Watchlist" says nothing about what was counted. */}
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">
        {locale === "cs"
          ? `, ${formatCount(count, locale, SAVED_TITLES)}`
          : `, ${count} ${count === 1 ? "title" : "titles"} saved`}
      </span>
    </span>
  );
}
