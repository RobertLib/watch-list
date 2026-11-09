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
import { isPlainPrimaryClick } from "@/lib/plain-click";
import { MediaCarousel } from "./MediaCarousel";
import { LoadingSpinner } from "./LoadingSpinner";
import { WatchlistCounter } from "./WatchlistCounter";
import { PersonGrid } from "./PersonGrid";
import { MediaItem, Person } from "@/types/tmdb";
import { searchMulti, searchPerson } from "@/lib/api";

/**
 * Whether the search shortcut is Cmd+K (Apple) rather than Ctrl+K.
 *
 * On macOS Ctrl+K is a text-editing command – "delete to the end of the line"
 * in every field – so there only Cmd+K may be claimed.
 */
function isApplePlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || "");
}

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [personResults, setPersonResults] = useState<Person[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearchError, setHasSearchError] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Where focus goes when Escape closes the search bar itself: the input it was
  // in is collapsed and taken out of the tab order, and focus left on a hidden
  // field is focus lost.
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  // Where Escape returns focus when it closes the mobile menu from inside it.
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const restorePanelFocus = useCallback(() => {
    const active = document.activeElement;
    // Only reclaim focus from a panel we are closing. A new page may already
    // have focused its main content, and navigation must leave that alone.
    if (
      active instanceof HTMLElement &&
      active.closest("#search-container, #search-results, #mobile-menu")
    ) {
      searchToggleRef.current?.focus();
    }
  }, []);
  // Both opening paths delay focus until the panel expands. Closing or leaving
  // the page must cancel either one before it can focus a hidden input.
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const cancelScheduledFocus = useCallback(() => {
    if (focusTimerRef.current !== null) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
  }, []);
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
    if (href === "/moods") {
      return pathname === "/moods" || pathname.startsWith("/mood");
    }
    if (href === "/people") {
      return pathname.startsWith("/people") || pathname.startsWith("/person");
    }
    return pathname === href;
  };

  // The header survives navigation. Discard its open panels before the new page
  // renders, including navigation through the browser's Back/Forward buttons.
  const [panelPathname, setPanelPathname] = useState(pathname);
  if (panelPathname !== pathname) {
    setPanelPathname(pathname);
    setIsMobileMenuOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setPersonResults([]);
    setIsSearching(false);
    setIsLoading(false);
    setHasSearchError(false);
    setIsSearchOpen(false);
  }

  const updateSearchQuery = (query: string) => {
    if (query === searchQuery) return;

    // An edit supersedes the current request immediately, before the next
    // debounce starts. Otherwise its answer can appear under the new query.
    searchRunId.current += 1;
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      setPersonResults([]);
      setIsSearching(false);
      setIsLoading(false);
      setHasSearchError(false);
    }
  };

  const handleSearch = async (query: string) => {
    const runId = ++searchRunId.current;
    const isStale = () => runId !== searchRunId.current;

    if (!query.trim()) {
      setSearchResults([]);
      setPersonResults([]);
      setIsSearching(false);
      setIsLoading(false);
      setHasSearchError(false);
      return;
    }

    try {
      setIsSearching(true);
      setIsLoading(true);
      setHasSearchError(false);
      setSearchResults([]);
      setPersonResults([]);
      // Close mobile menu when search starts
      setIsMobileMenuOpen(false);
      const [mediaResponse, peopleResponse] = await Promise.allSettled([
        searchMulti(query, 1),
        searchPerson(query, 1),
      ]);
      if (isStale()) return;
      setSearchResults(
        mediaResponse.status === "fulfilled" ? mediaResponse.value.results : [],
      );
      setPersonResults(
        peopleResponse.status === "fulfilled"
          ? peopleResponse.value.results.slice(0, 8)
          : [],
      );
      setHasSearchError(
        mediaResponse.status === "rejected" || peopleResponse.status === "rejected",
      );
      for (const response of [mediaResponse, peopleResponse]) {
        if (response.status === "rejected") {
          console.error("Error searching:", response.reason);
        }
      }
    } catch (error) {
      if (isStale()) return;
      console.error("Error searching:", error);
      setSearchResults([]);
      setPersonResults([]);
      setHasSearchError(true);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  // Debounced search
  const debouncedSearch = useCallback((query: string) => {
    // Closing results invalidates queued searches too, before they have started
    // a request. The query stays in the input, so its effect will not clean up
    // this timer when Escape dismisses the popup.
    const runId = searchRunId.current;
    const timeoutId = setTimeout(() => {
      if (runId !== searchRunId.current) return;
      handleSearch(query.trim());
    }, 300); // 300ms delay

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const cleanup = debouncedSearch(searchQuery);
    return cleanup;
  }, [searchQuery, debouncedSearch]);

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

  const clearSearch = useCallback(() => {
    restorePanelFocus();
    cancelScheduledFocus();
    searchRunId.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setPersonResults([]);
    setIsSearching(false);
    setIsLoading(false);
    setHasSearchError(false);
    setIsSearchOpen(false);
  }, [cancelScheduledFocus, restorePanelFocus]);

  // Escape on the results: the popup closes, the box keeps what was typed and
  // gets focus back – the combobox pattern's Escape, not a reset. The run id is
  // bumped so neither a queued search nor an in-flight answer reopens the panel.
  const closeResults = () => {
    searchRunId.current += 1;
    setSearchResults([]);
    setPersonResults([]);
    setIsSearching(false);
    setIsLoading(false);
    setHasSearchError(false);
    searchInputRef.current?.focus();
  };

  // The ✕ inside the box: an empty box to type the next query into, not a
  // closed bar. It used to call `clearSearch`, which also collapsed the bar and
  // sent focus up to the toolbar – "Close search" under another name, leaving
  // whoever wanted to start over to reopen the search before typing again.
  // Focus moves first: the button disappears with the query it clears.
  const clearQuery = () => {
    searchInputRef.current?.focus();
    updateSearchQuery("");
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleMobileMenuToggle = () => {
    if (!isMobileMenuOpen) clearSearch();
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // A header link closes search and the menu only when it takes this tab
  // somewhere. Cmd/Ctrl/Shift-click opens a new tab or window and this page
  // stays as it was – query, results and an open menu included.
  const handleLinkClick = (e: React.MouseEvent) => {
    if (isPlainPrimaryClick(e)) clearSearch();
  };

  const handleMobileLinkClick = (e: React.MouseEvent) => {
    if (!isPlainPrimaryClick(e)) return;
    clearSearch();
    closeMobileMenu();
  };

  const handleSearchIconClick = () => {
    if (isSearchOpen) {
      // Closing the bar also dismisses its results and invalidates any queued
      // or in-flight lookup, so none can reopen a popup with its input hidden.
      clearSearch();
      return;
    }

    cancelScheduledFocus();
    setIsSearchOpen(true);
    setIsMobileMenuOpen(false);
    // Focus the search input after the transition.
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      if (searchInputRef.current?.tabIndex === 0) {
        searchInputRef.current.focus();
      }
    }, 100);
  };

  useEffect(() => {
    // Pathname alone does not change between two film details or two pages of
    // search results. Popstate also dismisses panels on query-only Back/Forward.
    const dismissPanels = () => {
      clearSearch();
      setIsMobileMenuOpen(false);
    };
    window.addEventListener("popstate", dismissPanels);

    return () => {
      window.removeEventListener("popstate", dismissPanels);
      restorePanelFocus();
      cancelScheduledFocus();
      // Invalidate queued debounces and responses from the page we just left.
      searchRunId.current += 1;
    };
  }, [pathname, clearSearch, cancelScheduledFocus, restorePanelFocus]);

  // Keyboard: Escape closes, "/" and Cmd/Ctrl+K open. The shortcuts are what make
  // search reachable without going for the mouse, which is how it gets used at
  // all on a site whose whole job is looking things up.
  useEffect(() => {
    const isApple = isApplePlatform();

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
      cancelScheduledFocus();
      setIsSearchOpen(true);
      setIsMobileMenuOpen(false);
      // After the panel has been given a frame to expand, or the focus lands on
      // an element that is still collapsed and gets skipped.
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null;
        if (searchInputRef.current?.tabIndex === 0) searchInputRef.current.focus();
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Keys typed while an input method is composing belong to it. Escape
      // there cancels the composition, and must not also close the results or
      // throw away the query. Safari reports the keydown that ends a
      // composition with `isComposing` already false, but as key code 229.
      if (e.isComposing || e.keyCode === 229) return;

      // A trailer or gallery owns the keyboard while it is open, and so does an
      // open panel on the page (Share, Add to list): each closes itself on
      // Escape and prevents the default to say it took the key. This listener
      // is on `window`, so it runs after every `document` listener and every
      // React handler – one Escape closes one layer, whichever order the
      // listeners happened to be registered in. The modal check stays as a
      // second line for a dialog that does not prevent the default.
      if (
        e.defaultPrevented ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        return;
      }

      if (e.key === "Escape") {
        // Two layers, closed one at a time: first the results popup, then the
        // bar itself. Escape used to do nothing at all unless results were up,
        // which left an opened-but-empty search bar with no key to dismiss it.
        if (isSearching) {
          closeResults();
        } else if (isSearchOpen) {
          clearSearch();
          searchToggleRef.current?.focus();
        } else if (isMobileMenuOpen) {
          // The menu is a disclosure, and Escape is how one is put away. Focus
          // goes back to its toggle only if it was in the menu: the collapsed
          // menu is inert, so focus left inside it would be lost – but focus
          // somewhere else on the page is the visitor's and stays put.
          const active = document.activeElement;
          const toggle = mobileMenuToggleRef.current;
          setIsMobileMenuOpen(false);
          if (
            active === toggle ||
            document.getElementById("mobile-menu")?.contains(active)
          ) {
            toggle?.focus();
          }
        }
        return;
      }

      // Cmd+K on Apple platforms, Ctrl+K elsewhere – never both: Ctrl+K edits
      // text on a Mac. And never inside another text field, where the chord
      // has a meaning of its own; the search box is the exception, since it
      // can only mean "search".
      //
      // The K is the character first, and the physical key only when the
      // layout types no Latin letter there: on a Russian, Greek or Hebrew
      // keyboard `e.key` is "л", "κ" or "ל" and the shortcut never fired. A
      // Latin layout that puts another letter on that key – Dvorak types "t"
      // there – keeps its own meaning for the chord.
      const hasShortcutModifier = isApple
        ? e.metaKey && !e.ctrlKey
        : e.ctrlKey && !e.metaKey;
      const key = e.key.toLowerCase();
      const isK = key === "k" || (!/^[a-z]$/.test(key) && e.code === "KeyK");
      if (
        isK &&
        hasShortcutModifier &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (isTypingTarget(e.target) && e.target !== searchInputRef.current) {
          return;
        }
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

    // `window`, not `document`: see the `defaultPrevented` check above. On
    // `document` this listener ran before any panel registered after it – and
    // it re-registers whenever the search or the menu opens – so Escape in a
    // Share panel also closed the search bar and moved focus up to the header.
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearching, isSearchOpen, isMobileMenuOpen, cancelScheduledFocus, clearSearch]);

  // The results panel is open. Read by the combobox attributes on the input and
  // by the panel itself, so the two cannot disagree about it.
  const isResultsOpen =
    isSearching &&
    (isLoading ||
      searchResults.length > 0 ||
      personResults.length > 0 ||
      searchQuery.trim().length > 0);

  // Block scrolling and interaction with the page covered by the results.
  // The header and its search input remain available alongside the popup.
  //
  // What was there before is put back, not a fixed value: `VideoOverlay` locks
  // the same property, and two locks that each reset it to a constant on the
  // way out undo each other – closing a trailer opened from these results used
  // to unlock the page under a panel that was still open.
  useEffect(() => {
    if (!isResultsOpen) return;

    const background = Array.from(document.querySelectorAll<HTMLElement>(
      '#main-content, footer, a[href="#main-content"]',
    ));
    const previousInert = background.map((element) => element.getAttribute("inert"));

    // The debounce gives Tab time to leave the search box before the popup
    // appears. Move focus out of covered content before making it inert.
    if (background.some((element) => element.contains(document.activeElement))) {
      const input = searchInputRef.current;
      if (input?.tabIndex === 0) input.focus();
      else searchToggleRef.current?.focus();
    }
    background.forEach((element) => element.setAttribute("inert", ""));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => {
        const previous = previousInert[index];
        if (previous === null) element.removeAttribute("inert");
        else element.setAttribute("inert", previous);
      });
    };
  }, [isResultsOpen]);

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
                onClick={handleLinkClick}
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

            {/* Use the full menu below xl so none of its links disappear. */}
            <div
              className="hidden xl:flex items-center gap-8"
              role="navigation"
              aria-label="Main menu"
            >
              <Link
                href="/"
                prefetch={false}
                onClick={handleLinkClick}
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
                onClick={handleLinkClick}
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
                onClick={handleLinkClick}
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
                onClick={handleLinkClick}
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
                onClick={handleLinkClick}
                className={cn(
                  "transition-colors whitespace-nowrap",
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
                onClick={handleLinkClick}
                className={cn(
                  "transition-colors flex items-center gap-1 whitespace-nowrap",
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
                onClick={handleLinkClick}
                className={cn(
                  "transition-colors flex items-center gap-1 whitespace-nowrap",
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
                onClick={handleLinkClick}
                className={cn(
                  "transition-colors flex items-center gap-1 relative whitespace-nowrap",
                  isActiveLink("/watchlist")
                    ? "text-white border-b-2 border-blue-500 pb-1"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/watchlist") ? "page" : undefined}
                // Named by its content, not an `aria-label`: a label replaced
                // the counter too, so a screen reader never heard how many
                // titles were saved. The counter adds its own spoken form.
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
                ref={searchToggleRef}
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
                onClick={handleLinkClick}
                className="p-2 text-gray-300 hover:text-white transition-colors"
                aria-label="Go to profile page"
              >
                <User size={20} aria-hidden="true" />
              </Link>

              {/* Mobile Menu Button */}
              <button
                ref={mobileMenuToggleRef}
                onClick={handleMobileMenuToggle}
                className="xl:hidden p-2 text-gray-300 hover:text-white transition-colors"
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
                onChange={(e) => updateSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-12 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
                // The combobox pattern: the box owns the popup below it. The
                // popup used to be a *modal* dialog, which told assistive
                // technology that everything outside it – including this very
                // input, the one being typed into – was off limits.
                role="combobox"
                aria-haspopup="dialog"
                aria-expanded={isResultsOpen}
                aria-controls="search-results"
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
                  onClick={clearQuery}
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
              "xl:hidden overflow-x-hidden transition-all duration-300 ease-in-out",
              // The header is fixed, so a short viewport needs the menu itself
              // to scroll before its last links can move onto the screen.
              isMobileMenuOpen
                ? "max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain pb-6"
                : "max-h-0 overflow-y-hidden",
            )}
            aria-hidden={!isMobileMenuOpen}
            // `aria-hidden` alone hides the menu from a screen reader but not
            // from the Tab key: nine links behind a zero-height clip were still
            // focus stops, each one landing on nothing visible.
            inert={!isMobileMenuOpen ? true : undefined}
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
                href="/moods"
                prefetch={false}
                onClick={handleMobileLinkClick}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  isActiveLink("/moods")
                    ? "text-white font-semibold"
                    : "text-gray-300 hover:text-white",
                )}
                aria-current={isActiveLink("/moods") ? "page" : undefined}
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
              >
                <Heart className="w-4 h-4" aria-hidden="true" />
                Watchlist
                <WatchlistCounter className="absolute -top-1 left-3" />
              </Link>
            </nav>
          </div>
        </div>
      </nav>

      {/* Search Results Overlay – the combobox's popup. A dialog, but not a
          modal one: the input driving it sits in the header above, and
          `aria-modal` would have declared that input out of bounds. */}
      {isResultsOpen && (
        <div
          id="search-results"
          className="fixed inset-0 z-40 bg-black overflow-y-auto"
          role="dialog"
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
                      : hasSearchError
                        ? "Search unavailable"
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

              {hasSearchError && !isLoading && (
                <p role="alert" className="text-gray-400 text-center mb-6">
                  Some search results could not be loaded. Try again in a moment.
                </p>
              )}

              <div id="search-results-info" className="sr-only">
                {isLoading
                  ? "Searching for results..."
                  : searchResults.length > 0 || personResults.length > 0
                    ? `Found ${searchResults.length + personResults.length} results`
                    : hasSearchError
                      ? "Search unavailable"
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
                <div>
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
              ) : !hasSearchError ? (
                <div
                  className="text-center py-12"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-gray-400 text-lg">
                    No results found. Try a different search term.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
