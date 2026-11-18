"use client";

import { Suspense } from "react";
import Link from "@/i18n/Link";
import { useSearchParams } from "next/navigation";
import { Heart, Users } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { MatchStarter } from "@/components/MatchStarter";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSettingsKey } from "@/hooks/useSettings";
import { getSharedListResolution } from "@/lib/shared-list-data";
import { decodeSharedList } from "@/lib/shared-list";
import { matchLists } from "@/lib/list-match";
import { mediaItemKey } from "@/lib/utils";
import type { SharedListRef } from "@/lib/shared-list";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount, formatNumber, type PluralForms } from "@/i18n/format";

// "u 1 titulu", "z 5 titulů" – the genitive after "u" and "z".
const TITLES_GENITIVE: PluralForms = {
  en: ["title", "titles"],
  cs: ["titulu", "titulů", "titulů"],
};

/**
 * Two watchlists, compared.
 *
 * With no parameters this is the form that asks for a link; with `?mine=` and
 * `?theirs=` it is the comparison. Nothing is stored either way – both lists
 * arrive in the URL, and the overlap is computed from them.
 */
export function MatchContent() {
  return (
    <Suspense fallback={<MatchStarterPage />}>
      <MatchRouter />
    </Suspense>
  );
}

function MatchRouter() {
  const searchParams = useSearchParams();
  const mine = searchParams.get("mine") ?? "";
  const theirs = searchParams.get("theirs") ?? "";
  const mineTruncated = searchParams.get("mineTruncated") === "1";
  const t = useT();

  useDocumentTitle(
    mine && theirs
      ? t("What you both want to watch", "Co chcete vidět společně")
      : t("What should we watch?", "Na co se podíváme?"),
  );

  if (!mine || !theirs) return <MatchStarterPage />;

  return <MatchResults mine={mine} theirs={theirs} mineTruncated={mineTruncated} />;
}

function MatchStarterPage() {
  const t = useT();
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="h-8 w-8 text-pink-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">
            {t("What should we watch?", "Na co se podíváme?")}
          </h1>
        </div>
        <p className="text-gray-400">
          {t(
            "Two lists, one evening. Paste the link somebody sent you and see what you have both already saved.",
            "Dva seznamy, jeden večer. Vložte odkaz, který vám někdo poslal, a uvidíte, co už máte uložené na obou seznamech.",
          )}
        </p>
      </div>

      <MatchStarter />
    </div>
  );
}

function MatchResults({ mine, theirs, mineTruncated }: {
  mine: string;
  theirs: string;
  mineTruncated: boolean;
}) {
  const settingsKey = useSettingsKey();
  const locale = useLocale();
  const t = useT();

  const { data, error, reload } = useAsyncData(async (signal) => {
    const match = matchLists(decodeSharedList(mine), decodeSharedList(theirs));

    // The links establish the overlap even when a title has left TMDB. Resolve
    // all buckets together so a failed bucket cannot hide another usable one.
    // Up to 120 background reads, released when the comparison is left.
    const resolution = await getSharedListResolution([
      ...match.shared,
      ...match.onlyMine,
      ...match.onlyTheirs,
    ], signal);
    const byKey = new Map(
      resolution.items.map((item) => [mediaItemKey(item.id, item.media_type), item]),
    );
    const cardsFor = (refs: SharedListRef[]) => refs.flatMap((ref) => {
      const item = byKey.get(mediaItemKey(ref.id, ref.mediaType));
      return item ? [item] : [];
    });

    return {
      shared: cardsFor(match.shared),
      onlyMine: cardsFor(match.onlyMine),
      onlyTheirs: cardsFor(match.onlyTheirs),
      counts: {
        shared: match.shared.length,
        onlyMine: match.onlyMine.length,
        onlyTheirs: match.onlyTheirs.length,
      },
      failedCount: resolution.failedRefs.length,
    };
  }, [mine, theirs, settingsKey]);

  // A rejected load used to leave the skeleton up for good: `data` stays null
  // and nothing re-runs the effect, so the only way out was a full reload.
  if (error) {
    return (
      <LoadFailureNotice
        title={t("Could not compare these lists", "Seznamy se nepodařilo porovnat")}
        description={t(
          "TMDB did not answer. Both links are fine – check your connection and try again.",
          "TMDB neodpovídá. Oba odkazy jsou v pořádku – zkontrolujte připojení a zkuste to znovu.",
        )}
        onRetry={reload}
      />
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingSection count={12} />
      </div>
    );
  }

  const { shared, onlyMine, onlyTheirs, counts, failedCount } = data;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="h-8 w-8 text-pink-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">
            {t("Where your lists agree", "Na čem se vaše seznamy shodnou")}
          </h1>
        </div>
        <p className="text-gray-400">
          {counts.shared > 0
            ? t(
                `${counts.shared} title${
                  counts.shared === 1 ? "" : "s"
                } you have both saved. Start there.`,
                `${formatCount(counts.shared, locale, {
                  en: ["title", "titles"],
                  cs: [
                    "titul je na obou seznamech",
                    "tituly jsou na obou seznamech",
                    "titulů je na obou seznamech",
                  ],
                })}. Začněte tam.`,
              )
            : t(
                "No overlap between these two lists – but there is plenty below to argue about.",
                "Tyhle dva seznamy nemají nic společného – ale níže je o čem debatovat.",
              )}
        </p>
        {mineTruncated && (
          <p className="mt-3 text-sm text-amber-200" role="note">
            {t(
              "Your full watchlist was checked for matches with the shared list. All shared titles are included; some titles unique to your list are omitted.",
              "Se sdíleným seznamem jsme porovnali celý váš seznam. Všechny společné tituly jsou zahrnuté; některé tituly, které máte jen vy, jsou vynechané.",
            )}
          </p>
        )}
      </div>

      {failedCount > 0 && (
        <LoadFailureNotice
          compact
          title={t(
            "Some title details could not be loaded",
            "Podrobnosti některých titulů se nepodařilo načíst",
          )}
          description={t(
            `Details for ${failedCount} title${failedCount === 1 ? "" : "s"} could not be loaded. The comparison still includes every title in the links; try again to load the missing details.`,
            `U ${formatCount(failedCount, locale, TITLES_GENITIVE)} se podrobnosti nepodařilo načíst. Porovnání přesto zahrnuje všechny tituly z odkazů; chybějící podrobnosti zkuste načíst znovu.`,
          )}
          onRetry={reload}
        />
      )}

      {counts.shared > 0 && (
        <section aria-labelledby="both-heading" className="mb-12">
          <h2
            id="both-heading"
            className="text-xl font-semibold text-white mb-4 flex items-center gap-2"
          >
            <Heart className="w-5 h-5 text-pink-400" aria-hidden="true" />
            {t("Both of you", "Na obou seznamech")}
          </h2>
          <DetailsCoverage shown={shared.length} total={counts.shared} />
          {shared.length > 0 && <MediaGrid items={shared} size="medium" />}
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-10">
        {counts.onlyMine > 0 && (
          <section aria-labelledby="mine-heading">
            <h2
              id="mine-heading"
              className="text-xl font-semibold text-white mb-4"
            >
              {t("Only on the first list", "Jen na prvním seznamu")}
            </h2>
            <DetailsCoverage shown={onlyMine.length} total={counts.onlyMine} />
            {onlyMine.length > 0 && <MediaGrid items={onlyMine} size="small" />}
          </section>
        )}

        {counts.onlyTheirs > 0 && (
          <section aria-labelledby="theirs-heading">
            <h2
              id="theirs-heading"
              className="text-xl font-semibold text-white mb-4"
            >
              {t("Only on the second", "Jen na druhém")}
            </h2>
            <DetailsCoverage shown={onlyTheirs.length} total={counts.onlyTheirs} />
            {onlyTheirs.length > 0 && <MediaGrid items={onlyTheirs} size="small" />}
          </section>
        )}
      </div>

      <p className="mt-12 text-sm text-gray-500">
        {t(
          "Worked out from the two links alone – nothing about either list is stored here.",
          "Spočítáno jen z obou odkazů – z žádného seznamu se tu nic neukládá.",
        )}{" "}
        <Link
          href="/match"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          {t("Compare a different pair", "Porovnat jinou dvojici")}
        </Link>
        .
      </p>
    </div>
  );
}

function DetailsCoverage({ shown, total }: { shown: number; total: number }) {
  const locale = useLocale();
  if (shown >= total) return null;

  return (
    <p className="text-sm text-gray-400 mb-4" role="note">
      {locale === "cs" ? (
        <>
          Podrobnosti zobrazujeme u {formatNumber(shown, locale)} z{" "}
          {formatCount(total, locale, TITLES_GENITIVE)}.{" "}
          {total - shown === 1
            ? "Zbývající titul se do porovnání pořád počítá, jen jeho podrobnosti nejsou k dispozici."
            : "Zbývající tituly se do porovnání pořád počítají, jen jejich podrobnosti nejsou k dispozici."}
        </>
      ) : (
        <>
          Showing details for {shown} of {total} title{total === 1 ? "" : "s"}.
          The remaining {total - shown === 1 ? "title still counts" : "titles still count"} in
          the comparison, but {total - shown === 1 ? "its" : "their"} details are unavailable.
        </>
      )}
    </p>
  );
}
