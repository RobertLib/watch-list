"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { MediaCard } from "@/components/MediaCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Trash2, Star, Heart, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaItem, MediaType } from "@/types/tmdb";

type Tab = "to-watch" | "watched";

/** A title on either list, reduced to what a card needs. */
interface ListItem {
  id: number;
  title: string;
  mediaType: MediaType;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string;
}

// The open tab lives in the URL fragment, which makes it linkable from
// elsewhere in the app and keeps the page statically rendered – unlike a search
// param, a fragment never reaches the server.
const WATCHED_FRAGMENT = "watched";

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

  const isLoading = isWatchlistLoading || isWatchedLoading;

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

  // Newest first – the most recent viewing is the one worth seeing at the top.
  // The watchlist cookie is already stored that way.
  const watchedItems = [...watched].sort(
    (a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime(),
  );
  const items: ListItem[] = tab === "watched" ? watchedItems : watchlist;
  const movies = items.filter((item) => item.mediaType === "movie");
  const tvShows = items.filter((item) => item.mediaType === "tv");

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

  const toMediaItem = (item: ListItem): MediaItem => ({
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

  const renderGrid = (gridItems: ListItem[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {gridItems.map((item) => (
        <div
          key={`${item.id}-${item.mediaType}`}
          className="relative group aspect-2/3"
        >
          <MediaCard
            item={toMediaItem(item)}
            size="medium"
            showOverlay={true}
            forceShowOverlay={false}
            className="w-full h-full"
          />
        </div>
      ))}
    </div>
  );

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

        {items.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
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
        {items.length === 0 ? (
          <EmptyTab tab={tab} />
        ) : (
          <>
            {movies.length > 0 && (
              <section className="mb-12">
                <h2 className="text-xl font-semibold mb-4">
                  Movies{" "}
                  <span className="text-gray-400 font-normal text-base">
                    ({movies.length})
                  </span>
                </h2>
                {renderGrid(movies)}
              </section>
            )}

            {tvShows.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">
                  TV Shows{" "}
                  <span className="text-gray-400 font-normal text-base">
                    ({tvShows.length})
                  </span>
                </h2>
                {renderGrid(tvShows)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
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
