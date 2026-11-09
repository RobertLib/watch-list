"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  Dices,
  Film,
  Sparkles,
  Star,
  Tv,
} from "lucide-react";
import { getTonightShortlist } from "@/lib/api";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { WatchedButton } from "@/components/WatchedButton";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useSettingsKey } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import { todayLocal } from "@/lib/dates";
import {
  availableGenres,
  DEFAULT_FILTERS,
  filterCandidates,
  formatRuntime,
  knownReleaseDate,
  pickOne,
  reasonFor,
  RUNTIME_BANDS,
  type TonightCandidate,
  type TonightFilters,
} from "@/lib/tonight";
import { TonightCandidatesLoadError } from "@/lib/tonight-data";
import type { AvailabilityRef } from "@/lib/watchlist-availability";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn, mediaItemKey } from "@/lib/utils";
import type { MediaItem } from "@/types/tmdb";
import { mediaHref } from "@/lib/routes";

/**
 * One title, chosen for the evening in front of you.
 *
 * The watchlist is a list of intentions; this is the thing that turns one of them
 * into tonight. Two constraints do most of the work – how long you have and what
 * you can actually play – and the rest is refusing to show a grid, because a grid
 * is what the person was already stuck in.
 */
export function TonightPicker() {
  const { watchlist, isLoading: isWatchlistLoading } = useWatchlist();
  const settingsKey = useSettingsKey();
  const day = useLocalDay();

  const [candidates, setCandidates] = useState<TonightCandidate[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadedSettingsKey, setLoadedSettingsKey] = useState<string | null>(null);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  // Kept apart from an empty shortlist. A failed request used to land on
  // "Nothing matches" with a button that resets the filters – an answer to a
  // question nobody asked, since the filters were never the problem.
  const [failed, setFailed] = useState(false);
  const [failedRefs, setFailedRefs] = useState<AvailabilityRef[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<TonightFilters>(DEFAULT_FILTERS);
  const [pick, setPick] = useState<TonightCandidate | null>(null);
  // Bumped by the spin button. Re-picking is a derivation of this plus the
  // filters, which keeps "spin" and "change a filter" on one code path.
  const [spin, setSpin] = useState(0);

  const refs = useMemo(
    () =>
      watchlist.map((item) => ({ id: item.id, mediaType: item.mediaType })),
    [watchlist],
  );
  const [loadedRefs, setLoadedRefs] = useState<typeof refs | null>(null);

  useEffect(() => {
    if (isWatchlistLoading || !day) return;

    // Nothing saved, so there is no shortlist to build. The spinner below keys
    // off the same emptiness, so the empty state renders without a load
    // settling.
    if (refs.length === 0) return;

    let isCurrent = true;
    const controller = new AbortController();
    const isCurrentDay = () => isCurrent && day === todayLocal();

    (async () => {
      try {
        const shortlist = await getTonightShortlist(refs, controller.signal);
        if (isCurrentDay()) {
          setCandidates(shortlist);
          setFailed(false);
          setFailedRefs([]);
        }
      } catch (error) {
        if (!isCurrentDay() || controller.signal.aborted) return;
        console.error("Error loading the tonight shortlist:", error);
        if (error instanceof TonightCandidatesLoadError) {
          setCandidates(error.candidates);
          setFailedRefs(error.failedRefs);
          setFailed(false);
        } else {
          setCandidates([]);
          setFailedRefs([]);
          setFailed(true);
        }
      } finally {
        if (isCurrentDay()) {
          setLoadedRefs(refs);
          setLoadedSettingsKey(settingsKey);
          setLoadedDay(day);
          setHasLoaded(true);
        }
      }
    })();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [refs, isWatchlistLoading, attempt, settingsKey, day]);

  // A saved title's facts do not depend on the rest of the list. While the
  // shortlist refreshes after an edit, the titles still saved keep what was
  // already resolved for them and a removed one leaves at once – rather than
  // the page blanking to a spinner because one title came off the list.
  const savedKeys = useMemo(
    () => new Set(refs.map((ref) => mediaItemKey(ref.id, ref.mediaType))),
    [refs],
  );
  const lookedUpKeys = useMemo(
    () => new Set((loadedRefs ?? []).map((ref) => mediaItemKey(ref.id, ref.mediaType))),
    [loadedRefs],
  );
  const isCurrentLookup = loadedRefs === refs;
  const savedCandidates = useMemo(
    () => isCurrentLookup ? candidates : candidates.filter((candidate) =>
      savedKeys.has(mediaItemKey(candidate.id, candidate.mediaType))),
    [isCurrentLookup, candidates, savedKeys],
  );
  const savedFailedRefs = useMemo(
    () => isCurrentLookup ? failedRefs : failedRefs.filter((ref) =>
      savedKeys.has(mediaItemKey(ref.id, ref.mediaType))),
    [isCurrentLookup, failedRefs, savedKeys],
  );
  // Newly saved titles have nothing resolved yet; until they do, an empty
  // pool proves nothing.
  const awaitingCount = isCurrentLookup
    ? 0
    : refs.filter((ref) => !lookedUpKeys.has(mediaItemKey(ref.id, ref.mediaType))).length;

  const matching = useMemo(
    () => filterCandidates(savedCandidates, filters),
    [savedCandidates, filters],
  );

  // Unknown availability is a failed lookup, not evidence that a title is
  // unavailable. Keep verified picks usable, but offer a retry for titles that
  // otherwise fit rather than blaming the visitor's filters.
  const uncheckedCount = filters.readyOnly
    ? filterCandidates(savedCandidates, { ...filters, readyOnly: false })
        .filter((candidate) => candidate.availability === "unknown").length
    : 0;
  // An unresolved title's media type is known, but its runtime and genres are
  // not. It can still fit every other filter, so it cannot prove an empty pool.
  const unresolvedMatchingCount = savedFailedRefs.filter((ref) =>
    filters.type === "all" || ref.mediaType === filters.type,
  ).length;

  const retryLoad = () => {
    setHasLoaded(false);
    setAttempt((n) => n + 1);
  };

  const genres = useMemo(() => {
    const available = availableGenres(savedCandidates);
    // Keep the selected genre visible when its titles fail during a retry.
    if (filters.genre && !available.includes(filters.genre)) available.push(filters.genre);
    return available.sort((a, b) => a.localeCompare(b));
  }, [savedCandidates, filters.genre]);

  // The pick the visitor marked watched from its own card. Marking it takes it
  // off the watchlist, which used to blank the page and draw a different title
  // at random; it stays on screen instead, showing its new state, until the
  // visitor asks for something else. Held for the settings and day it was
  // looked up under, which are what its availability and eligibility describe.
  const [held, setHeld] = useState<{ key: string; settingsKey: string; day: string } | null>(null);
  const heldKey = held && held.settingsKey === settingsKey && held.day === day
    ? held.key
    : null;

  // Drawn when the visitor spins or changes a filter, and only then. The pick is
  // random, so drawing it on every render would give a different answer each
  // time, including on renders nobody asked for. A refreshed pool – a list
  // edit, a retry – keeps the title on screen while it still fits, updated to
  // its fresh details, and draws only when it no longer does.
  const [pickedFor, setPickedFor] = useState<{
    matching: typeof matching;
    filters: TonightFilters;
    spin: number;
  } | null>(null);

  if (
    pickedFor?.matching !== matching ||
    pickedFor.filters !== filters ||
    pickedFor.spin !== spin
  ) {
    const redraw = !pickedFor || pickedFor.filters !== filters || pickedFor.spin !== spin;
    setPickedFor({ matching, filters, spin });
    if (redraw && held) setHeld(null);
    setPick((current) => {
      const currentKey = current ? mediaItemKey(current.id, current.mediaType) : null;
      if (!redraw && currentKey) {
        const refreshed = matching.find((candidate) =>
          mediaItemKey(candidate.id, candidate.mediaType) === currentKey);
        if (refreshed) return refreshed;
        if (currentKey === heldKey) return current;
      }

      // Never the title already on screen – "something else" that returns the
      // same film reads as a broken button. `pickOne` allows the repeat back
      // when it is the only thing that fits.
      return pickOne(matching, currentKey, Math.random);
    });
  }

  const shownPick = pick && (
    matching.includes(pick) ||
    mediaItemKey(pick.id, pick.mediaType) === heldKey
  ) ? pick : null;

  // A pick belongs to the settings and day used for its lookup: the region and
  // platforms decide its availability, and the day its eligibility. Hide it
  // immediately when either changes, including updates from another tab – and
  // while newly saved titles are looked up with nothing yet to show beside them.
  if (
    isWatchlistLoading ||
    (refs.length > 0 && (
      !hasLoaded ||
      loadedSettingsKey !== settingsKey ||
      loadedDay !== day ||
      (awaitingCount > 0 && savedCandidates.length === 0 &&
        savedFailedRefs.length === 0 && !shownPick)
    ))
  ) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (watchlist.length === 0 && !shownPick) return <NothingSaved />;

  if (failed) {
    return (
      <LoadFailureNotice
        title="Could not pick anything tonight"
        description="TMDB did not answer, so there was nothing to choose between. Your watchlist is untouched – it is saved in this browser, not there."
        onRetry={retryLoad}
        // The page around this already has its "Tonight" h1.
        headingLevel={2}
      />
    );
  }

  return (
    <div className="space-y-8">
      <Filters
        filters={filters}
        onChange={setFilters}
        genres={genres}
        matching={matching.length}
        total={refs.length}
        unchecked={uncheckedCount}
        unresolved={savedFailedRefs.length}
      />

      {awaitingCount > 0 && (
        <p className="text-sm text-gray-400" role="status">
          Checking {awaitingCount} newly saved {awaitingCount === 1 ? "title" : "titles"}…
        </p>
      )}

      {shownPick && (
        <PickCard
          pick={shownPick}
          savedReleaseDate={watchlist.find((item) =>
            item.id === shownPick.id && item.mediaType === shownPick.mediaType,
          )?.releaseDate ?? ""}
          filters={filters}
          onSpin={() => setSpin(spin + 1)}
          onMarkWatched={() => setHeld({
            key: mediaItemKey(shownPick.id, shownPick.mediaType),
            settingsKey,
            day,
          })}
        />
      )}

      {(savedFailedRefs.length > 0 || uncheckedCount > 0) && (
        <LoadFailureNotice
          title={savedFailedRefs.length > 0
            ? "Some title details could not be loaded"
            : "Could not check streaming availability"}
          description={savedFailedRefs.length > 0
            ? `Details could not be loaded for ${savedFailedRefs.length} saved ${savedFailedRefs.length === 1 ? "title" : "titles"}. Verified picks remain available.${uncheckedCount > 0 ? ` Streaming availability also could not be checked for ${uncheckedCount} ${uncheckedCount === 1 ? "title" : "titles"} that otherwise fit your filters.` : ""} Try again to check the remaining titles.`
            : `Availability could not be checked for ${uncheckedCount} saved ${uncheckedCount === 1 ? "title" : "titles"} that otherwise fit your filters. Try again to see what you can play now.`}
          onRetry={retryLoad}
          compact
        />
      )}

      {!shownPick && awaitingCount === 0 && uncheckedCount === 0 && unresolvedMatchingCount === 0 && (
        <NothingMatches onReset={() => setFilters(DEFAULT_FILTERS)} />
      )}
    </div>
  );
}

function Filters({
  filters,
  onChange,
  genres,
  matching,
  total,
  unchecked,
  unresolved,
}: {
  filters: TonightFilters;
  onChange: (filters: TonightFilters) => void;
  genres: string[];
  matching: number;
  total: number;
  unchecked: number;
  unresolved: number;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-300">How long have you got?</p>
        <div className="flex flex-wrap gap-2">
          {RUNTIME_BANDS.map((band) => (
            <Chip
              key={band.id}
              active={filters.runtime === band.id}
              onClick={() => onChange({ ...filters, runtime: band.id })}
            >
              {band.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">What kind</p>
          <div className="flex flex-wrap gap-2">
            {(["all", "movie", "tv"] as const).map((type) => (
              <Chip
                key={type}
                active={filters.type === type}
                onClick={() => onChange({ ...filters, type })}
              >
                {type === "all" ? "Either" : type === "movie" ? "Film" : "Series"}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">Availability</p>
          <Chip
            active={filters.readyOnly}
            onClick={() => onChange({ ...filters, readyOnly: !filters.readyOnly })}
          >
            Only what I can play now
          </Chip>
        </div>
      </div>

      {genres.length > 0 && (
        <div className="space-y-2">
          <label
            htmlFor="tonight-genre"
            className="block text-sm font-medium text-gray-300"
          >
            In the mood for
          </label>
          <select
            id="tonight-genre"
            value={filters.genre ?? ""}
            onChange={(event) =>
              onChange({ ...filters, genre: event.target.value || null })
            }
            className="px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Anything</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {matching} of {total} saved titles {unchecked > 0 || unresolved > 0 ? "are confirmed to fit" : "fit"}.
        {unresolved > 0 && ` ${unresolved} still ${unresolved === 1 ? "needs" : "need"} title details.`}
        {unchecked > 0 && ` ${unchecked} still ${unchecked === 1 ? "needs" : "need"} an availability check.`}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        active
          ? "bg-blue-600 text-white"
          : "bg-white/5 text-gray-300 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function PickCard({
  pick,
  savedReleaseDate,
  filters,
  onSpin,
  onMarkWatched,
}: {
  pick: TonightCandidate;
  savedReleaseDate: string;
  filters: TonightFilters;
  onSpin: () => void;
  /** Called as the card's own watched control is used, before it saves. */
  onMarkWatched: () => void;
}) {
  const artwork = pick.backdropPath ?? pick.posterPath;
  const runtime = formatRuntime(pick.runtime);

  // `WatchedButton` speaks the card language the rest of the app uses, so the
  // pick is converted rather than the button being reimplemented here.
  const asMediaItem = {
    id: pick.id,
    title: pick.title,
    media_type: pick.mediaType,
    poster_path: pick.posterPath,
    backdrop_path: pick.backdropPath,
    overview: pick.overview ?? "",
    // An incomplete catalogue reply must not discard the queue's known date.
    release_date: knownReleaseDate(pick.releaseDate) ?? knownReleaseDate(savedReleaseDate) ?? "",
    vote_average: pick.voteAverage,
  } as MediaItem;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900">
      <div className="relative aspect-video bg-gray-800">
        {artwork && (
          <Image
            src={getImageUrl(artwork, "w780")}
            alt={pick.title}
            fill
            preload
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="flex items-center gap-2 text-sm text-blue-300 mb-1">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            {reasonFor(pick, filters)}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            <Link
              href={mediaHref(pick.mediaType, pick.slug)}
              prefetch={false}
              className="hover:text-blue-300 transition-colors"
            >
              {pick.title}
            </Link>
          </h2>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            {pick.mediaType === "movie" ? (
              <Film className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Tv className="w-4 h-4" aria-hidden="true" />
            )}
            {pick.mediaType === "movie" ? "Film" : "Series"}
          </span>
          {pick.year && <span>{pick.year}</span>}
          {runtime && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" aria-hidden="true" />
              {runtime}
              {pick.mediaType === "tv" && " per episode"}
            </span>
          )}
          {pick.voteAverage > 0 && (
            <span className="flex items-center gap-1.5">
              <Star
                className="w-4 h-4 text-yellow-400"
                fill="currentColor"
                aria-hidden="true"
              />
              {pick.voteAverage.toFixed(1)}
            </span>
          )}
        </div>

        {pick.providers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {pick.providers.slice(0, 4).map((provider) => (
              <span
                key={provider.id}
                className="inline-flex items-center gap-1.5 text-xs text-gray-300 bg-white/5 rounded-full pl-1 pr-3 py-1"
              >
                {provider.logoPath ? (
                  <Image
                    src={getImageUrl(provider.logoPath, "w185")}
                    alt=""
                    width={20}
                    height={20}
                    className="rounded"
                  />
                ) : null}
                {provider.name}
              </span>
            ))}
          </div>
        )}

        {pick.overview && (
          <p className="text-sm text-gray-400 leading-relaxed line-clamp-3">
            {pick.overview}
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={onSpin}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Dices className="w-4 h-4" aria-hidden="true" />
            Something else
          </button>
          <Link
            href={mediaHref(pick.mediaType, pick.slug)}
            prefetch={false}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-white transition-colors"
          >
            Details
          </Link>
          {/* Capture rather than bubble: the button stops its click from
              propagating. `contents` keeps the wrapper out of the layout. */}
          <span className="contents" onClickCapture={onMarkWatched}>
            <WatchedButton item={asMediaItem} />
          </span>
        </div>
      </div>
    </div>
  );
}

function NothingMatches({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center space-y-4">
      <p className="text-gray-300 font-medium">
        Nothing on your list fits that.
      </p>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Loosen a filter – &ldquo;only what I can play now&rdquo; is usually the
        one doing it, and it depends on the platforms named in your profile.
      </p>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-white transition-colors"
      >
        Clear the filters
      </button>
    </div>
  );
}

function NothingSaved() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <Dices className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">Nothing to pick from yet</h2>
      <p className="text-gray-400 max-w-md mx-auto">
        Save a few films and series, and this page will pick one for whatever
        evening you have – by length, by platform, by mood.
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
