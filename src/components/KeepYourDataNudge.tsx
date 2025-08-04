"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Share, Smartphone, X } from "lucide-react";
import { useWatchlist } from "@/contexts/WatchlistContext";

const DISMISSED_KEY = "keep-data-nudge-dismissed";

/**
 * The one warning this app owes anybody.
 *
 * There is no account, so browser storage is the only copy that exists. Clearing
 * site data, a new phone, a reinstalled browser – any of them takes the lot, and
 * the visitor finds out at the worst possible moment. Backup has been available
 * on the profile page all along; nobody goes looking for it before they need it.
 *
 * So it is raised once, when the list has become worth keeping, and never again.
 * Installing the app is offered alongside it because it solves the same problem
 * from the other end – an installed app is much less likely to have its storage
 * swept.
 */
const NUDGE_AFTER_TITLES = 10;

export function KeepYourDataNudge() {
  const { watchlist, isLoading } = useWatchlist();
  const [dismissed, setDismissed] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only
       state that the server render cannot see */
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      // Storage refused: treat it as dismissed rather than nagging every load.
      setDismissed(true);
    }

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do – it will be asked once more next time, at worst.
    }
  }

  if (isLoading || dismissed) return null;
  if (watchlist.length < NUDGE_AFTER_TITLES) return null;

  return (
    <section
      aria-labelledby="keep-data-heading"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <h2
            id="keep-data-heading"
            className="font-semibold text-white flex items-center gap-2"
          >
            <Download className="w-5 h-5 text-amber-400" aria-hidden="true" />
            {watchlist.length} titles, and only one copy
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
            There is no account here, which is the point – but it also means this
            list lives in this browser and nowhere else. Clearing site data or
            moving to a new phone would take it. A backup file is the fix, and it
            restores anywhere.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/profile"
              prefetch={false}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-sm font-semibold text-amber-100 transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Back it up
            </Link>

            {!isInstalled && (
              <span className="inline-flex items-center gap-2 text-sm text-gray-400">
                {isIOS ? (
                  <>
                    <Share className="w-4 h-4" aria-hidden="true" />
                    Or add to your home screen from the share menu
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4" aria-hidden="true" />
                    Or install the app from your browser menu – storage survives
                    longer that way
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
