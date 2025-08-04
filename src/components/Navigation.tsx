"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Search, Menu, X, User, Heart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MediaCarousel } from "./MediaCarousel";
import { LoadingSpinner } from "./LoadingSpinner";
import { WatchlistCounter } from "./WatchlistCounter";
import { MediaItem } from "@/types/tmdb";
import { searchMulti } from "@/app/actions";

export function Navigation() {
  const pathname = usePathname();
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsSearching(true);
      setIsLoading(true);
      // Close mobile menu when search starts
      setIsMobileMenuOpen(false);
      const response = await searchMulti(query, 1);
      setSearchResults(response.results);
    } catch (error) {
      console.error("Error searching:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
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

  // Handle Escape key to close search
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSearching) {
        clearSearch();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
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
        role="banner"
        aria-label="Main navigation"
      >
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
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
              className="hidden md:flex items-center space-x-8"
              role="navigation"
              aria-label="Main menu"
            >
              <Link
                href="/"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors",
                  isActiveLink("/")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white"
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
                  "transition-colors",
                  isActiveLink("/movies")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white"
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
                  "transition-colors",
                  isActiveLink("/tv-shows")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white"
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
                  "transition-colors",
                  isActiveLink("/genres")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white"
                )}
                aria-current={isActiveLink("/genres") ? "page" : undefined}
              >
                Genres
              </Link>
              <Link
                href="/watchlist"
                prefetch={false}
                onClick={clearSearch}
                className={cn(
                  "transition-colors flex items-center gap-1 relative",
                  isActiveLink("/watchlist")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white"
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

          {/* Search Bar */}
          <div
            id="search-container"
            className={cn(
              "transition-all duration-300 ease-in-out",
              isSearchOpen ? "max-h-20 pb-4" : "max-h-0 overflow-hidden"
            )}
            aria-hidden={!isSearchOpen}
          >
            <form
              onSubmit={handleSearchSubmit}
              className="relative"
              role="search"
            >
              <label htmlFor="search-input" className="sr-only">
                Search movies, TV shows and people
              </label>
              <input
                id="search-input"
                ref={searchInputRef}
                type="text"
                placeholder="Search movies, TV shows..."
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
              isMobileMenuOpen ? "max-h-60 pb-4" : "max-h-0"
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
                    : "text-gray-300 hover:text-white"
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
                    : "text-gray-300 hover:text-white"
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
                    : "text-gray-300 hover:text-white"
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
                    : "text-gray-300 hover:text-white"
                )}
                aria-current={isActiveLink("/genres") ? "page" : undefined}
              >
                Genres
              </Link>
              <Link
                href="/watchlist"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "flex items-center gap-2 transition-colors relative",
                  isActiveLink("/watchlist")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white"
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
        (isLoading || searchResults.length > 0 || searchQuery.trim()) && (
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
                isSearchOpen ? "h-20" : "h-16"
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
                      : searchResults.length > 0
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
                    : searchResults.length > 0
                    ? `Found ${searchResults.length} results`
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
                ) : searchResults.length > 0 ? (
                  <div role="region" aria-labelledby="search-results-title">
                    <MediaCarousel
                      title=""
                      items={searchResults}
                      onCardClick={clearSearch}
                    />
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
