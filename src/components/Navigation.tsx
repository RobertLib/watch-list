"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  Menu,
  X,
  User,
  Heart,
  CalendarDays,
  Dices,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MediaCarousel } from "./MediaCarousel";
import { LoadingSpinner } from "./LoadingSpinner";
import { WatchlistCounter } from "./WatchlistCounter";
import { PersonGrid } from "./PersonGrid";
import { MediaItem, Person } from "@/types/tmdb";
import { searchMulti, searchPerson } from "@/app/actions";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [personResults, setPersonResults] = useState<Person[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Each keystroke starts its own request and they can come back out of order –
  // typing "bat" then "batman" would leave the slower "bat" results on screen.
  // Only the most recently started search is allowed to write to state.
  const searchRunId = useRef(0);

  // Check if link is active
  const isActiveLink = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    if (href === "/genres") {
      return pathname.startsWith("/genres");
    }
    if (href === "/movies") {
      return pathname.startsWith("/movies") || pathname.startsWith("/movie");
    }
    if (href === "/tv-shows") {
      return pathname.startsWith("/tv-shows") || pathname.startsWith("/tv");
    }
    if (href === "/watchlist") {
      return pathname === "/watchlist";
    }
    if (href === "/calendar") {
      return pathname === "/calendar";
    }
    if (href === "/tonight") {
      return pathname === "/tonight";
    }
    if (href === "/mood") {
      return pathname.startsWith("/mood");
    }
    if (href === "/people") {
      return pathname.startsWith("/people") || pathname.startsWith("/person");
    }
    return pathname === href;
  };

  // Close mobile menu when pathname changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Debounced search
  const debouncedSearch = useCallback((query: string) => {
    const timeoutId = setTimeout(() => {
      handleSearch(query.trim());
    }, 300); // 300ms delay

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const cleanup = debouncedSearch(searchQuery);
    return cleanup;
  }, [searchQuery, debouncedSearch]);

  const handleSearch = async (query: string) => {
    const runId = ++searchRunId.current;
    const isStale = () => runId !== searchRunId.current;

    if (!query.trim()) {
      setSearchResults([]);
      setPersonResults([]);
      setIsSearching(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsSearching(true);
      setIsLoading(true);
      // Close mobile menu when search starts
      setIsMobileMenuOpen(false);
      const [mediaResponse, peopleResponse] = await Promise.all([
        searchMulti(query, 1),
        searchPerson(query, 1),
      ]);
      if (isStale()) return;
      setSearchResults(mediaResponse.results);
      setPersonResults(peopleResponse.results.slice(0, 8));
    } catch (error) {
      if (isStale()) return;
      console.error("Error searching:", error);
      setSearchResults([]);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  // Submitting leaves the overlay for the search page. The overlay is a preview –
  // it holds one screenful and its results cannot be linked to or returned to
  // with the Back button, which is what someone pressing Enter is asking for.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goToSearchPage(searchQuery);
  };

  const goToSearchPage = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    clearSearch();
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setPersonResults([]);
    setIsSearching(false);
    setIsLoading(false);
    setIsSearchOpen(false);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleMobileLinkClick = () => {
    clearSearch();
    closeMobileMenu();
  };

  const handleSearchIconClick = () => {
    setIsSearchOpen(!isSearchOpen);
    // Close mobile menu when opening search
    if (!isSearchOpen) {
      setIsMobileMenuOpen(false);
    }
    // Focus the search input after the transition
    setTimeout(() => {
      if (searchInputRef.current && !isSearchOpen) {
        searchInputRef.current.focus();
      }
    }, 100);
  };

  // Keyboard: Escape closes, "/" and Cmd/Ctrl+K open. The shortcuts are what make
  // search reachable without going for the mouse, which is how it gets used at
  // all on a site whose whole job is looking things up.
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      // "/" is a legitimate character in a search box or a comment field, so the
      // shortcut has to stand down wherever text is being entered.
      return (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
    };

    const openSearch = () => {
      setIsSearchOpen(true);
      setIsMobileMenuOpen(false);
      // After the panel has been given a frame to expand, or the focus lands on
      // an element that is still collapsed and gets skipped.
      requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSearching) {
        clearSearch();
        return;
      }

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openSearch();
        return;
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return;

        // Prevented so the character does not land in the box that just took
        // focus – Firefox's quick-find would also open on it.
        e.preventDefault();
        openSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSearching]);

  // Block body scroll when searching
  useEffect(() => {
    if (isSearching) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isSearching]);

  return (
    <>
      {/* Navigation */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-sm border-b border-gray-800"
        aria-label="Main navigation"
      >
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link
                href="/"
                prefetch={false}
                onClick={clearSearch}
                className="flex items-center gap-2 text-2xl font-bold text-white hover:text-gray-300 transition-colors group"
                aria-label="WatchList home page"
              >
                <div className="relative">
                  <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg group-hover:shadow-blue-500/25 transition-all duration-300">
                    <Heart className="w-4 h-4 text-white" fill="currentColor" />
                  </div>
                </div>
                <span className="bg-linear-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent font-extrabold tracking-tight">
                  WatchList
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div
              className="hidden md:flex items-center gap-5 lg:gap-6 xl:gap-8"
              role="navigation"
              aria-label="Main menu"
            >
              <Link
                href="/"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors whitespace-nowrap",
                  isActiveLink("/")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/") ? "page" : undefined}
              >
                Home
              </Link>
              <Link
                href="/movies"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors whitespace-nowrap",
                  isActiveLink("/movies")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/movies") ? "page" : undefined}
              >
                Movies
              </Link>
              <Link
                href="/tv-shows"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors whitespace-nowrap",
                  isActiveLink("/tv-shows")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/tv-shows") ? "page" : undefined}
              >
                TV Shows
              </Link>
              <Link
                href="/genres"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors whitespace-nowrap",
                  isActiveLink("/genres")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/genres") ? "page" : undefined}
              >
                Genres
              </Link>
              <Link
                href="/people"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors hidden xl:block whitespace-nowrap",
                  isActiveLink("/people")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/people") ? "page" : undefined}
              >
                People
              </Link>
              <Link
                href="/tonight"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors hidden lg:flex items-center gap-1 whitespace-nowrap",
                  isActiveLink("/tonight")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/tonight") ? "page" : undefined}
                aria-label="What to watch tonight"
              >
                <Dices className="w-4 h-4" aria-hidden="true" />
                Tonight
              </Link>
              <Link
                href="/calendar"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors hidden xl:flex items-center gap-1 whitespace-nowrap",
                  isActiveLink("/calendar")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/calendar") ? "page" : undefined}
                aria-label="Release calendar"
              >
                <CalendarDays className="w-4 h-4" aria-hidden="true" />
                Calendar
              </Link>
              <Link
                href="/watchlist"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors flex items-center gap-1 relative whitespace-nowrap",
                  isActiveLink("/watchlist")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/watchlist") ? "page" : undefined}
                aria-label="My watchlist"
              >
                <Heart className="w-4 h-4" aria-hidden="true" />
                Watchlist
                <WatchlistCounter className="absolute -top-2 -right-4" />
              </Link>
            </div>

            {/* Search and Profile */}
            <div className="flex items-center space-x-4">
              {/* Search Button */}
              <button
                onClick={handleSearchIconClick}
                className="p-2 text-gray-300 hover:text-white transition-colors"
                aria-label={isSearchOpen ? "Close search" : "Open search"}
                aria-expanded={isSearchOpen}
                aria-controls="search-container"
              >
                <Search size={20} aria-hidden="true" />
              </button>

              {/* Profile */}
              <Link
                href="/profile"
                prefetch={false}
                onClick={clearSearch}
                className="p-2 text-gray-300 hover:text-white transition-colors"
                aria-label="Go to profile page"
              >
                <User size={20} aria-hidden="true" />
              </Link>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {isMobileMenuOpen ? (
                  <X size={20} aria-hidden="true" />
                ) : (
                  <Menu size={20} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Search bar.

              Floats below the bar rather than growing it. In the flow it made the
              fixed header 131px tall while the content wrapper still reserved 64,
              so opening search hid the top of whatever page was underneath – easy
              to hit now that "/" opens it from anywhere. As an overlay the header
              keeps its height and nothing below shifts. */}
          <div
            id="search-container"
            className={cn(
              "absolute left-0 right-0 top-16 z-10 px-6 lg:px-8",
              "bg-black/95 backdrop-blur-sm transition-all duration-300 ease-in-out",
              isSearchOpen
                ? "max-h-24 pb-4 border-b border-gray-800"
                : "max-h-0 overflow-hidden",
            )}
            aria-hidden={!isSearchOpen}
          >
            <form
              onSubmit={handleSearchSubmit}
              className="relative container mx-auto"
              role="search"
            >
              <label htmlFor="search-input" className="sr-only">
                Search movies, TV shows and people
              </label>
              <input
                id="search-input"
                ref={searchInputRef}
                type="text"
                placeholder="Search movies, TV shows, people…  (press / anywhere)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-12 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
                aria-describedby={
                  searchResults.length > 0 ? "search-results-info" : undefined
                }
                tabIndex={isSearchOpen ? 0 : -1}
              />
              <Search
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                size={20}
                aria-hidden="true"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white focus:outline-none focus:text-white"
                  aria-label="Clear search"
                  tabIndex={isSearchOpen ? 0 : -1}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              )}
            </form>
          </div>

          {/* Mobile Menu */}
          <div
            id="mobile-menu"
            className={cn(
              "md:hidden overflow-hidden transition-all duration-300 ease-in-out",
              // Tall enough for every entry: the animated max-height clips the
              // last link the moment the menu outgrows it.
              isMobileMenuOpen ? "max-h-[32rem] pb-6" : "max-h-0",
            )}
            aria-hidden={!isMobileMenuOpen}
          >
            <nav
              className="space-y-4 pt-4"
              role="navigation"
              aria-label="Mobile menu"
            >
              <Link
                href="/"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "block transition-colors",
                  isActiveLink("/")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/") ? "page" : undefined}
              >
                Home
              </Link>
              <Link
                href="/movies"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "block transition-colors",
                  isActiveLink("/movies")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/movies") ? "page" : undefined}
              >
                Movies
              </Link>
              <Link
                href="/tv-shows"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "block transition-colors",
                  isActiveLink("/tv-shows")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/tv-shows") ? "page" : undefined}
              >
                TV Shows
              </Link>
              <Link
                href="/genres"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "block transition-colors",
                  isActiveLink("/genres")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/genres") ? "page" : undefined}
              >
                Genres
              </Link>
              <Link
                href="/people"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "block transition-colors",
                  isActiveLink("/people")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/people") ? "page" : undefined}
              >
                People
              </Link>
              <Link
                href="/tonight"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  isActiveLink("/tonight")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/tonight") ? "page" : undefined}
              >
                <Dices className="w-4 h-4" aria-hidden="true" />
                Tonight
              </Link>
              <Link
                href="/mood"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  isActiveLink("/mood")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/mood") ? "page" : undefined}
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Moods
              </Link>
              <Link
                href="/calendar"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  isActiveLink("/calendar")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/calendar") ? "page" : undefined}
                aria-label="Release calendar"
              >
                <CalendarDays className="w-4 h-4" aria-hidden="true" />
                Calendar
              </Link>
              <Link
                href="/watchlist"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "flex items-center gap-2 transition-colors relative",
                  isActiveLink("/watchlist")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/watchlist") ? "page" : undefined}
                aria-label="My watchlist"
              >
                <Heart className="w-4 h-4" aria-hidden="true" />
                Watchlist
                <WatchlistCounter className="absolute -top-1 left-3" />
              </Link>
            </nav>
          </div>
        </div>
      </nav>

      {/* Search Results Overlay */}
      {isSearching &&
        (isLoading ||
          searchResults.length > 0 ||
          personResults.length > 0 ||
          searchQuery.trim()) && (
          <div
            className="fixed inset-0 z-40 bg-black overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-results-title"
            onClick={(e) => {
              // Close search if clicking on the background
              if (e.target === e.currentTarget) {
                clearSearch();
              }
            }}
          >
            {/* Search bar space when open or when there are search results */}
            <div
              className={cn(
                "transition-all duration-300",
                isSearchOpen ? "h-20" : "h-16",
              )}
            ></div>
            <div className="min-h-screen">
              <div className="container mx-auto px-6 lg:px-8 py-8">
                {/* Close button */}
                <div className="flex justify-between items-center my-6">
                  <h2
                    id="search-results-title"
                    className="text-2xl font-bold text-white"
                  >
                    {isLoading
                      ? "Searching..."
                      : searchResults.length > 0 || personResults.length > 0
                        ? "Search Results"
                        : "No Results"}
                  </h2>
                  <button
                    onClick={clearSearch}
                    className="p-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 rounded-md"
                    aria-label="Close search results"
                  >
                    <X size={24} aria-hidden="true" />
                  </button>
                </div>

                <div id="search-results-info" className="sr-only">
                  {isLoading
                    ? "Searching for results..."
                    : searchResults.length > 0 || personResults.length > 0
                      ? `Found ${searchResults.length + personResults.length} results`
                      : "No results found"}
                </div>

                {isLoading ? (
                  <div
                    className="text-center py-12"
                    role="status"
                    aria-live="polite"
                  >
                    <LoadingSpinner className="mb-4" />
                    <p className="text-gray-400 text-lg">
                      Searching for results...
                    </p>
                  </div>
                ) : searchResults.length > 0 || personResults.length > 0 ? (
                  <div role="region" aria-labelledby="search-results-title">
                    {searchResults.length > 0 && (
                      <MediaCarousel
                        title=""
                        items={searchResults}
                        onCardClick={clearSearch}
                      />
                    )}
                    {personResults.length > 0 && (
                      <div className="mt-8">
                        <h3 className="text-lg font-semibold text-white mb-4">
                          People
                        </h3>
                        <PersonGrid
                          people={personResults}
                          onSelect={clearSearch}
                        />
                      </div>
                    )}

                    {/* The overlay only ever holds a screenful; everything past
                        that lives on the search page. */}
                    <div className="mt-10 text-center">
                      <button
                        onClick={() => goToSearchPage(searchQuery)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Search size={16} aria-hidden="true" />
                        See all results for “{searchQuery.trim()}”
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-center py-12"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-gray-400 text-lg">
                      No results found. Try a different search term.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </>
  );
}
