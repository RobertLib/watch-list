"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { ShareListButton } from "@/components/ShareListButton";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { buildMatchPath, extractListFromInput } from "@/lib/list-match";
import { MAX_SHARED_LIST_ITEMS } from "@/lib/shared-list";

/**
 * Start a comparison: your list, plus a link somebody sent you.
 *
 * Your half comes out of this browser and theirs out of the address bar, which is
 * why this works with no account on either side. The result page holds both in
 * its URL, so it can be sent back – which is usually the next thing that happens.
 */
export function MatchStarter() {
  const router = useRouter();
  const { watchlist, isLoading } = useWatchlist();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mine = watchlist
    .slice(0, MAX_SHARED_LIST_ITEMS)
    .map((item) => ({ id: item.id, mediaType: item.mediaType }));

  function compare(event: React.FormEvent) {
    event.preventDefault();

    const theirs = extractListFromInput(input);

    if (theirs.length === 0) {
      setError(
        "That does not look like a WatchList share link. Paste the whole link they sent you.",
      );
      return;
    }

    const path = buildMatchPath(mine, theirs);
    if (!path) {
      setError("Save a few titles of your own first – there is nothing to compare yet.");
      return;
    }

    router.push(path);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={compare} className="space-y-3">
        <label htmlFor="their-list" className="block font-medium text-white">
          Paste their share link
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="their-list"
            type="text"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            placeholder="https://www.watch-list.me/list/…"
            className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            Compare
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
        <h2 className="font-semibold text-white">
          They will need your link too
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          {mine.length > 0
            ? `Send them yours – ${mine.length} title${
                mine.length === 1 ? "" : "s"
              } travelling in the link itself, no account at either end.`
            : "Save a few titles and you will have a link of your own to send."}
        </p>
        {mine.length > 0 && (
          <ShareListButton items={mine} defaultTitle="My watchlist" />
        )}
      </div>

      <p className="text-sm text-gray-500">
        Nothing about either list is stored. Both travel in the address, which is
        also why the result page can be sent straight back.{" "}
        <Link
          href="/watchlist"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Your watchlist
        </Link>
      </p>
    </div>
  );
}
