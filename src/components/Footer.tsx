import { Github, Heart } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="bg-gray-900 border-t border-gray-800 mt-16"
      role="contentinfo"
    >
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* About */}
          <div>
            <h3 className="text-white font-semibold mb-4">About WatchList</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Discover the best movies and TV shows across all streaming
              platforms. Never miss what&apos;s trending and find your next
              favorite watch.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <nav className="space-y-2" aria-label="Footer navigation">
              <Link
                href="/movies"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                Popular Movies
              </Link>
              <Link
                href="/tv-shows"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                Top TV Shows
              </Link>
              <Link
                href="/"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                Trending Now
              </Link>
              <Link
                href="/genres"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                Browse Genres
              </Link>
            </nav>
          </div>

          {/* Data Source */}
          <div>
            <h3 className="text-white font-semibold mb-4">Data Source</h3>
            <p className="text-gray-400 text-sm mb-4">
              Powered by{" "}
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded"
                aria-label="Visit The Movie Database website (opens in new tab)"
              >
                The Movie Database (TMDb)
              </a>
            </p>
            <a
              href="https://github.com/RobertLib/watch-list"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 rounded"
              aria-label="View source code on GitHub (opens in new tab)"
            >
              <Github className="w-4 h-4" aria-hidden="true" />
              View on GitHub
            </a>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2025 WatchList. All rights reserved.
          </p>
          <p className="text-gray-400 text-sm flex items-center gap-1 mt-4 md:mt-0">
            Made with{" "}
            <Heart className="w-4 h-4 text-red-500" aria-label="love" /> for
            movie lovers
          </p>
        </div>
      </div>
    </footer>
  );
}
