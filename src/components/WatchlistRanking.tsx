"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "@/components/Toast";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import {
  getRanking,
  nextPair,
  positionOf,
  progressFor,
  rankedItems,
  RANKING_STORAGE_KEY,
  recordChoice,
  roundsRemaining,
  saveRanking,
  type Ranking,
} from "@/lib/ranking";
import { getImageUrl } from "@/lib/tmdb-image";
import { createSlug, mediaItemKey } from "@/lib/utils";
import { getWatchlist, type WatchlistItem } from "@/lib/watchlist";
import { mediaHref } from "@/lib/routes";
import { isProfileStoreEvent, withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

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
  const { profileId, checkProfile } = useProfileGuard();
  return <ProfileWatchlistRanking key={profileId} profileId={profileId} checkProfile={checkProfile} />;
}

function ProfileWatchlistRanking({ profileId, checkProfile }: {
  profileId: string;
  checkProfile: (expectedId?: string) => boolean;
}) {
  const { watchlist, isLoading } = useWatchlist();
  const [ranking, setRanking] = useState<Ranking>({});
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  // Bumped after each choice so a fresh pair is drawn. The pair is state rather
  // than a derivation because drawing it is random – deriving it during render
  // would reshuffle the two posters under the cursor on every re-render.
  const [round, setRound] = useState(0);
  const [pair, setPair] = useState<{
    items: [WatchlistItem, WatchlistItem];
    profileId: string;
  } | null>(null);
  // The effect of the last choice, shown back so a click has a visible result.
  const [lastMove, setLastMove] = useState<{
    title: string;
    from: number | null;
    to: number;
  } | null>(null);

  useEffect(() => {
    mounted.current = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from
       a browser-only store, as every stored record here does */
    setRanking(getRanking());
    setHasLoaded(true);

    const onStorage = (event: StorageEvent) => {
      if (!isProfileStoreEvent(event.key, RANKING_STORAGE_KEY)) return;
      setRanking(getRanking());
      setLastMove(null);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    const items = withProfileStorage(profileId, () => nextPair(getWatchlist(), getRanking()));
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- the draw is
       random, so it cannot happen during render */
    setPair(items ? { items, profileId } : null);
  }, [watchlist, hasLoaded, round, profileId]);

  async function mutate(ownerId: string, operation: () => boolean, failureMessage: string) {
    if (saving.current || !checkProfile(ownerId)) return false;
    saving.current = true;
    setIsSaving(true);
    try {
      const result = await withProfileRosterLock<boolean | null | undefined>(() => {
        if (!mounted.current || !checkProfile(ownerId)) return null;
        return withProfileStorage(ownerId, operation);
      }, undefined);
      if (result === undefined && mounted.current) toast.showToast(failureMessage, "error");
      return result === true;
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }

  async function choose(winner: WatchlistItem, loser: WatchlistItem, ownerId: string) {
    await mutate(ownerId, () => {
      const latestWatchlist = getWatchlist({ strict: true });
      if (![winner, loser].every((item) => latestWatchlist.some(
        (entry) => entry.id === item.id && entry.mediaType === item.mediaType,
      ))) {
        setRound((current) => current + 1);
        toast.showToast("Your watchlist changed. Review the current pair and try again.", "info");
        return false;
      }
      const winnerKey = mediaItemKey(winner.id, winner.mediaType);
      // The storage event from another tab may still be queued when this click
      // arrives. Read the latest record rather than replacing it with our render.
      const current = getRanking({ strict: true });
      const before = positionOf(latestWatchlist, current, winnerKey);

      const updated = recordChoice(
        current,
        winnerKey,
        mediaItemKey(loser.id, loser.mediaType),
      );

      if (!saveRanking(updated)) {
        toast.showToast("Could not save your choice. Please try again.", "error");
        return false;
      }
      setRanking(updated);

      // What that click just did. Without it a choice disappears into a bar that
      // creeps a few pixels, which is the whole reason this felt pointless.
      const after = positionOf(latestWatchlist, updated, winnerKey);
      if (after !== null) {
        setLastMove({ title: winner.title, from: before, to: after });
      }

      setRound((current) => current + 1);
      return true;
    }, "Could not save your choice. Please try again.");
  }

  const ranked = useMemo(
    () => rankedItems(watchlist, ranking),
    [watchlist, ranking],
  );

  const progress = progressFor(watchlist, ranking);
  const remaining = roundsRemaining(watchlist, ranking);
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
            // Native `disabled` would blur this button in browsers mid-save;
            // the guard below refuses the skip instead.
            aria-disabled={isSaving}
            onClick={() => {
              if (!saving.current) setRound((current) => current + 1);
            }}
            className="text-sm text-gray-400 hover:text-white aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
          >
            Skip this pair
          </button>
        </div>

        {pair ? (
          // Deliberately unkeyed: the next pair is drawn into the same two
          // buttons, so the one just pressed keeps keyboard focus and Enter
          // answers the next question without hunting for it again.
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <ContenderButton
              item={pair.items[0]}
              isSaving={isSaving}
              onPick={() => choose(pair.items[0], pair.items[1], pair.profileId)}
            />
            <ContenderButton
              item={pair.items[1]}
              isSaving={isSaving}
              onPick={() => choose(pair.items[1], pair.items[0], pair.profileId)}
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
              key={profileId}
              isSaving={isSaving}
              onReset={() => mutate(profileId, () => {
                if (!saveRanking({})) {
                  toast.showToast("Could not reset your ranking. Please try again.", "error");
                  return false;
                }
                setRanking({});
                setLastMove(null);
                setRound((current) => current + 1);
                return true;
              }, "Could not reset your ranking. Please try again.")}
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
                href={mediaHref(item.mediaType, createSlug(item.title, item.id))}
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
  isSaving,
}: {
  item: WatchlistItem;
  onPick: () => void;
  isSaving: boolean;
}) {
  return (
    <button
      onClick={onPick}
      // Not native `disabled`: browsers blur a disabled button, so every pick
      // used to drop keyboard focus on the page body mid-duel. `mutate`
      // already refuses a second choice while one is being saved.
      aria-disabled={isSaving}
      aria-busy={isSaving}
      className="group text-left rounded-xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-purple-500/60 aria-disabled:cursor-wait transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
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

function ResetButton({ onReset, isSaving }: { onReset: () => Promise<boolean>; isSaving: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const mounted = useRef(true);
  const resetRef = useRef<HTMLButtonElement>(null);
  const eraseRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Each step replaces the button that was pressed, which would leave focus on
  // the page body. Where it should land once the swap has rendered – only set
  // when the pressed button actually held focus, so a mouse click in Safari
  // (which does not focus buttons) is not answered with a jump.
  const focusAfterSwap = useRef<"reset" | "cancel" | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const target = focusAfterSwap.current;
    focusAfterSwap.current = null;
    if (target === "reset") resetRef.current?.focus();
    // The safe answer, not the destructive one: a second Enter must not erase.
    else if (target === "cancel") cancelRef.current?.focus();
  }, [confirming]);

  function swap(next: boolean, pressed: HTMLElement | null) {
    if (pressed && document.activeElement === pressed) {
      focusAfterSwap.current = next ? "cancel" : "reset";
    }
    setConfirming(next);
  }

  // Not native `disabled` on any of these: it blurs the pressed button in
  // browsers. Each handler refuses to act while a save is pending instead.
  if (!confirming) {
    return (
      <button
        ref={resetRef}
        aria-disabled={isSaving}
        onClick={(event) => {
          if (!isSaving) swap(true, event.currentTarget);
        }}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        Reset
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        ref={eraseRef}
        aria-disabled={isSaving}
        aria-busy={isSaving}
        onClick={async () => {
          if (await onReset() && mounted.current) swap(false, eraseRef.current);
        }}
        className="text-red-400 hover:text-red-300 aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
      >
        Erase the ranking
      </button>
      <button
        ref={cancelRef}
        aria-disabled={isSaving}
        onClick={(event) => {
          if (!isSaving) swap(false, event.currentTarget);
        }}
        className="text-gray-500 hover:text-white aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
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
