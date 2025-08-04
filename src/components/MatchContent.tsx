"use client";

import { Suspense } from "react";
import Link from "next/link";
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

  useDocumentTitle(
    mine && theirs ? "What you both want to watch" : "What should we watch?",
  );

  if (!mine || !theirs) return <MatchStarterPage />;

  return <MatchResults mine={mine} theirs={theirs} mineTruncated={mineTruncated} />;
}

function MatchStarterPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="h-8 w-8 text-pink-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">What should we watch?</h1>
        </div>
        <p className="text-gray-400">
          Two lists, one evening. Paste the link somebody sent you and see what
          you have both already saved.
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

  const { data, error, reload } = useAsyncData(async () => {
    const match = matchLists(decodeSharedList(mine), decodeSharedList(theirs));

    // The links establish the overlap even when a title has left TMDB. Resolve
    // all buckets together so a failed bucket cannot hide another usable one.
    const resolution = await getSharedListResolution([
      ...match.shared,
      ...match.onlyMine,
      ...match.onlyTheirs,
    ]);
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
        title="Could not compare these lists"
        description="TMDB did not answer. Both links are fine – check your connection and try again."
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
          <h1 className="text-3xl font-bold">Where your lists agree</h1>
        </div>
        <p className="text-gray-400">
          {counts.shared > 0
            ? `${counts.shared} title${
                counts.shared === 1 ? "" : "s"
              } you have both saved. Start there.`
            : "No overlap between these two lists – but there is plenty below to argue about."}
        </p>
        {mineTruncated && (
          <p className="mt-3 text-sm text-amber-200" role="note">
            Your full watchlist was checked for matches with the shared list.
            All shared titles are included; some titles unique to your list
            are omitted.
          </p>
        )}
      </div>

      {failedCount > 0 && (
        <LoadFailureNotice
          compact
          title="Some title details could not be loaded"
          description={`Details for ${failedCount} title${failedCount === 1 ? "" : "s"} could not be loaded. The comparison still includes every title in the links; try again to load the missing details.`}
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
            Both of you
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
              Only on the first list
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
              Only on the second
            </h2>
            <DetailsCoverage shown={onlyTheirs.length} total={counts.onlyTheirs} />
            {onlyTheirs.length > 0 && <MediaGrid items={onlyTheirs} size="small" />}
          </section>
        )}
      </div>

      <p className="mt-12 text-sm text-gray-500">
        Worked out from the two links alone – nothing about either list is
        stored here.{" "}
        <Link
          href="/match"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Compare a different pair
        </Link>
        .
      </p>
    </div>
  );
}

function DetailsCoverage({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;

  return (
    <p className="text-sm text-gray-400 mb-4" role="note">
      Showing details for {shown} of {total} title{total === 1 ? "" : "s"}.
      The remaining {total - shown === 1 ? "title still counts" : "titles still count"} in
      the comparison, but {total - shown === 1 ? "its" : "their"} details are unavailable.
    </p>
  );
}
