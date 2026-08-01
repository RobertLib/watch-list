"use client";

import { useRef, useState } from "react";
import { Download, Upload, AlertTriangle, ShieldCheck } from "lucide-react";
import { applyPortableSettings, getPortableSettings } from "@/app/actions";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { toast } from "@/components/Toast";
import { saveWatchlist } from "@/lib/watchlist";
import { saveWatched } from "@/lib/watched";
import { saveEpisodeProgress } from "@/lib/episode-progress";
import { getRatingsSnapshot, saveRatings } from "@/lib/ratings";
import { getCollectionsSnapshot, saveCollections } from "@/lib/collections";
import { getRanking, saveRanking } from "@/lib/ranking";
import { getGoal, saveGoal } from "@/lib/goal";
import {
  backupFilename,
  buildBackup,
  parseBackup,
  summarizeBackup,
  type BackupSummary,
  type PortableData,
} from "@/lib/portable-data";

/**
 * Export and restore everything this browser holds.
 *
 * Without an account, browser storage is the only copy: clearing site data or
 * moving to a phone loses a watchlist that took months to build. This is the
 * escape hatch – and the only way to carry a list to a second device.
 */
export function DataPortability() {
  const { watchlist, refreshWatchlist, isLoading: isWatchlistLoading } =
    useWatchlist();
  const { watched, refreshWatched, isLoading: isWatchedLoading } = useWatched();
  const {
    progress,
    refreshProgress,
    isLoading: isProgressLoading,
  } = useEpisodeProgress();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pending, setPending] = useState<PortableData | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const exportedAt = new Date().toISOString();
      const backup = buildBackup({
        watchlist,
        watched,
        episodeProgress: progress,
        ratings: getRatingsSnapshot(),
        collections: getCollectionsSnapshot(),
        ranking: getRanking(),
        goal: getGoal(),
        // The only part that is not already in this component's hands.
        settings: await getPortableSettings(),
        exportedAt,
      });

      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );

      const link = document.createElement("a");
      link.href = url;
      link.download = backupFilename(exportedAt);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.showToast("Backup downloaded", "success");
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.showToast("Could not build the backup", "error");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFile(file: File) {
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));

      if (!parsed) {
        toast.showToast("That is not a WatchList backup file", "error");
        return;
      }

      // Held rather than applied: replacing a list is destructive, so the counts
      // are shown first and the visitor confirms against them.
      setPending(parsed);
    } catch (error) {
      console.error("Error reading backup:", error);
      toast.showToast("Could not read that file", "error");
    } finally {
      // Clear the input so choosing the same file again still fires a change.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmRestore() {
    if (!pending) return;

    setIsRestoring(true);
    try {
      saveWatchlist(pending.watchlist);
      saveWatched(pending.watched);
      saveEpisodeProgress(pending.episodeProgress);
      saveRatings(pending.ratings);
      saveCollections(pending.collections);
      saveRanking(pending.ranking);
      saveGoal(pending.goal);
      await applyPortableSettings(pending.settings);

      // The contexts hold their own copies, so they have to be told to re-read.
      refreshWatchlist();
      refreshWatched();
      refreshProgress();

      setPending(null);
      toast.showToast("Backup restored", "success");
    } catch (error) {
      console.error("Error restoring backup:", error);
      toast.showToast("Could not restore that backup", "error");
    } finally {
      setIsRestoring(false);
    }
  }

  const isReadingStorage =
    isWatchlistLoading || isWatchedLoading || isProgressLoading;

  const current = summarizeBackup(
    buildBackup({
      watchlist,
      watched,
      episodeProgress: progress,
      ratings: getRatingsSnapshot(),
      collections: getCollectionsSnapshot(),
      ranking: getRanking(),
      goal: getGoal(),
      settings: {
        region: null,
        watchProviderFilter: null,
        selectedProviderIds: [],
      },
      exportedAt: "",
    }),
  );

  return (
    <section
      aria-labelledby="portability-heading"
      className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4"
    >
      <div>
        <h2
          id="portability-heading"
          className="text-lg font-semibold text-white flex items-center gap-2"
        >
          <ShieldCheck className="w-5 h-5 text-blue-400" aria-hidden="true" />
          Backup &amp; transfer
        </h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          WatchList keeps no account, so everything you save lives in this
          browser only. Download a backup to keep it safe – or to move it to
          another device.
        </p>
      </div>

      {/* Withheld until storage has been read: the counts start at zero, and
          "0 to watch" next to a backup button reads as "there is nothing to back
          up" rather than as "still loading". */}
      <p className="text-sm text-gray-500">
        {isReadingStorage ? (
          <span className="inline-block h-4 w-72 max-w-full bg-gray-800 rounded animate-pulse align-middle" />
        ) : (
          <>
            In this browser: {current.watchlist} to watch, {current.watched}{" "}
            watched, {current.showsInProgress} series in progress (
            {current.episodes} episode{current.episodes === 1 ? "" : "s"}{" "}
            ticked), {current.ratings} rated
            {current.collections > 0 &&
              `, ${current.collections} list${current.collections === 1 ? "" : "s"}`}
            .
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          disabled={isExporting || isReadingStorage}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {isExporting ? "Preparing…" : "Download backup"}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Restore from file
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {pending && (
        <RestoreConfirmation
          summary={summarizeBackup(pending)}
          exportedAt={pending.exportedAt}
          isRestoring={isRestoring}
          onConfirm={confirmRestore}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

function RestoreConfirmation({
  summary,
  exportedAt,
  isRestoring,
  onConfirm,
  onCancel,
}: {
  summary: BackupSummary;
  exportedAt: string;
  isRestoring: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="restore-heading"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      <h3
        id="restore-heading"
        className="font-semibold text-amber-200 flex items-center gap-2"
      >
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        Replace what is in this browser?
      </h3>

      <p className="text-sm text-amber-100/80 leading-relaxed">
        This backup holds <strong>{summary.watchlist}</strong> to watch,{" "}
        <strong>{summary.watched}</strong> watched and{" "}
        <strong>{summary.showsInProgress}</strong> series in progress (
        {summary.episodes} episode{summary.episodes === 1 ? "" : "s"} ticked) and{" "}
        <strong>{summary.ratings}</strong> rated
        {summary.collections > 0 &&
          `, ${summary.collections} named list${summary.collections === 1 ? "" : "s"}`}
        {summary.hasSettings && ", plus your region and platform settings"}.
        {exportedAt && ` Exported ${exportedAt.slice(0, 10)}.`}
      </p>

      <p className="text-sm text-amber-100/80">
        Restoring replaces the lists in this browser. It cannot be undone – if
        you have anything here worth keeping, download a backup first.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onConfirm}
          disabled={isRestoring}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-sm font-semibold text-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {isRestoring ? "Restoring…" : "Replace and restore"}
        </button>
        <button
          onClick={onCancel}
          disabled={isRestoring}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
