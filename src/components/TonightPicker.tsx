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
import { getTonightShortlist } from "@/app/actions";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { WatchedButton } from "@/components/WatchedButton";
import { useWatchlist } from "@/contexts/WatchlistContext";
import {
  availableGenres,
  DEFAULT_FILTERS,
  filterCandidates,
  formatRuntime,
  pickOne,
  reasonFor,
  RUNTIME_BANDS,
  type TonightCandidate,
  type TonightFilters,
} from "@/lib/tonight";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn, mediaItemKey } from "@/lib/utils";
import type { MediaItem } from "@/types/tmdb";

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

  const [candidates, setCandidates] = useState<TonightCandidate[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
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

  useEffect(() => {
    if (isWatchlistLoading) return;

    if (refs.length === 0) {
      setHasLoaded(true);
      return;
    }

    let isCurrent = true;

    (async () => {
      try {
        const shortlist = await getTonightShortlist(refs);
        if (isCurrent) setCandidates(shortlist);
      } catch (error) {
        console.error("Error loading the tonight shortlist:", error);
      } finally {
        if (isCurrent) setHasLoaded(true);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [refs, isWatchlistLoading]);

  const matching = useMemo(
    () => filterCandidates(candidates, filters),
    [candidates, filters],
  );

  const genres = useMemo(() => availableGenres(candidates), [candidates]);

  // Re-picked whenever the pool or the spin counter changes. Written in an effect
  // rather than during render because the pick is random: rendering it would give
  // a different answer on every re-render, including ones nobody asked for.
  useEffect(() => {
    setPick((current) =>
      pickOne(
        matching,
        // Never the title already on screen – "something else" that returns the
        // same film reads as a broken button. `pickOne` allows the repeat back
        // when it is the only thing that fits.
        current ? mediaItemKey(current.id, current.mediaType) : null,
        Math.random,
      ),
    );
    // `spin` is a dependency in spirit: it exists purely to re-run this.
  }, [matching, spin]);

  if (isWatchlistLoading || !hasLoaded) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (watchlist.length === 0) return <NothingSaved />;

  return (
    <div className="space-y-8">
      <Filters
        filters={filters}
        onChange={setFilters}
        genres={genres}
        matching={matching.length}
        total={candidates.length}
      />

      {pick ? (
        <PickCard pick={pick} filters={filters} onSpin={() => setSpin(spin + 1)} />
      ) : (
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
}: {
  filters: TonightFilters;
  onChange: (filters: TonightFilters) => void;
  genres: string[];
  matching: number;
  total: number;
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
        {matching} of {total} saved titles fit.
        {/* Said out loud because the cap is invisible otherwise, and a missing
            title looks like a bug rather than a bound. */}
        {total > 0 && " Availability and runtime are looked up for your most recent saves."}
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
  filters,
  onSpin,
}: {
  pick: TonightCandidate;
  filters: TonightFilters;
  onSpin: () => void;
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
    release_date: pick.year ? `${pick.year}-01-01` : "",
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
            priority
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
              href={`/${pick.mediaType}/${pick.slug}`}
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
            href={`/${pick.mediaType}/${pick.slug}`}
            prefetch={false}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-white transition-colors"
          >
            Details
          </Link>
          <WatchedButton item={asMediaItem} />
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
