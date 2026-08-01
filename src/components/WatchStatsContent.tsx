"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, Share2, Target, Trophy } from "lucide-react";
import { getWatchStatsFacts } from "@/app/actions";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { toast } from "@/components/Toast";
import { useWatched } from "@/contexts/WatchedContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { useRatings } from "@/hooks/useRatings";
import { achievementsFor, TOTAL_ACHIEVEMENTS } from "@/lib/achievements";
import {
  dayOfYear,
  daysInYear,
  getGoal,
  goalProgress,
  MAX_GOAL,
  MIN_GOAL,
  saveGoal,
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

  const [facts, setFacts] = useState<Record<string, TitleFacts>>({});
  const [hasLoaded, setHasLoaded] = useState(false);
  const [goal, setGoal] = useState<YearlyGoal | null>(null);

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

  // Hydrated after mount: the goal lives in storage the server render cannot see.
  useEffect(() => {
    setGoal(getGoal());
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (refs.length === 0) {
      setHasLoaded(true);
      return;
    }

    let isCurrent = true;

    (async () => {
      try {
        const resolved = await getWatchStatsFacts(refs);
        if (isCurrent) setFacts(resolved);
      } catch (error) {
        console.error("Error loading stats:", error);
      } finally {
        if (isCurrent) setHasLoaded(true);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [refs, isLoading]);

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

  if (isLoading || !hasLoaded) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (stats.totalTitles === 0 && stats.episodes === 0) return <NothingYet />;

  return (
    <div className="space-y-12">
      <Headline stats={stats} />
      <GoalPanel
        goal={goal}
        onChange={(next) => {
          setGoal(next);
          saveGoal(next);
        }}
        watchedThisYear={
          stats.byYear[new Date().getUTCFullYear().toString()] ?? 0
        }
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
              ? `${stats.titlesWithoutRuntime} title${
                  stats.titlesWithoutRuntime === 1 ? "" : "s"
                } had no runtime on TMDb, so the real figure is higher`
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
  onChange,
  watchedThisYear,
}: {
  goal: YearlyGoal | null;
  onChange: (goal: YearlyGoal | null) => void;
  watchedThisYear: number;
}) {
  const [draft, setDraft] = useState("52");
  const year = new Date().getUTCFullYear().toString();

  // A goal set last year is history: it is shown as finished rather than as a
  // bar nobody can move any more.
  const isCurrentYear = goal?.year === year;

  if (!goal || !isCurrentYear) {
    return (
      <section
        aria-labelledby="goal-heading"
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
            const target = Number(draft);
            if (!Number.isInteger(target) || target < MIN_GOAL || target > MAX_GOAL) {
              toast.showToast(
                `Pick a number between ${MIN_GOAL} and ${MAX_GOAL}`,
                "error",
              );
              return;
            }
            onChange({ year, target });
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
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-white focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors"
          >
            Set goal
          </button>
        </form>
      </section>
    );
  }

  const now = new Date();
  const progress = goalProgress(goal, watchedThisYear, {
    dayOfYear: dayOfYear(now),
    daysInYear: daysInYear(now.getUTCFullYear()),
  });

  const ahead =
    progress.expectedByNow !== null && progress.watched >= progress.expectedByNow;

  return (
    <section
      aria-labelledby="goal-heading"
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
          onClick={() => onChange(null)}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          Clear
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
            <ul className="flex items-end gap-2 h-32">
              {stats.decades.map((decade) => (
                <li
                  key={decade.name}
                  className="flex-1 flex flex-col items-center gap-1.5"
                  title={`${decade.name}: ${decade.count}`}
                >
                  <span
                    className="w-full rounded-t bg-purple-500/70"
                    style={{
                      height: `${Math.max(4, (decade.count / maxDecade) * 100)}%`,
                    }}
                  />
                  <span className="text-[11px] text-gray-500">
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
          <ul className="flex items-end gap-1.5 h-24">
            {stats.ratingHistogram.map((count, index) => (
              <li
                key={index}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${index + 1}/10: ${count}`}
              >
                <span
                  className="w-full rounded-t bg-yellow-500/70"
                  style={{
                    height: `${Math.max(3, (count / maxRating) * 100)}%`,
                  }}
                />
                <span className="text-[11px] text-gray-500">{index + 1}</span>
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
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => summarizeYear(input, year), [input, year]);

  async function share() {
    const url =
      typeof window === "undefined"
        ? "https://www.watch-list.me"
        : window.location.origin;
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
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
