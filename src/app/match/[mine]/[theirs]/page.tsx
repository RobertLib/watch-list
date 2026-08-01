import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Users } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { getSharedListItems } from "@/lib/shared-list-server";
import { decodeSharedList } from "@/lib/shared-list";
import { matchLists } from "@/lib/list-match";

interface PageProps {
  params: Promise<{ mine: string; theirs: string }>;
}

export const metadata: Metadata = {
  title: "What you both want to watch",
  description:
    "The overlap between two watchlists, worked out from the links themselves.",
  // Both lists are named by the URL, so this is as unlisted as a share link.
  robots: { index: false, follow: false },
};

/**
 * The overlap between two lists.
 *
 * Nothing is stored: both lists arrive in the path, the intersection is computed
 * from them, and the titles are resolved from TMDB the same way a shared list is.
 * Two people can settle an evening by swapping links.
 */
export default async function MatchPage({ params }: PageProps) {
  const { mine, theirs } = await params;

  const match = matchLists(decodeSharedList(mine), decodeSharedList(theirs));

  // One batch rather than three: the same title can appear in more than one
  // bucket's worth of ids, and resolving them together shares the cache hits.
  const [shared, onlyMine, onlyTheirs] = await Promise.all([
    getSharedListItems(match.shared),
    getSharedListItems(match.onlyMine),
    getSharedListItems(match.onlyTheirs),
  ]);

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
        Worked out from the two links alone – nothing about either list is stored
        here.{" "}
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
