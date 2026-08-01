"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Crown,
  RotateCcw,
  Swords,
} from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ShareListButton } from "@/components/ShareListButton";
import { useWatchlist } from "@/contexts/WatchlistContext";
import {
  getRanking,
  nextPair,
  positionOf,
  progressFor,
  rankedItems,
  recordChoice,
  roundsRemaining,
  saveRanking,
  type Ranking,
} from "@/lib/ranking";
import { getImageUrl } from "@/lib/tmdb-image";
import { createSlug, mediaItemKey } from "@/lib/utils";
import type { WatchlistItem } from "@/lib/watchlist";

// How many of the ranked list to show, and to offer as a share link.
const TOP_N = 10;

/**
 * Rank the watchlist by asking one question at a time.
 *
 * "Which of these two?" is a question people can always answer, unlike "rate this
 * out of ten", which produces a column of sevens. It is also the only feature
 * here with no finish line – there is always another pair – and an unfinished
 * thing is what people come back to.
 *
 * The payoff at the bottom is a ranked top ten that can be shared as a link,
 * which is the same URL-encoded list the rest of the app passes around.
 */
export function WatchlistRanking() {
  const { watchlist, isLoading } = useWatchlist();
  const [ranking, setRanking] = useState<Ranking>({});
  const [hasLoaded, setHasLoaded] = useState(false);
  // Bumped after each choice so a fresh pair is drawn. The pair is state rather
  // than a derivation because drawing it is random – deriving it during render
  // would reshuffle the two posters under the cursor on every re-render.
  const [round, setRound] = useState(0);
  const [pair, setPair] = useState<[WatchlistItem, WatchlistItem] | null>(null);
  // The effect of the last choice, shown back so a click has a visible result.
  const [lastMove, setLastMove] = useState<{
    title: string;
    from: number | null;
    to: number;
  } | null>(null);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from
       a browser-only store, as every stored record here does */
    setRanking(getRanking());
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    /* eslint-disable-next-line react-hooks/set-state-in-effect -- the draw is
       random, so it cannot happen during render */
    setPair(nextPair(watchlist, getRanking()));
  }, [watchlist, hasLoaded, round]);

  const choose = useCallback(
    (winner: WatchlistItem, loser: WatchlistItem) => {
      const winnerKey = mediaItemKey(winner.id, winner.mediaType);
      const before = positionOf(watchlist, ranking, winnerKey);

      const updated = recordChoice(
        ranking,
        winnerKey,
        mediaItemKey(loser.id, loser.mediaType),
      );

      setRanking(updated);
      saveRanking(updated);

      // What that click just did. Without it a choice disappears into a bar that
      // creeps a few pixels, which is the whole reason this felt pointless.
      const after = positionOf(watchlist, updated, winnerKey);
      if (after !== null) {
        setLastMove({ title: winner.title, from: before, to: after });
      }

      setRound((current) => current + 1);
    },
    [ranking, watchlist],
  );

  const ranked = useMemo(
    () => rankedItems(watchlist, ranking),
    [watchlist, ranking],
  );

  const progress = progressFor(watchlist.length, ranking);
  const remaining = roundsRemaining(watchlist.length, ranking);
  const top = ranked.slice(0, TOP_N);

  if (isLoading || !hasLoaded) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (watchlist.length < 2) return <NotEnoughSaved />;

  return (
    <div className="space-y-10">
      <section aria-labelledby="duel-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="duel-heading"
            className="text-lg font-semibold text-white flex items-center gap-2"
          >
            <Swords className="w-5 h-5 text-purple-400" aria-hidden="true" />
            Which would you rather watch?
          </h2>
          <button
            onClick={() => setRound((current) => current + 1)}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Skip this pair
          </button>
        </div>

        {pair ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <ContenderButton
              item={pair[0]}
              onPick={() => choose(pair[0], pair[1])}
            />
            <ContenderButton
              item={pair[1]}
              onPick={() => choose(pair[1], pair[0])}
            />
          </div>
        ) : (
          <div className="py-8">
            <LoadingSpinner />
          </div>
        )}

        {/* The result of the click that just happened. Reserved height, so the
            layout does not jump the first time one appears. */}
        <div className="min-h-6" aria-live="polite">
          {lastMove && (
            <p className="text-sm text-purple-200 flex items-center gap-2">
              <ArrowUpRight
                className="w-4 h-4 text-purple-400 shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">
                <span className="font-medium">{lastMove.title}</span>{" "}
                {lastMove.from !== null && lastMove.from !== lastMove.to
                  ? `moved from #${lastMove.from} to #${lastMove.to}`
                  : `holds #${lastMove.to}`}
              </span>
            </p>
          )}
        </div>

        <div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-[width] duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {remaining > 0
              ? `${remaining} more comparison${
                  remaining === 1 ? "" : "s"
                } before the order below is worth trusting.`
              : "Every title has been compared enough. Keep going only if you want to split hairs near the top."}
          </p>
        </div>
      </section>

      {/* The payoff, said out loud. Reaching the end of the bar used to change
          nothing but a line of grey text, which read as "nothing happened". */}
      {progress >= 1 && (
        <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-green-200">
              Your order is settled
            </p>
            <p className="text-sm text-gray-300 mt-0.5">
              {ranked[0]?.item.title
                ? `${ranked[0].item.title} came out on top. The full order is below.`
                : "The full order is below."}
            </p>
          </div>
          <ShareListButton
            items={top.map(({ item }) => ({
              id: item.id,
              mediaType: item.mediaType,
            }))}
            defaultTitle="My top films"
          />
        </div>
      )}

      <section aria-labelledby="ranked-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="ranked-heading"
            className="text-lg font-semibold text-white flex items-center gap-2"
          >
            <Crown className="w-5 h-5 text-yellow-400" aria-hidden="true" />
            Your top {Math.min(TOP_N, ranked.length)}
          </h2>
          <div className="flex items-center gap-3">
            <ShareListButton
              items={top.map(({ item }) => ({
                id: item.id,
                mediaType: item.mediaType,
              }))}
              defaultTitle="My top films"
            />
            <ResetButton
              onReset={() => {
                setRanking({});
                saveRanking({});
                setRound((current) => current + 1);
              }}
            />
          </div>
        </div>

        {remaining > 0 && (
          <p className="text-sm text-gray-500">
            Provisional – anything you have not compared yet is sitting where it
            landed on your watchlist, not where it belongs.
          </p>
        )}

        <ol className="space-y-2">
          {top.map(({ item, entry }, index) => (
            <li key={mediaItemKey(item.id, item.mediaType)}>
              <Link
                href={`/${item.mediaType}/${createSlug(item.title, item.id)}`}
                prefetch={false}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="w-6 text-center text-sm font-mono text-gray-500 shrink-0">
                  {index + 1}
                </span>
                <div className="relative w-9 aspect-2/3 shrink-0 rounded overflow-hidden bg-gray-800">
                  {item.posterPath && (
                    <Image
                      src={getImageUrl(item.posterPath, "w185")}
                      alt=""
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <span className="flex-1 min-w-0 text-sm font-medium text-white group-hover:text-blue-300 transition-colors truncate">
                  {item.title}
                </span>
                <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                  {entry.matches === 0
                    ? "not compared"
                    : `${Math.round(entry.rating)}`}
                </span>
              </Link>
            </li>
          ))}
        </ol>

        {ranked.length > TOP_N && (
          <Link
            href="/watchlist"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            See the whole list
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
      </section>
    </div>
  );
}

function ContenderButton({
  item,
  onPick,
}: {
  item: WatchlistItem;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="group text-left rounded-xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-purple-500/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      <div className="relative aspect-2/3 bg-gray-800">
        {item.posterPath && (
          <Image
            src={getImageUrl(item.posterPath, "w500")}
            alt={item.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-white line-clamp-2">
          {item.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.releaseDate?.slice(0, 4) || "—"}
        </p>
      </div>
    </button>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        Reset
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        onClick={() => {
          onReset();
          setConfirming(false);
        }}
        className="text-red-400 hover:text-red-300 transition-colors"
      >
        Erase the ranking
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-gray-500 hover:text-white transition-colors"
      >
        Cancel
      </button>
    </span>
  );
}

function NotEnoughSaved() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <Swords className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">Save two titles first</h2>
      <p className="text-gray-400 max-w-md mx-auto">
        This ranks your watchlist by asking which of two you would rather watch.
        It needs at least a pair to ask about.
      </p>
      <Link
        href="/"
        prefetch={false}
        className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
      >
        Discover Content
      </Link>
    </div>
  );
}
