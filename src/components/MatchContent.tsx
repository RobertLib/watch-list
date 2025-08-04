"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, Users } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { LoadingSection } from "@/components/LoadingSpinner";
import { MatchStarter } from "@/components/MatchStarter";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSettingsKey } from "@/hooks/useSettings";
import { getSharedListItems } from "@/lib/shared-list-data";
import { decodeSharedList } from "@/lib/shared-list";
import { matchLists } from "@/lib/list-match";

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

  useDocumentTitle(
    mine && theirs ? "What you both want to watch" : "What should we watch?",
  );

  if (!mine || !theirs) return <MatchStarterPage />;

  return <MatchResults mine={mine} theirs={theirs} />;
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

function MatchResults({ mine, theirs }: { mine: string; theirs: string }) {
  const settingsKey = useSettingsKey();

  const { data } = useAsyncData(async () => {
    const match = matchLists(decodeSharedList(mine), decodeSharedList(theirs));

    // Resolved together rather than section by section: the same title can appear
    // in more than one bucket's worth of ids, and one pass shares the cache hits.
    const [shared, onlyMine, onlyTheirs] = await Promise.all([
      getSharedListItems(match.shared),
      getSharedListItems(match.onlyMine),
      getSharedListItems(match.onlyTheirs),
    ]);

    return { shared, onlyMine, onlyTheirs };
  }, [mine, theirs, settingsKey]);

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingSection title="" rows={2} cols={6} />
      </div>
    );
  }

  const { shared, onlyMine, onlyTheirs } = data;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="h-8 w-8 text-pink-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Where your lists agree</h1>
        </div>
        <p className="text-gray-400">
          {shared.length > 0
            ? `${shared.length} title${
                shared.length === 1 ? "" : "s"
              } you have both saved. Start there.`
            : "No overlap between these two lists – but there is plenty below to argue about."}
        </p>
      </div>

      {shared.length > 0 && (
        <section aria-labelledby="both-heading" className="mb-12">
          <h2
            id="both-heading"
            className="text-xl font-semibold text-white mb-4 flex items-center gap-2"
          >
            <Heart className="w-5 h-5 text-pink-400" aria-hidden="true" />
            Both of you
          </h2>
          <MediaGrid items={shared} size="medium" />
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-10">
        {onlyMine.length > 0 && (
          <section aria-labelledby="mine-heading">
            <h2
              id="mine-heading"
              className="text-xl font-semibold text-white mb-4"
            >
              Only on the first list
            </h2>
            <MediaGrid items={onlyMine} size="small" />
          </section>
        )}

        {onlyTheirs.length > 0 && (
          <section aria-labelledby="theirs-heading">
            <h2
              id="theirs-heading"
              className="text-xl font-semibold text-white mb-4"
            >
              Only on the second
            </h2>
            <MediaGrid items={onlyTheirs} size="small" />
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
