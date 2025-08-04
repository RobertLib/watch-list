"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, Upload, AlertTriangle, ShieldCheck } from "lucide-react";
import { readStoredSettings } from "@/lib/settings";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { toast } from "@/components/Toast";
import { getRatingsSnapshot } from "@/lib/ratings";
import {
  getCollectionsSnapshot,
  getServerCollectionsSnapshot,
  subscribeToCollections,
} from "@/lib/collections";
import { useRatings } from "@/hooks/useRatings";
import { getRanking } from "@/lib/ranking";
import { getGoal } from "@/lib/goal";
import { getGameState } from "@/lib/daily-game";
import { getRecord } from "@/lib/higher-lower";
import { getWatchlist } from "@/lib/watchlist";
import { getWatched } from "@/lib/watched";
import { getEpisodeProgress } from "@/lib/episode-progress";
import { withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";
import { restoreBackup, restoreFailureLabel } from "@/lib/restore-backup";
import {
  getActiveProfileId,
  getProfiles,
  readProfileSlot,
  subscribeProfiles,
} from "@/lib/profiles";
import {
  backupFilename,
  buildBackup,
  parseBackup,
  readStoredStores,
  storesFromSlot,
  summarizeBackup,
  type BackupSummary,
  type PortableData,
  type PortableStores,
} from "@/lib/portable-data";

/** Read the active profile's live keys when the backup is requested. */
function liveStores(): PortableStores {
  return {
    watchlist: getWatchlist(),
    watched: getWatched(),
    episodeProgress: getEpisodeProgress(),
    ratings: getRatingsSnapshot(),
    collections: getCollectionsSnapshot(),
    ranking: getRanking(),
    goal: getGoal(),
    dailyGame: getGameState(),
    higherLower: getRecord(),
  };
}

function getOtherProfileCount(): number {
  return Math.max(0, getProfiles().length - 1);
}

const getServerOtherProfileCount = () => 0;

interface PendingRestore {
  data: PortableData;
  filename: string;
  selection: number;
  /** Legacy files carry no owner; bind them before their asynchronous read. */
  profileId: string;
}

function checkRestoreProfile(profileId: string): boolean {
  try {
    if (getActiveProfileId({ strict: true }) === profileId) return true;
  } catch {
    toast.showToast(
      "Could not check your active profile. Reload the page and try again.",
      "error",
    );
    return false;
  }

  toast.showToast(
    "Your active profile changed. Choose the backup file again for the current profile.",
    "info",
  );
  return false;
}

/**
 * Export and restore everything this browser holds.
 *
 * Without an account, browser storage is the only copy: clearing site data or
 * moving to a phone loses a watchlist that took months to build. This is the
 * escape hatch – and the only way to carry a list to a second device.
 */
export function DataPortability() {
  const { watchlist, profileId: watchlistProfileId, refreshWatchlist, isLoading: isWatchlistLoading } =
    useWatchlist();
  const { watched, refreshWatched, isLoading: isWatchedLoading } = useWatched();
  const {
    progress,
    refreshProgress,
    isLoading: isProgressLoading,
  } = useEpisodeProgress();
  const { ratings } = useRatings();
  const collections = useSyncExternalStore(
    subscribeToCollections,
    getCollectionsSnapshot,
    getServerCollectionsSnapshot,
  );
  const otherProfileCount = useSyncExternalStore(
    subscribeProfiles,
    getOtherProfileCount,
    getServerOtherProfileCount,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileProfileId = useRef<string | null>(null);
  const fileReadGeneration = useRef(0);
  const [readingFilename, setReadingFilename] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoring = useRef(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      // Read the complete snapshot under the same origin-wide lock as edits,
      // profile switches and restores. Even its roster must be read after a
      // queued restore finishes; otherwise a backup can mix two generations.
      const backup = await withProfileRosterLock<PortableData | null>(() => {
        const exportedAt = new Date().toISOString();
        const profiles = getProfiles({ strict: true });
        const activeId = getActiveProfileId({ strict: true });
        const active = profiles.find((profile) => profile.id === activeId);
        if (!active) throw new Error("The active profile is absent from the stored roster");

        const otherProfiles = profiles
          .filter((profile) => profile.id !== active.id)
          .map((profile) => ({
            id: profile.id,
            name: profile.name,
            ...storesFromSlot(readProfileSlot(profile.id, { strict: true }), exportedAt),
          }));

        return buildBackup({
          stores: withProfileStorage(active.id, () => readStoredStores(exportedAt)),
          activeProfile: { id: active.id, name: active.name },
          otherProfiles,
          settings: readStoredSettings({ strict: true }),
          exportedAt,
        });
      }, null);
      if (!backup) throw new Error("Could not read the backup under the profile lock");

      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );

      const link = document.createElement("a");
      link.href = url;
      link.download = backupFilename(backup.exportedAt);
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
    if (restoring.current) return;
    const selection = ++fileReadGeneration.current;
    const isCurrent = () =>
      selection === fileReadGeneration.current && !restoring.current;
    // The confirmation must always belong to the latest selected file, even
    // while that file is still being read.
    setPending(null);
    setReadingFilename(file.name);
    // Retain the person who opened the native picker, or the loaded owner for
    // a direct file selection, even before another tab's storage event arrives.
    const profileId = fileProfileId.current ?? watchlistProfileId;
    fileProfileId.current = null;
    try {
      const text = await file.text();
      if (!isCurrent()) return;
      const parsed = parseBackup(JSON.parse(text));

      if (!parsed) {
        toast.showToast("That is not a WatchList backup file", "error");
        return;
      }

      if (!parsed.activeProfile && !checkRestoreProfile(profileId)) {
        setPending(null);
        return;
      }

      // Held rather than applied: replacing a list is destructive, so the counts
      // are shown first and the visitor confirms against them.
      setPending({ data: parsed, profileId, filename: file.name, selection });
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Error reading backup:", error);
      toast.showToast("Could not read that file", "error");
    } finally {
      if (selection === fileReadGeneration.current) {
        setReadingFilename(null);
        // Only this selection may clear the input; an earlier read must not
        // reset the file chosen while it was waiting.
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }

  async function confirmRestore() {
    if (!pending || restoring.current || pending.selection !== fileReadGeneration.current) return;
    if (!pending.data.activeProfile && !checkRestoreProfile(pending.profileId)) {
      setPending(null);
      return;
    }

    restoring.current = true;
    setIsRestoring(true);
    try {
      // Even a switch between the check and a storage read cannot redirect a
      // legacy file's writes. Profile-bearing backups replace the whole roster.
      const result = await (pending.data.activeProfile
        ? restoreBackup(pending.data)
        : withProfileStorage(pending.profileId, () => restoreBackup(pending.data)));
      if (!result.ok) {
        toast.showToast(
          `Could not restore ${restoreFailureLabel(result.key)} — your browser refused the write. ${
            result.rolledBack
              ? "Your existing data is unchanged; free up space and try again."
              : "Your browser also refused to restore the previous data. Keep your backup file and try again."
          }`,
          "error",
          10000,
        );
        if (!result.rolledBack) {
          refreshWatchlist();
          refreshWatched();
          refreshProgress();
        }
        return;
      }

      refreshWatchlist();
      refreshWatched();
      refreshProgress();

      setPending(null);
      toast.showToast("Backup restored", "success");
    } catch (error) {
      console.error("Error restoring backup:", error);
      toast.showToast("Could not restore that backup", "error");
    } finally {
      restoring.current = false;
      setIsRestoring(false);
    }
  }

  const isReadingStorage =
    isWatchlistLoading || isWatchedLoading || isProgressLoading;

  // Counted once per change to the displayed stores rather than once per render: building
  // the backup walks every store and re-parses the ones held only in storage,
  // and this component also re-renders as profiles are added or removed.
  const current = useMemo(
    () =>
      summarizeBackup(
        buildBackup({
          stores: {
            ...liveStores(),
            watchlist,
            watched,
            episodeProgress: progress,
            ratings,
            collections,
          },
          activeProfile: null,
          otherProfiles: [],
          settings: {
            region: null,
            watchProviderFilter: null,
            selectedProviderIds: [],
          },
          exportedAt: "",
        }),
      ),
    [watchlist, watched, progress, ratings, collections],
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
            {otherProfileCount > 0 &&
              ` The backup also carries ${otherProfileCount} other profile${
                otherProfileCount === 1 ? "" : "s"
              }.`}
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          disabled={isExporting || isReadingStorage || isRestoring}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {isExporting ? "Preparing…" : "Download backup"}
        </button>

        <button
          onClick={() => {
            fileProfileId.current = watchlistProfileId;
            fileInputRef.current?.click();
          }}
          disabled={isRestoring}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Restore from file
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          disabled={isRestoring}
          className="sr-only"
          aria-label="Choose a backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {readingFilename !== null && (
        <p role="status" className="text-sm text-gray-400 break-all">
          Reading {readingFilename}…
        </p>
      )}

      {pending && (
        <RestoreConfirmation
          filename={pending.filename}
          summary={summarizeBackup(pending.data)}
          replacesProfiles={pending.data.activeProfile !== null}
          exportedAt={pending.data.exportedAt}
          isRestoring={isRestoring}
          onConfirm={confirmRestore}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

function RestoreConfirmation({
  filename,
  summary,
  replacesProfiles,
  exportedAt,
  isRestoring,
  onConfirm,
  onCancel,
}: {
  filename: string;
  summary: BackupSummary;
  replacesProfiles: boolean;
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

      <p className="text-sm text-amber-100/80 break-all">
        File: <strong>{filename}</strong>
      </p>

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

      {replacesProfiles && (
        <p className="text-sm text-amber-100/80 leading-relaxed">
          This will replace all profiles in this browser. Profiles absent from
          the backup and all their data will be deleted.
          {summary.otherProfiles > 0 && (
            <>
              {" "}The backup also holds <strong>{summary.otherProfiles}</strong>{" "}
              other profile{summary.otherProfiles === 1 ? "" : "s"}.
            </>
          )}
        </p>
      )}

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
