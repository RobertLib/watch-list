"use client";

import { Suspense, useEffect } from "react";
import Link from "@/i18n/Link";
import { useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { SaveSharedListButton } from "@/components/SaveSharedListButton";
import { CompareWithMineButton } from "@/components/CompareWithMineButton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSettingsKey } from "@/hooks/useSettings";
import { getSharedListResolution } from "@/lib/shared-list-data";
import {
  decodeSharedList,
  sanitizeSharedListTitle,
  MAX_SHARED_LIST_ITEMS,
} from "@/lib/shared-list";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount, formatNumber, type PluralForms } from "@/i18n/format";

const TITLES: PluralForms = {
  en: ["title", "titles"],
  cs: ["titul", "tituly", "titulů"],
};
// "u 1 titulu", "u 5 titulů" – the genitive after "u".
const TITLES_GENITIVE: PluralForms = {
  en: ["title", "titles"],
  cs: ["titulu", "titulů", "titulů"],
};
const LOADED_TITLES: PluralForms = {
  en: ["loaded title", "loaded titles"],
  cs: ["načtený titul", "načtené tituly", "načtených titulů"],
};

/**
 * Somebody else's list, carried entirely by the link.
 *
 * The ids are in `?items=` and the name in `?t=` – nothing about the list is
 * stored anywhere, which is what lets one exist without an account.
 */
export function SharedListContent() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8" />}>
      <SharedList />
    </Suspense>
  );
}

function SharedList() {
  const searchParams = useSearchParams();
  const settingsKey = useSettingsKey();
  const locale = useLocale();
  const t = useT();
  const refs = decodeSharedList(searchParams.get("items") ?? "");
  const title = sanitizeSharedListTitle(searchParams.get("t") ?? "");

  const fallbackTitle = t("A shared watchlist", "Sdílený seznam ke zhlédnutí");
  useDocumentTitle(title || fallbackTitle);

  const {
    data: resolution,
    isLoading,
    error,
    reload,
  } = useAsyncData(
    // Background reads, released when the list is left or its link changes.
    async (signal) => getSharedListResolution(refs, signal),
    [searchParams.get("items"), settingsKey],
  );

  const failedCount = resolution?.failedRefs.length ?? 0;
  useEffect(() => {
    if (!error && failedCount === 0) return;
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, [error, failedCount, reload]);

  if (refs.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
          <ListChecks className="w-10 h-10 text-gray-600" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold mb-3">
          {t("This list is empty", "Tento seznam je prázdný")}
        </h1>
        <p className="text-gray-400 max-w-md mx-auto">
          {t(
            "The link does not carry any titles. It may have been cut short on its way here – ask for it again, or start your own list.",
            "Odkaz neobsahuje žádné tituly. Možná se cestou zkrátil – požádejte o něj znovu, nebo si založte vlastní seznam.",
          )}
        </p>
        <Link
          href="/"
          prefetch={false}
          className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          {t("Discover Content", "Procházet filmy a seriály")}
        </Link>
      </div>
    );
  }

  // Checked before the skeleton: a failed load leaves `resolution` null and
  // `isLoading` false, which the skeleton branch below would otherwise show
  // for the rest of the visit.
  if (error) {
    return (
      <LoadFailureNotice
        title={t("Could not load this list", "Seznam se nepodařilo načíst")}
        description={t(
          "TMDB did not answer. The link is fine – check your connection and try again.",
          "TMDB neodpovídá. Odkaz je v pořádku – zkontrolujte připojení a zkuste to znovu.",
        )}
        onRetry={reload}
      />
    );
  }

  if (isLoading || !resolution) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 space-y-2">
          <div className="h-4 w-24 bg-gray-800 rounded animate-pulse" />
          <div className="h-9 w-64 bg-gray-700 rounded animate-pulse" />
        </div>
        <LoadingSection count={12} />
      </div>
    );
  }

  const listItems = resolution.items;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-blue-400 font-medium mb-1">
          {t("Shared list", "Sdílený seznam")}
        </p>
        <h1 className="text-3xl font-bold mb-2">
          {title || fallbackTitle}
        </h1>
        {locale === "cs" ? (
          <p className="text-gray-400">
            {formatCount(listItems.length, locale, TITLES)}
            {listItems.length < refs.length &&
              ` · ${formatNumber(refs.length - listItems.length, locale)} se nepodařilo načíst`}
          </p>
        ) : (
          <p className="text-gray-400">
            {listItems.length} title{listItems.length === 1 ? "" : "s"}
            {listItems.length < refs.length &&
              ` · ${refs.length - listItems.length} could not be loaded`}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SaveSharedListButton items={listItems} />
          <CompareWithMineButton items={refs} />
        </div>
      </div>

      {failedCount > 0 && (
        <LoadFailureNotice
          compact
          title={t(
            "Some title details could not be loaded",
            "Podrobnosti některých titulů se nepodařilo načíst",
          )}
          description={t(
            `Details for ${failedCount} title${failedCount === 1 ? "" : "s"} could not be loaded. Saving this list includes only its ${listItems.length} loaded title${listItems.length === 1 ? "" : "s"}. Try again to load the missing titles.`,
            `U ${formatCount(failedCount, locale, TITLES_GENITIVE)} se podrobnosti nepodařilo načíst. Uložit si teď můžete jen ${formatCount(listItems.length, locale, LOADED_TITLES)}. Chybějící tituly zkuste načíst znovu.`,
          )}
          onRetry={reload}
        />
      )}

      <MediaGrid items={listItems} />

      {refs.length >= MAX_SHARED_LIST_ITEMS && (
        <p className="mt-8 text-sm text-gray-500">
          {locale === "cs" ? (
            `Sdílený seznam unese nejvýš ${formatCount(MAX_SHARED_LIST_ITEMS, locale, TITLES)}, takže tento může být kratší než původní.`
          ) : (
            <>
              Shared lists carry at most {MAX_SHARED_LIST_ITEMS} titles, so this one
              may be shorter than the original.
            </>
          )}
        </p>
      )}

      <div className="mt-12 border-t border-gray-800 pt-8">
        <h2 className="text-xl font-semibold text-white mb-2">
          {t("Build your own", "Založte si vlastní")}
        </h2>
        <p className="text-gray-400 max-w-2xl leading-relaxed">
          {t(
            "WatchList tracks what you want to watch and where it is streaming, with no account and no sign-up. Save any title with the heart icon, and share your own list with a link exactly like this one.",
            "WatchList si pamatuje, co chcete vidět a kde se to streamuje – bez účtu a bez registrace. Kterýkoli titul si uložíte ikonou srdce a svůj seznam pak můžete sdílet odkazem, přesně jako je tento.",
          )}
        </p>
        <Link
          href="/"
          prefetch={false}
          className="mt-5 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          {t("Start browsing", "Začít objevovat")}
        </Link>
      </div>
    </div>
  );
}
