"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "@/i18n/Link";
import { BarChart3, Check, Download, Share2, Target, Trophy } from "lucide-react";
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
import { buildYearCard, yearCardFilename } from "@/lib/year-card";
import { deliverYearCard, renderYearCard } from "@/lib/year-card-image";
import {
  buildStatsShareText,
  formatDecade,
  formatScore,
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
import { useLocale, useT } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/locale";
import { formatCount, formatNumber, pluralForm, type PluralForms } from "@/i18n/format";

/** A count on its own: Czech groups thousands ("1 204"); English prints it bare, as it always has. */
function plainCount(value: number, locale: Locale): string {
  return locale === "cs" ? formatNumber(value, locale) : value.toString();
}

const TITLES_GENITIVE: PluralForms = {
  en: ["title", "titles"],
  cs: ["titulu", "titulů", "titulů"],
};

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
  const locale = useLocale();
  const t = useT();
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
          title={t("Some statistics could not be updated", "Některé statistiky se nepodařilo aktualizovat")}
          description={
            locale === "cs"
              ? `Podrobnosti se nepodařilo načíst u ${formatCount(failedCount, locale, TITLES_GENITIVE)}. Níže jsou uložené počty a dostupné podrobnosti; čas sledování, žánry a desetiletí nemusí být úplné.`
              : `Details for ${failedCount} title${failedCount === 1 ? "" : "s"} could not be loaded. Your saved counts and available details are shown below; watch time, genres and decades may be incomplete.`
          }
          onRetry={retryFacts}
        />
      )}
      {isFetching && (
        <p className="text-sm text-gray-400" role="status">
          {t("Updating title details…", "Aktualizujeme podrobnosti o titulech…")}
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
                  ? t(
                      "Could not clear your goal. Please try again.",
                      "Cíl se nepodařilo zrušit. Zkuste to prosím znovu.",
                    )
                  : t(
                      "Could not save your goal. Please try again.",
                      "Cíl se nepodařilo uložit. Zkuste to prosím znovu.",
                    ),
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
  const locale = useLocale();
  const t = useT();
  return (
    <section aria-labelledby="totals-heading">
      <h2 id="totals-heading" className="sr-only">
        {t("Totals", "Souhrn")}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t("Films", "Filmy")} value={plainCount(stats.films, locale)} />
        <Stat label={t("Series", "Seriály")} value={plainCount(stats.series, locale)} />
        <Stat label={t("Episodes", "Epizody")} value={plainCount(stats.episodes, locale)} />
        <Stat
          label={t("Watch time", "Čas sledování")}
          value={formatWatchTime(stats.minutes, locale)}
          hint={
            stats.titlesWithoutRuntime > 0
              ? locale === "cs"
                ? `Čas sledování nezahrnuje ${formatCount(stats.titlesWithoutRuntime, locale, {
                    en: ["title", "titles"],
                    cs: ["titul", "tituly", "titulů"],
                  })} s neznámou délkou`
                : `Watch time excludes ${stats.titlesWithoutRuntime} title${
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
  const locale = useLocale();
  const t = useT();
  const [draft, setDraft] = useState("52");
  const year = today.slice(0, 4);

  // A goal set last year is history: rather than a bar nobody can move any
  // more, the panel offers to set this year's target, as it does with no goal.
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
          {locale === "cs" ? <>Stanovte si cíl na rok {year}</> : <>Set a target for {year}</>}
        </h2>
        <p className="text-sm text-gray-400 mt-1 mb-4">
          {locale === "cs" ? (
            <>
              Číslo, podle kterého poznáte, jestli jste napřed, nebo pozadu.
              Letos jste zatím dokončili{" "}
              {formatCount(watchedThisYear, locale, {
                en: ["title", "titles"],
                cs: ["titul", "tituly", "titulů"],
              })}
              .
            </>
          ) : (
            <>
              A number to be ahead or behind. You have finished {watchedThisYear} so
              far this year.
            </>
          )}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (isSaving) return;
            const target = Number(draft);
            if (!Number.isInteger(target) || target < MIN_GOAL || target > MAX_GOAL) {
              toast.showToast(
                t(
                  `Pick a number between ${MIN_GOAL} and ${MAX_GOAL}`,
                  `Zadejte číslo od ${MIN_GOAL} do ${MAX_GOAL}`,
                ),
                "error",
              );
              return;
            }
            void onChange({ year, target });
          }}
          className="flex gap-2"
        >
          <label htmlFor="goal-target" className="sr-only">
            {locale === "cs" ? (
              <>Počet titulů ke zhlédnutí v roce {year}</>
            ) : (
              <>Titles to watch in {year}</>
            )}
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
            {isSaving ? t("Saving…", "Ukládáme…") : t("Set goal", "Nastavit cíl")}
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
          {locale === "cs" ? <>Cíl na rok {goal.year}</> : <>{goal.year} goal</>}
        </h2>
        <button
          onClick={() => { void onChange(null); }}
          disabled={isSaving}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          {isSaving ? t("Clearing…", "Rušíme…") : t("Clear", "Zrušit")}
        </button>
      </div>

      <p className="text-2xl font-bold text-white">
        {plainCount(progress.watched, locale)}{" "}
        <span className="text-gray-500 text-lg font-normal">
          {locale === "cs" ? (
            <>z {formatNumber(progress.target, locale)}</>
          ) : (
            <>of {progress.target}</>
          )}
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
        {locale === "cs"
          ? czechGoalLine(progress.remaining, progress.expectedByNow, ahead)
          : progress.remaining === 0
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

/** The goal's progress line in Czech, where "zbývá" agrees with the count. */
function czechGoalLine(
  remaining: number,
  expectedByNow: number | null,
  ahead: boolean,
): string {
  if (remaining === 0) return "Splněno – a do konce roku ještě zbývá čas.";

  const left = `${pluralForm(remaining, "cs", {
    en: ["", ""],
    cs: ["Zbývá", "Zbývají", "Zbývá"],
  })} ${formatNumber(remaining, "cs")}`;

  if (expectedByNow === null) return `${left}.`;
  if (ahead) return `${left} a jste před plánem.`;
  return `${left} – podle plánu byste teď měli mít ${formatNumber(expectedByNow, "cs")}.`;
}

function Breakdown({ stats }: { stats: WatchStats }) {
  const locale = useLocale();
  const t = useT();
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
        {t("What you watch", "Co sledujete")}
      </h2>

      <div className="grid lg:grid-cols-2 gap-8">
        {stats.topGenres.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">
              {t("Genres", "Žánry")}
            </h3>
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
              {t("Decades you reach for", "Desetiletí, ze kterých vybíráte")}
            </h3>
            <ul
              className="flex items-end gap-2 h-32"
              aria-label={t("Watch history by decade", "Zhlédnuté tituly podle desetiletí")}
            >
              {stats.decades.map((decade) => (
                <li
                  key={decade.name}
                  className="h-full flex-1 flex flex-col items-center gap-1.5"
                  title={`${formatDecade(decade.name, locale)}: ${decade.count}`}
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
              {t("Your scores", "Vaše hodnocení")}{" "}
              <span className="text-gray-500 font-normal">
                {locale === "cs" ? (
                  // Count first: "průměr 7,4, celkem 31" would put a decimal
                  // comma and a list comma side by side.
                  <>
                    ({formatNumber(stats.ratedCount, locale)} hodnocení, průměr{" "}
                    {stats.averageRating === null
                      ? null
                      : formatScore(stats.averageRating, locale)}
                    )
                  </>
                ) : (
                  <>
                    (average {stats.averageRating?.toFixed(1)} over{" "}
                    {stats.ratedCount})
                  </>
                )}
              </span>
            </h3>
            {/* A histogram says how you rate; this is where you see what. */}
            <Link
              href="/ratings"
              prefetch={false}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t("See everything you rated", "Zobrazit vše, co jste ohodnotili")}
            </Link>
          </div>
          <ul
            className="flex items-end gap-1.5 h-24"
            aria-label={t("Rating distribution", "Rozložení hodnocení")}
          >
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
  const locale = useLocale();
  const t = useT();
  const achievements = achievementsFor(stats, locale);
  const earned = achievements.filter((achievement) => achievement.earned).length;

  return (
    <section aria-labelledby="achievements-heading">
      <h2
        id="achievements-heading"
        className="text-xl font-semibold text-white flex items-center gap-2 mb-4"
      >
        <Trophy className="w-5 h-5 text-yellow-400" aria-hidden="true" />
        {t("Achievements", "Úspěchy")}{" "}
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
  const locale = useLocale();
  const t = useT();
  const [year, setYear] = useState(years[0]);
  const [copied, markCopied] = useTransientFlag(2500);
  const [isDrawing, setIsDrawing] = useState(false);

  // Removing a year's last title or switching profiles can remove its option.
  // Reset before committing the render so the picker, summary and shared text
  // all describe the same available year.
  if (!years.includes(year)) setYear(years[0]);

  const stats = useMemo(() => summarizeYear(input, year), [input, year]);
  // Follows "My WatchList" / "Můj WatchList:" in the shared text.
  const shareLabel = t(`${year} in review`, `rok ${year} v kostce`);

  async function share() {
    const url =
      typeof window === "undefined" ? SITE_URL : window.location.origin;
    const text = buildStatsShareText(stats, shareLabel, url, locale);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // A dismissed sheet is a decision, not a failure: falling through used
        // to answer a cancel with a copy – or, where the sheet's own gesture
        // was spent, with a "Could not copy" error. A refused or unsupported
        // share still falls through to the clipboard.
        if (
          error !== null && typeof error === "object" &&
          "name" in error && error.name === "AbortError"
        ) return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      toast.showToast(t("Could not copy your year", "Váš rok se nepodařilo zkopírovat"), "error");
    }
  }

  /**
   * The year as a picture, for the places a link does no good: a feed shows an
   * image, and the link a text share carries previews as the site's one card
   * for everybody. Drawn here, in the browser (`year-card.ts`), and handed to
   * the share sheet where that takes files or saved as a file where it does not.
   */
  async function saveImage() {
    if (isDrawing) return;
    setIsDrawing(true);
    try {
      const location = typeof window === "undefined" ? new URL(SITE_URL) : window.location;
      // The address as people say it: "watch-list.me", not "www.watch-list.me".
      const site = location.host.replace(/^www\./, "");
      const blob = await renderYearCard(buildYearCard(stats, year, site, locale));
      const delivery = await deliverYearCard(
        blob,
        yearCardFilename(year, locale),
        buildStatsShareText(stats, shareLabel, location.origin, locale),
      );
      if (delivery === "saved") {
        toast.showToast(
          t("Saved your year as an image", "Váš rok je uložený jako obrázek"),
          "success",
        );
      }
    } catch (error) {
      console.error("Error drawing the year in review:", error);
      toast.showToast(t("Could not create the image", "Obrázek se nepodařilo vytvořit"), "error");
    } finally {
      setIsDrawing(false);
    }
  }

  return (
    <section
      aria-labelledby="year-heading"
      className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="year-heading" className="text-xl font-semibold text-white">
          {locale === "cs" ? <>Rok {year} v kostce</> : <>{year} in review</>}
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="review-year" className="sr-only">
            {t("Year", "Rok")}
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
            {copied ? t("Copied", "Zkopírováno") : t("Share", "Sdílet")}
          </button>
          <button
            onClick={saveImage}
            // Not native `disabled`: that would blur the button just pressed.
            aria-disabled={isDrawing}
            aria-busy={isDrawing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 aria-disabled:opacity-60 aria-disabled:cursor-wait text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {isDrawing ? t("Drawing…", "Kreslíme…") : t("Save image", "Uložit obrázek")}
          </button>
        </div>
      </div>

      {locale === "cs" ? (
        <p className="text-gray-300 leading-relaxed">
          V roce {year} jste dokončili{" "}
          <span className="text-white font-semibold">
            {formatCount(stats.totalTitles, locale, {
              en: ["title", "titles"],
              cs: ["titul", "tituly", "titulů"],
            })}
          </span>
          {stats.minutes > 0 && <> – zhruba {formatWatchTime(stats.minutes, locale)}</>}
          {stats.topGenres[0] && (
            <>
              , nejčastěji{" "}
              <span className="text-white">
                {stats.topGenres[0].name.toLocaleLowerCase("cs-CZ")}
              </span>
            </>
          )}
          .
          {stats.averageRating !== null && (
            <> Průměrně jste jim dali {formatScore(stats.averageRating, locale)}.</>
          )}
        </p>
      ) : (
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
      )}
      {/* A finished series' episodes are counted all-time, but a tick carries
          no date, so the year cannot claim them – and must not pass their
          absence off as no time at all. */}
      {stats.seriesWithUndatedTime > 0 && (locale === "cs" ? (
        <p className="text-sm text-gray-500">
          {stats.minutes > 0 ? "Nepočítá se sem čas" : "Čas sledování se nezobrazuje"} u{" "}
          {formatCount(stats.seriesWithUndatedTime, locale, {
            en: ["series", "series"],
            cs: ["dokončeného seriálu", "dokončených seriálů", "dokončených seriálů"],
          })}
          : odškrtnuté epizody nemají datum, takže je nelze přiřadit k roku.
          Celkový čas sledování výše je zahrnuje.
        </p>
      ) : (
        <p className="text-sm text-gray-500">
          {stats.minutes > 0 ? "That leaves out the time" : "No watch time is shown"} for{" "}
          {stats.seriesWithUndatedTime} series you finished: ticked episodes are
          not dated, so they cannot be placed in a year. The all-time watch time
          above includes them.
        </p>
      ))}
    </section>
  );
}

function NothingYet() {
  const t = useT();
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <BarChart3 className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">
        {t("Nothing to count yet", "Zatím není co počítat")}
      </h2>
      <p className="text-gray-400 max-w-md mx-auto">
        {t(
          "Mark something watched, or tick an episode, and this page starts keeping score – hours, genres, decades, and how you rate what you finish.",
          "Označte něco jako zhlédnuté nebo odškrtněte epizodu a tahle stránka začne počítat – hodiny, žánry, desetiletí i to, jak hodnotíte, co dokončíte.",
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
