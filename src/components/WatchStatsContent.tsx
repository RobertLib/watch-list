"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BarChart3, Check, Share2, Target, Trophy } from "lucide-react";
import { getWatchStatsFacts } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { toast } from "@/components/Toast";
import { useWatched } from "@/contexts/WatchedContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { useRatings } from "@/hooks/useRatings";
import { useTransientFlag } from "@/hooks/useTransientFlag";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { useLocalDay } from "@/hooks/useLocalDay";
import {
  DEFAULT_PROFILE_ID,
  getActiveProfileId,
  subscribeProfiles,
} from "@/lib/profiles";
import { achievementsFor, TOTAL_ACHIEVEMENTS } from "@/lib/achievements";
import {
  dayOfYear,
  daysInYear,
  getGoalSnapshot,
  goalProgress,
  MAX_GOAL,
  MIN_GOAL,
  saveGoal,
  subscribeToGoal,
  type YearlyGoal,
} from "@/lib/goal";
import {
  buildStatsShareText,
  formatWatchTime,
  summarize,
  summarizeYear,
  yearsCovered,
  type StatsInput,
  type TitleFacts,
  type WatchStats,
} from "@/lib/stats";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/routes";
import { TitleFactsLoadError } from "@/lib/stats-data";
import { withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

const serverOwnedGoal = { profileId: DEFAULT_PROFILE_ID, goal: null };
let cachedOwnedGoal: { profileId: string; goal: YearlyGoal | null } = serverOwnedGoal;

/** A goal and its owner must advance together, including unchanged targets. */
function getOwnedGoalSnapshot() {
  const profileId = getActiveProfileId();
  const goal = withProfileStorage(profileId, getGoalSnapshot);
  if (profileId !== cachedOwnedGoal.profileId || goal !== cachedOwnedGoal.goal) {
    cachedOwnedGoal = { profileId, goal };
  }
  return cachedOwnedGoal;
}

function subscribeToOwnedGoal(onChange: () => void) {
  const unsubscribeGoal = subscribeToGoal(onChange);
  const unsubscribeProfile = subscribeProfiles(onChange);
  return () => {
    unsubscribeGoal();
    unsubscribeProfile();
  };
}

const getServerOwnedGoalSnapshot = () => serverOwnedGoal;

/**
 * Everything the record adds up to.
 *
 * All of this has been accumulating since the first ticked episode and none of it
 * has ever been shown back – which is a waste of the only genuinely personal
 * thing the app holds. A number that moves only by watching something is also, in
 * itself, a reason to come back and move it.
 */
export function WatchStatsContent() {
  const { watched, isLoading: isWatchedLoading } = useWatched();
  const { progress, isLoading: isProgressLoading } = useEpisodeProgress();
  const { ratings } = useRatings();
  const { checkProfile } = useProfileGuard("goal");
  const today = useLocalDay();

  const [facts, setFacts] = useState<Record<string, TitleFacts>>({});
  const [hasLoaded, setHasLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const goalWritePending = useRef(false);
  const mounted = useRef(false);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const ownedGoal = useSyncExternalStore(
    subscribeToOwnedGoal,
    getOwnedGoalSnapshot,
    getServerOwnedGoalSnapshot,
  );

  const isLoading = isWatchedLoading || isProgressLoading;

  const episodesByShow = useMemo(() => {
    const counts: Record<number, number> = {};

    for (const [tvId, show] of Object.entries(progress)) {
      counts[Number(tvId)] = Object.values(show.seasons).reduce(
        (total, episodes) => total + episodes.length,
        0,
      );
    }

    return counts;
  }, [progress]);

  // Everything that needs a runtime: the watched list, plus shows that have
  // ticked episodes but were never marked watched as a whole.
  const refs = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: number; mediaType: "movie" | "tv" }> = [];

    for (const item of watched) {
      const key = `${item.mediaType}-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ id: item.id, mediaType: item.mediaType });
    }

    for (const tvId of Object.keys(episodesByShow)) {
      const key = `tv-${tvId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ id: Number(tvId), mediaType: "tv" });
    }

    return list;
  }, [watched, episodesByShow]);

  const [loadedFactsFor, setLoadedFactsFor] = useState<{
    refs: typeof refs | null;
    attempt: number;
    failedCount: number;
  }>({ refs: null, attempt: -1, failedCount: 0 });
  const isFetching = refs.length > 0 &&
    (loadedFactsFor.refs !== refs || loadedFactsFor.attempt !== attempt);
  const failedCount = isFetching ? 0 : loadedFactsFor.failedCount;
  const retryFacts = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (failedCount === 0) return;

    window.addEventListener("online", retryFacts);
    return () => window.removeEventListener("online", retryFacts);
  }, [failedCount, retryFacts]);

  useEffect(() => {
    if (isLoading) return;

    // Nothing watched and nothing ticked, so there are no runtimes to resolve.
    // The spinner keys off the same emptiness, so the empty state renders
    // without a load ever settling.
    if (refs.length === 0) return;

    let isCurrent = true;
    const controller = new AbortController();

    (async () => {
      try {
        const resolved = await getWatchStatsFacts(refs, controller.signal);
        if (isCurrent) {
          setFacts(resolved);
          setLoadedFactsFor({ refs, attempt, failedCount: 0 });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Error loading stats:", error);
        if (isCurrent) {
          if (error instanceof TitleFactsLoadError) {
            // A retry may resolve different parts of the history. Retain facts
            // already verified for these titles as well as this attempt's reads.
            setFacts((previous) => {
              const available = { ...previous, ...error.facts };
              return Object.fromEntries(
                refs.flatMap((ref) => {
                  const key = `${ref.mediaType}-${ref.id}`;
                  return available[key] ? [[key, available[key]]] : [];
                }),
              );
            });
          }
          setLoadedFactsFor({
            refs,
            attempt,
            failedCount: error instanceof TitleFactsLoadError
              ? error.failedKeys.length
              : refs.length,
          });
        }
      } finally {
        if (isCurrent) setHasLoaded(true);
      }
    })();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [refs, isLoading, attempt]);

  const input = useMemo<StatsInput>(
    () => ({
      watched: watched.map((item) => ({
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        watchedAt: item.watchedAt,
      })),
      episodesByShow,
      ratings,
      facts,
    }),
    [watched, episodesByShow, ratings, facts],
  );

  const stats = useMemo(() => summarize(input), [input]);
  const years = useMemo(() => yearsCovered(input), [input]);

  if (!today || isLoading || (!hasLoaded && refs.length > 0)) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (stats.totalTitles === 0 && stats.episodes === 0) return <NothingYet />;

  return (
    <div className="space-y-12">
      {failedCount > 0 && (
        <LoadFailureNotice
          compact
          title="Some statistics could not be updated"
          description={`Details for ${failedCount} title${failedCount === 1 ? "" : "s"} could not be loaded. Your saved counts and available details are shown below; watch time, genres and decades may be incomplete.`}
          onRetry={retryFacts}
        />
      )}
      {isFetching && (
        <p className="text-sm text-gray-400" role="status">
          Updating title details…
        </p>
      )}
      <Headline stats={stats} />
      <GoalPanel
        key={ownedGoal.profileId}
        goal={ownedGoal.goal}
        today={today}
        isSaving={isSavingGoal}
        onChange={async (next) => {
          if (!mounted.current || goalWritePending.current) return;
          goalWritePending.current = true;
          setIsSavingGoal(true);
          const profileId = ownedGoal.profileId;
          try {
            const result = await withProfileRosterLock(() => {
              if (!mounted.current) return "cancelled";
              if (!checkProfile(profileId)) return "profile-changed";
              return withProfileStorage(profileId, () => saveGoal(next)) ? "saved" : "failed";
            }, "failed");
            if (mounted.current && result === "failed") {
              toast.showToast(
                next === null
                  ? "Could not clear your goal. Please try again."
                  : "Could not save your goal. Please try again.",
                "error",
              );
            }
          } finally {
            goalWritePending.current = false;
            if (mounted.current) setIsSavingGoal(false);
          }
        }}
        // The count and goal share the local day, refreshed at midnight and
        // when a suspended tab becomes visible again.
        watchedThisYear={stats.byYear[today.slice(0, 4)] ?? 0}
      />
      <Breakdown stats={stats} />
      <Achievements stats={stats} />
      {years.length > 0 && <YearInReview input={input} years={years} />}
    </div>
  );
}

function Headline({ stats }: { stats: WatchStats }) {
  return (
    <section aria-labelledby="totals-heading">
      <h2 id="totals-heading" className="sr-only">
        Totals
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Films" value={stats.films.toString()} />
        <Stat label="Series" value={stats.series.toString()} />
        <Stat label="Episodes" value={stats.episodes.toString()} />
        <Stat
          label="Watch time"
          value={formatWatchTime(stats.minutes)}
          hint={
            stats.titlesWithoutRuntime > 0
              ? `Watch time excludes ${stats.titlesWithoutRuntime} title${
                  stats.titlesWithoutRuntime === 1 ? "" : "s"
                } with an unknown runtime`
              : undefined
          }
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {hint && <p className="text-xs text-gray-600 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function GoalPanel({
  goal,
  today,
  isSaving,
  onChange,
  watchedThisYear,
}: {
  goal: YearlyGoal | null;
  today: string;
  isSaving: boolean;
  onChange: (goal: YearlyGoal | null) => Promise<void>;
  watchedThisYear: number;
}) {
  const [draft, setDraft] = useState("52");
  const year = today.slice(0, 4);

  // A goal set last year is history: it is shown as finished rather than as a
  // bar nobody can move any more.
  const isCurrentYear = goal?.year === year;

  if (!goal || !isCurrentYear) {
    return (
      <section
        aria-labelledby="goal-heading"
        aria-busy={isSaving}
        className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"
      >
        <h2
          id="goal-heading"
          className="font-semibold text-white flex items-center gap-2"
        >
          <Target className="w-5 h-5 text-green-400" aria-hidden="true" />
          Set a target for {year}
        </h2>
        <p className="text-sm text-gray-400 mt-1 mb-4">
          A number to be ahead or behind. You have finished {watchedThisYear} so
          far this year.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (isSaving) return;
            const target = Number(draft);
            if (!Number.isInteger(target) || target < MIN_GOAL || target > MAX_GOAL) {
              toast.showToast(
                `Pick a number between ${MIN_GOAL} and ${MAX_GOAL}`,
                "error",
              );
              return;
            }
            void onChange({ year, target });
          }}
          className="flex gap-2"
        >
          <label htmlFor="goal-target" className="sr-only">
            Titles to watch in {year}
          </label>
          <input
            id="goal-target"
            type="number"
            min={MIN_GOAL}
            max={MAX_GOAL}
            disabled={isSaving}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-white focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors"
          >
            {isSaving ? "Saving…" : "Set goal"}
          </button>
        </form>
      </section>
    );
  }

  const now = new Date(`${today}T00:00:00`);
  const progress = goalProgress(goal, watchedThisYear, {
    dayOfYear: dayOfYear(now),
    daysInYear: daysInYear(now.getFullYear()),
  });

  const ahead =
    progress.expectedByNow !== null && progress.watched >= progress.expectedByNow;

  return (
    <section
      aria-labelledby="goal-heading"
      aria-busy={isSaving}
      className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="goal-heading"
          className="font-semibold text-white flex items-center gap-2"
        >
          <Target className="w-5 h-5 text-green-400" aria-hidden="true" />
          {goal.year} goal
        </h2>
        <button
          onClick={() => { void onChange(null); }}
          disabled={isSaving}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          {isSaving ? "Clearing…" : "Clear"}
        </button>
      </div>

      <p className="text-2xl font-bold text-white">
        {progress.watched}{" "}
        <span className="text-gray-500 text-lg font-normal">
          of {progress.target}
        </span>
      </p>

      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            ahead ? "bg-green-500" : "bg-amber-500",
          )}
          style={{ width: `${Math.round(progress.fraction * 100)}%` }}
        />
      </div>

      <p className="text-sm text-gray-400">
        {progress.remaining === 0
          ? "Done – and there is still time left in the year."
          : progress.expectedByNow === null
            ? `${progress.remaining} to go.`
            : ahead
              ? `${progress.remaining} to go, and you are ahead of pace.`
              : `${progress.remaining} to go – on pace you would be at ${progress.expectedByNow} by now.`}
      </p>
    </section>
  );
}

function Breakdown({ stats }: { stats: WatchStats }) {
  const topGenreCount = stats.topGenres[0]?.count ?? 1;
  const maxDecade = Math.max(1, ...stats.decades.map((entry) => entry.count));
  const maxRating = Math.max(1, ...stats.ratingHistogram);

  return (
    <section aria-labelledby="breakdown-heading" className="space-y-8">
      <h2
        id="breakdown-heading"
        className="text-xl font-semibold text-white flex items-center gap-2"
      >
        <BarChart3 className="w-5 h-5 text-blue-400" aria-hidden="true" />
        What you watch
      </h2>

      <div className="grid lg:grid-cols-2 gap-8">
        {stats.topGenres.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Genres</h3>
            <ul className="space-y-2">
              {stats.topGenres.map((genre) => (
                <li key={genre.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-sm text-gray-400 truncate">
                    {genre.name}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                    <span
                      className="block h-full bg-blue-500"
                      style={{
                        width: `${(genre.count / topGenreCount) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right text-sm text-gray-500 tabular-nums">
                    {genre.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stats.decades.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">
              Decades you reach for
            </h3>
            <ul className="flex items-end gap-2 h-32" aria-label="Watch history by decade">
              {stats.decades.map((decade) => (
                <li
                  key={decade.name}
                  className="h-full flex-1 flex flex-col items-center gap-1.5"
                  title={`${decade.name}: ${decade.count}`}
                >
                  <span className="relative w-full flex-1 min-h-0">
                    <span
                      className="absolute bottom-0 w-full rounded-t bg-purple-500/70"
                      style={{
                        height: `${Math.max(4, (decade.count / maxDecade) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-500">
                    {decade.name.replace("0s", "0")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {stats.ratedCount > 0 && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="text-sm font-medium text-gray-300">
              Your scores{" "}
              <span className="text-gray-500 font-normal">
                (average {stats.averageRating?.toFixed(1)} over{" "}
                {stats.ratedCount})
              </span>
            </h3>
            {/* A histogram says how you rate; this is where you see what. */}
            <Link
              href="/ratings"
              prefetch={false}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              See everything you rated
            </Link>
          </div>
          <ul className="flex items-end gap-1.5 h-24" aria-label="Rating distribution">
            {stats.ratingHistogram.map((count, index) => (
              <li
                key={index}
                className="h-full flex-1 flex flex-col items-center gap-1"
                title={`${index + 1}/10: ${count}`}
              >
                <span className="relative w-full flex-1 min-h-0">
                  <span
                    className="absolute bottom-0 w-full rounded-t bg-yellow-500/70"
                    style={{
                      height: `${count === 0 ? 0 : Math.max(3, (count / maxRating) * 100)}%`,
                    }}
                  />
                </span>
                <span className="shrink-0 text-[11px] text-gray-500">{index + 1}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Achievements({ stats }: { stats: WatchStats }) {
  const achievements = achievementsFor(stats);
  const earned = achievements.filter((achievement) => achievement.earned).length;

  return (
    <section aria-labelledby="achievements-heading">
      <h2
        id="achievements-heading"
        className="text-xl font-semibold text-white flex items-center gap-2 mb-4"
      >
        <Trophy className="w-5 h-5 text-yellow-400" aria-hidden="true" />
        Achievements{" "}
        <span className="text-gray-500 font-normal text-base">
          {earned}/{TOTAL_ACHIEVEMENTS}
        </span>
      </h2>

      <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {achievements.map((achievement) => (
          <li
            key={achievement.id}
            className={cn(
              "rounded-xl border p-3",
              achievement.earned
                ? "border-yellow-500/30 bg-yellow-500/10"
                : "border-gray-800 bg-gray-900/40",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "text-xl",
                  !achievement.earned && "grayscale opacity-40",
                )}
              >
                {achievement.emoji}
              </span>
              <p
                className={cn(
                  "text-sm font-medium",
                  achievement.earned ? "text-yellow-200" : "text-gray-400",
                )}
              >
                {achievement.label}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {achievement.description}
            </p>
            {!achievement.earned && (
              <p className="text-xs text-gray-600 mt-1 tabular-nums">
                {achievement.progress.current}/{achievement.progress.target}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function YearInReview({
  input,
  years,
}: {
  input: StatsInput;
  years: string[];
}) {
  const [year, setYear] = useState(years[0]);
  const [copied, markCopied] = useTransientFlag(2500);

  // Removing a year's last title or switching profiles can remove its option.
  // Reset before committing the render so the picker, summary and shared text
  // all describe the same available year.
  if (!years.includes(year)) setYear(years[0]);

  const stats = useMemo(() => summarizeYear(input, year), [input, year]);

  async function share() {
    const url =
      typeof window === "undefined" ? SITE_URL : window.location.origin;
    const text = buildStatsShareText(stats, `${year} in review`, url);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Dismissed – fall through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      toast.showToast("Could not copy your year", "error");
    }
  }

  return (
    <section
      aria-labelledby="year-heading"
      className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="year-heading" className="text-xl font-semibold text-white">
          {year} in review
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="review-year" className="sr-only">
            Year
          </label>
          <select
            id="review-year"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="px-3 py-1.5 rounded-lg bg-black/60 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            onClick={share}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" aria-hidden="true" />
            ) : (
              <Share2 className="w-4 h-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Share"}
          </button>
        </div>
      </div>

      <p className="text-gray-300 leading-relaxed">
        You finished{" "}
        <span className="text-white font-semibold">
          {stats.totalTitles} title{stats.totalTitles === 1 ? "" : "s"}
        </span>{" "}
        in {year}
        {stats.minutes > 0 && <> – around {formatWatchTime(stats.minutes)}</>}
        {stats.topGenres[0] && (
          <>
            , mostly{" "}
            <span className="text-white">
              {stats.topGenres[0].name.toLowerCase()}
            </span>
          </>
        )}
        .
        {stats.averageRating !== null && (
          <> You scored them {stats.averageRating.toFixed(1)} on average.</>
        )}
      </p>
    </section>
  );
}

function NothingYet() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <BarChart3 className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">Nothing to count yet</h2>
      <p className="text-gray-400 max-w-md mx-auto">
        Mark something watched, or tick an episode, and this page starts keeping
        score – hours, genres, decades, and how you rate what you finish.
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
