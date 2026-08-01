"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { MediaCard } from "@/components/MediaCard";
import { MediaListRow } from "@/components/MediaListRow";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ShareListButton } from "@/components/ShareListButton";
import { WatchlistControls } from "@/components/WatchlistControls";
import { useViewMode } from "@/hooks/useViewMode";
import { useRatings } from "@/hooks/useRatings";
import { getWatchlistAvailabilityFor } from "@/app/actions";
import { Trash2, Star, Heart, Eye, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/tmdb-image";
import {
  filterWatchlistItems,
  getDefaultPreferences,
  getPreferences,
  groupByAvailability,
  itemKey,
  savePreferences,
  sortWatchlistItems,
  subscribeToPreferences,
  type WatchlistViewItem,
} from "@/lib/watchlist-view";
import type { WatchlistAvailability } from "@/lib/watchlist-availability";
import type { MediaItem } from "@/types/tmdb";

type Tab = "to-watch" | "watched";

// The open tab lives in the URL fragment, which makes it linkable from
// elsewhere in the app and keeps the page statically rendered – unlike a search
// param, a fragment never reaches the server.
const WATCHED_FRAGMENT = "watched";

// Adding several titles in a row should cost one lookup, not one per click.
const AVAILABILITY_DELAY_MS = 300;

const NO_AVAILABILITY: WatchlistAvailability = {
  region: "",
  hasSelectedProviders: false,
  byKey: {},
  checked: 0,
};

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readTabFromFragment(): Tab {
  return window.location.hash === `#${WATCHED_FRAGMENT}`
    ? "watched"
    : "to-watch";
}

export default function WatchlistPage() {
  const {
    watchlist,
    removeItem: removeFromWatchlist,
    isLoading: isWatchlistLoading,
  } = useWatchlist();
  const {
    watched,
    clearAll: clearWatched,
    isLoading: isWatchedLoading,
  } = useWatched();

  // Server-rendered HTML never sees a fragment, so it always starts on the
  // first tab and switches once the browser takes over.
  const tab = useSyncExternalStore(
    subscribeToFragment,
    readTabFromFragment,
    () => "to-watch" as Tab,
  );
  const preferences = useSyncExternalStore(
    subscribeToPreferences,
    getPreferences,
    getDefaultPreferences,
  );
  const { viewMode } = useViewMode();
  const { ratingFor } = useRatings();

  const [query, setQuery] = useState("");
  const [availability, setAvailability] =
    useState<WatchlistAvailability>(NO_AVAILABILITY);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  const isLoading = isWatchlistLoading || isWatchedLoading;
  const wantsAvailability = preferences.grouping === "availability";

  // Both lists reduced to one shape, so everything downstream stops caring which
  // tab it came from.
  const allItems = useMemo<WatchlistViewItem[]>(
    () =>
      tab === "watched"
        ? watched.map((entry) => ({
            id: entry.id,
            title: entry.title,
            mediaType: entry.mediaType,
            posterPath: entry.posterPath,
            voteAverage: entry.voteAverage,
            releaseDate: entry.releaseDate,
            savedAt: entry.watchedAt,
            myRating: ratingFor(entry.id, entry.mediaType),
          }))
        : watchlist.map((entry) => ({
            id: entry.id,
            title: entry.title,
            mediaType: entry.mediaType,
            posterPath: entry.posterPath,
            voteAverage: entry.voteAverage,
            releaseDate: entry.releaseDate,
            savedAt: entry.addedAt,
            myRating: ratingFor(entry.id, entry.mediaType),
          })),
    [tab, watchlist, watched, ratingFor],
  );

  const counts = useMemo(
    () => ({
      all: allItems.length,
      movie: allItems.filter((item) => item.mediaType === "movie").length,
      tv: allItems.filter((item) => item.mediaType === "tv").length,
    }),
    [allItems],
  );

  const visibleItems = useMemo(
    () =>
      sortWatchlistItems(
        filterWatchlistItems(allItems, {
          type: preferences.type,
          query,
        }),
        preferences.sort,
      ),
    [allItems, preferences.type, preferences.sort, query],
  );

  // Requested only when the grouping asks for it: it is one round trip and a
  // fan-out of cached TMDB reads, so it should not happen for a list nobody is
  // looking at that way. Keyed on the whole list rather than the filtered view,
  // so typing in the search box does not re-request anything.
  const availabilityKey = useMemo(
    () =>
      allItems
        .map((item) => itemKey(item.id, item.mediaType))
        .sort()
        .join(","),
    [allItems],
  );

  useEffect(() => {
    if (!wantsAvailability || allItems.length === 0) return;

    let isCurrent = true;
    setIsCheckingAvailability(true);

    const timer = setTimeout(async () => {
      try {
        const result = await getWatchlistAvailabilityFor(
          allItems.map((item) => ({
            id: item.id,
            mediaType: item.mediaType,
          })),
        );
        if (isCurrent) setAvailability(result);
      } catch (error) {
        console.error("Error loading watchlist availability:", error);
        if (isCurrent) setAvailability(NO_AVAILABILITY);
      } finally {
        if (isCurrent) setIsCheckingAvailability(false);
      }
    }, AVAILABILITY_DELAY_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
    // `availabilityKey` stands in for the list's contents; `allItems` itself is a
    // fresh array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAvailability, availabilityKey]);

  const groups = useMemo(
    () =>
      wantsAvailability
        ? groupByAvailability(visibleItems, availability.byKey, {
            hasSelectedProviders: availability.hasSelectedProviders,
            region: availability.region,
          })
        : null,
    [wantsAvailability, visibleItems, availability],
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="sr-only">My Watchlist</h1>
        <LoadingSpinner />
      </div>
    );
  }

  // Nothing saved anywhere yet – the tabs would have nothing to switch between.
  if (watchlist.length === 0 && watched.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <Star className="w-12 h-12 text-gray-600" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Your Watchlist is Empty</h1>
            <p className="text-gray-400 text-lg max-w-md mx-auto">
              Start adding movies and TV shows you want to watch by clicking the
              heart icon on any media card, and use the eye icon to remember
              what you have already seen.
            </p>
          </div>
          <Link
            href="/"
            prefetch={false}
            className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
          >
            Discover Content
          </Link>
        </div>
      </div>
    );
  }

  // Writing the fragment is what switches the tab: it notifies the store above
  // and leaves a URL that can be linked to or reached with the Back button.
  const selectTab = (next: Tab) => {
    window.location.hash = next === "watched" ? WATCHED_FRAGMENT : "";
  };

  const handleClearAll = () => {
    if (tab === "watched") {
      if (confirm("Are you sure you want to clear your entire watched list?")) {
        clearWatched();
      }
      return;
    }

    if (confirm("Are you sure you want to clear your entire watchlist?")) {
      watchlist.forEach((item) => {
        removeFromWatchlist(item.id, item.mediaType);
      });
    }
  };

  const toMediaItem = (item: WatchlistViewItem): MediaItem => ({
    id: item.id,
    title: item.title,
    poster_path: item.posterPath,
    backdrop_path: null,
    overview: "",
    release_date: item.releaseDate,
    vote_average: item.voteAverage,
    vote_count: 0,
    genre_ids: [],
    media_type: item.mediaType,
  });

  const renderItems = (sectionItems: WatchlistViewItem[]) =>
    viewMode === "list" ? (
      <div className="flex flex-col gap-3">
        {sectionItems.map((item) => (
          <MediaListRow
            key={itemKey(item.id, item.mediaType)}
            item={toMediaItem(item)}
          />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
        {sectionItems.map((item) => (
          <div
            key={itemKey(item.id, item.mediaType)}
            className="relative group aspect-2/3"
          >
            <MediaCard
              item={toMediaItem(item)}
              size="medium"
              showOverlay={true}
              forceShowOverlay={false}
              className="w-full h-full"
            />
            {/* Added over the card rather than inside `MediaCard`: this score is
                the visitor's own and belongs to their lists, not to every grid on
                the site. */}
            {item.myRating !== null && (
              <span
                className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-yellow-400"
                title={`You rated this ${item.myRating}/10`}
              >
                <Star className="w-3 h-3 fill-current" aria-hidden="true" />
                {item.myRating}
                <span className="sr-only">out of 10, your rating</span>
              </span>
            )}
          </div>
        ))}
      </div>
    );

  const hasItemsOnTab = allItems.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Watchlist</h1>
          <p className="text-gray-400">
            {tab === "watched"
              ? `${watched.length} ${
                  watched.length === 1 ? "title" : "titles"
                } you already saw`
              : `${watchlist.length} ${
                  watchlist.length === 1 ? "item" : "items"
                } to watch`}
          </p>
        </div>

        {hasItemsOnTab && (
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/calendar"
              prefetch={false}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-semibold transition-colors shrink-0"
            >
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              Calendar
            </Link>
            <ShareListButton
              items={visibleItems.map((item) => ({
                id: item.id,
                mediaType: item.mediaType,
              }))}
              defaultTitle={
                tab === "watched" ? "What I have watched" : "My watchlist"
              }
            />
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Watchlist sections"
        className="flex items-center gap-1 border-b border-gray-800 mb-8"
      >
        <TabButton
          tab="to-watch"
          activeTab={tab}
          onSelect={selectTab}
          icon={<Heart className="w-4 h-4" aria-hidden="true" />}
          label="To Watch"
          count={watchlist.length}
          // The same red the watchlist carries in the navigation counter
          countClassName="bg-red-600"
        />
        <TabButton
          tab="watched"
          activeTab={tab}
          onSelect={selectTab}
          icon={<Eye className="w-4 h-4" aria-hidden="true" />}
          label="Watched"
          count={watched.length}
          countClassName="bg-green-600"
        />
      </div>

      <div
        role="tabpanel"
        id={`${tab}-panel`}
        aria-labelledby={`${tab}-tab`}
        tabIndex={-1}
      >
        {!hasItemsOnTab ? (
          <EmptyTab tab={tab} />
        ) : (
          <>
            <WatchlistControls
              preferences={preferences}
              onChange={savePreferences}
              query={query}
              onQueryChange={setQuery}
              counts={counts}
              isCheckingAvailability={isCheckingAvailability}
            />

            {visibleItems.length === 0 ? (
              <p className="text-gray-400 py-12 text-center">
                Nothing here matches those filters.
              </p>
            ) : groups ? (
              <div className="space-y-12">
                {groups.map((group) => (
                  <section key={group.id}>
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
                        {group.label}
                        <span className="text-gray-400 font-normal text-base">
                          ({group.items.length})
                        </span>
                        {group.id === "mine" && (
                          <ProviderLogos
                            availability={availability}
                            items={group.items}
                          />
                        )}
                      </h2>
                      {group.hint && (
                        <p className="text-sm text-gray-500 mt-1">
                          {group.hint}
                        </p>
                      )}
                    </div>
                    {renderItems(group.items)}
                  </section>
                ))}
              </div>
            ) : (
              renderItems(visibleItems)
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The platforms behind a group heading.
 *
 * Answers "on which of mine?" without opening a single title – the whole reason
 * to group this way.
 */
function ProviderLogos({
  availability,
  items,
}: {
  availability: WatchlistAvailability;
  items: WatchlistViewItem[];
}) {
  const byId = new Map<number, { name: string; logoPath: string | null }>();

  for (const item of items) {
    const entry = availability.byKey[itemKey(item.id, item.mediaType)];
    for (const provider of entry?.providers ?? []) {
      if (!byId.has(provider.id)) {
        byId.set(provider.id, {
          name: provider.name,
          logoPath: provider.logoPath,
        });
      }
    }
  }

  const logos = [...byId.entries()].filter(([, provider]) => provider.logoPath);
  if (logos.length === 0) return null;

  return (
    <span className="flex items-center gap-1.5">
      {logos.slice(0, 6).map(([id, provider]) => (
        <span
          key={id}
          className="relative w-6 h-6 rounded overflow-hidden bg-gray-800"
          title={provider.name}
        >
          <Image
            src={getImageUrl(provider.logoPath, "w185")}
            alt={provider.name}
            fill
            className="object-cover"
          />
        </span>
      ))}
    </span>
  );
}

function TabButton({
  tab,
  activeTab,
  onSelect,
  icon,
  label,
  count,
  countClassName,
}: {
  tab: Tab;
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  countClassName: string;
}) {
  const isActive = tab === activeTab;

  return (
    <button
      role="tab"
      id={`${tab}-tab`}
      aria-selected={isActive}
      aria-controls={`${tab}-panel`}
      onClick={() => onSelect(tab)}
      className={cn(
        "flex items-center gap-2 px-4 py-3 -mb-px border-b-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t-md",
        isActive
          ? "border-blue-500 text-white"
          : "border-transparent text-gray-400 hover:text-white",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs text-white",
          countClassName,
          // The active tab is already marked by its underline and brighter
          // label, so the idle badge only needs to recede.
          !isActive && "opacity-60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyTab({ tab }: { tab: Tab }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        {tab === "watched" ? (
          <Eye className="w-8 h-8 text-gray-600" />
        ) : (
          <Heart className="w-8 h-8 text-gray-600" />
        )}
      </div>
      <p className="text-gray-400 max-w-md mx-auto">
        {tab === "watched"
          ? "Nothing marked as watched yet. Use the eye icon on any poster to remember what you have seen – it leaves your watchlist and stops showing up in your recommendations."
          : "Nothing waiting to be watched. Add titles with the heart icon on any poster."}
      </p>
      {tab === "to-watch" && (
        <Link
          href="/"
          prefetch={false}
          className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Discover Content
        </Link>
      )}
    </div>
  );
}
