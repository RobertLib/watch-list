"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import Link from "@/i18n/Link";
import { Download, Upload, AlertTriangle, ShieldCheck } from "lucide-react";
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
  subscribeProfiles,
} from "@/lib/profiles";
import {
  backupFilename,
  buildBackup,
  describeUnreadable,
  MAX_BACKUP_FILE_BYTES,
  parseBackup,
  readBackupSnapshot,
  summarizeBackup,
  type BackupSummary,
  type PortableData,
  type PortableStores,
  type UnreadableData,
} from "@/lib/portable-data";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatNumber, pluralForm, type PluralForms } from "@/i18n/format";
import { INTL_LOCALE, t as translate, type Locale } from "@/i18n/locale";

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
    // Not counted in the summary; the export reads the stored stamp itself.
    lastVisit: null,
  };
}

const MAX_BACKUP_FILE_MEGABYTES = Math.round(MAX_BACKUP_FILE_BYTES / (1024 * 1024));

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

function checkRestoreProfile(profileId: string, locale: Locale): boolean {
  try {
    if (getActiveProfileId({ strict: true }) === profileId) return true;
  } catch {
    toast.showToast(
      translate(
        locale,
        "Could not check your active profile. Reload the page and try again.",
        "Nepodařilo se ověřit aktivní profil. Načtěte stránku znovu a zkuste to ještě jednou.",
      ),
      "error",
    );
    return false;
  }

  toast.showToast(
    translate(
      locale,
      "Your active profile changed. Choose the backup file again for the current profile.",
      "Aktivní profil se změnil. Vyberte soubor se zálohou znovu, tentokrát pro aktuální profil.",
    ),
    "info",
  );
  return false;
}

/** A Czech count's noun: one, two to four, or five and up (`pluralForm`). */
function formCs(count: number, forms: PluralForms["cs"]): string {
  return pluralForm(count, "cs", { en: [forms[0], forms[2]], cs: forms });
}

/** "3 rozkoukané seriály" – a Czech count and its noun. */
function countCs(count: number, forms: PluralForms["cs"]): string {
  return `${formatNumber(count, "cs")} ${formCs(count, forms)}`;
}

const SHOWS_IN_PROGRESS_CS: PluralForms["cs"] = [
  "rozkoukaný seriál",
  "rozkoukané seriály",
  "rozkoukaných seriálů",
];
const TICKED_EPISODES_CS: PluralForms["cs"] = [
  "odškrtnutá epizoda",
  "odškrtnuté epizody",
  "odškrtnutých epizod",
];
const LISTS_CS: PluralForms["cs"] = ["vlastní seznam", "vlastní seznamy", "vlastních seznamů"];
const OTHER_PROFILES_CS: PluralForms["cs"] = ["další profil", "další profily", "dalších profilů"];

/**
 * The day a backup was exported. English has always printed the ISO date; in
 * Czech it is the usual "1. 8. 2026". The day is the file's own, in UTC, so it
 * is the same day wherever the file is read.
 */
function exportedDay(exportedAt: string, locale: Locale): string {
  const day = exportedAt.slice(0, 10);
  if (locale === "en") return day;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString(INTL_LOCALE[locale], { timeZone: "UTC" });
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
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const fileProfileId = useRef<string | null>(null);
  const fileReadGeneration = useRef(0);
  const [readingFilename, setReadingFilename] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [exportGaps, setExportGaps] = useState<UnreadableData[]>([]);
  const restoring = useRef(false);
  const exporting = useRef(false);
  const locale = useLocale();
  const t = useT();

  async function handleExport() {
    if (exporting.current || restoring.current) return;
    exporting.current = true;
    setIsExporting(true);
    try {
      // Read the complete snapshot under the same origin-wide lock as edits,
      // profile switches and restores. Even its roster must be read after a
      // queued restore finishes; otherwise a backup can mix two generations.
      const backup = await withProfileRosterLock<PortableData | null>(
        () => readBackupSnapshot(new Date().toISOString()),
        null,
      );
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

      // A file that looks complete but is not is how the only copy of
      // something gets deleted with confidence. Name every gap, here and in
      // the panel below, which stays until the next export.
      const gaps = backup.unreadable ?? [];
      setExportGaps(gaps);
      if (gaps.length > 0) {
        const described = gaps.map((gap) => describeUnreadable(gap, locale)).join("; ");
        toast.showToast(
          t(
            `Backup downloaded, but some data could not be read: ${described}.`,
            `Záloha je stažená, ale některá data se nepodařilo přečíst: ${described}.`,
          ),
          "error",
          10000,
        );
      } else {
        toast.showToast(t("Backup downloaded", "Záloha je stažená"), "success");
      }
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.showToast(t("Could not build the backup", "Zálohu se nepodařilo vytvořit"), "error");
    } finally {
      exporting.current = false;
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
      // Checked before reading: `file.text()` holds the whole file in memory and
      // JSON.parse then blocks the page on it, so picking a video by mistake
      // used to freeze the tab instead of being told it is the wrong file.
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        toast.showToast(
          t(
            `That file is too large to be a WatchList backup – backups stay under ${MAX_BACKUP_FILE_MEGABYTES} MB`,
            `Tento soubor je na zálohu WatchListu příliš velký – zálohy mají méně než ${formatNumber(MAX_BACKUP_FILE_MEGABYTES, locale)} MB`,
          ),
          "error",
        );
        return;
      }
      const text = await file.text();
      if (!isCurrent()) return;
      const parsed = parseBackup(JSON.parse(text));

      if (!parsed) {
        toast.showToast(
          t("That is not a WatchList backup file", "Tohle není soubor se zálohou WatchListu"),
          "error",
        );
        return;
      }

      if (!parsed.activeProfile && !checkRestoreProfile(profileId, locale)) {
        setPending(null);
        return;
      }

      // Held rather than applied: replacing a list is destructive, so the counts
      // are shown first and the visitor confirms against them.
      setPending({ data: parsed, profileId, filename: file.name, selection });
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Error reading backup:", error);
      toast.showToast(t("Could not read that file", "Soubor se nepodařilo přečíst"), "error");
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
    if (!pending.data.activeProfile && !checkRestoreProfile(pending.profileId, locale)) {
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
        let currentProfiles: { id: string; name: string }[] = [];
        try {
          currentProfiles = getProfiles();
        } catch {
          // Names from the file still label most refusals.
        }
        const label = restoreFailureLabel(result.key, {
          activeProfileId: pending.data.activeProfile?.id ?? pending.profileId,
          // The file's names first: they are the ones the visitor just read.
          profiles: [
            ...(pending.data.activeProfile ? [pending.data.activeProfile] : []),
            ...pending.data.otherProfiles,
            ...currentProfiles,
          ],
        }, locale);
        toast.showToast(
          locale === "cs"
            ? `Nepodařilo se obnovit ${label} – prohlížeč odmítl zápis. ${
                result.rolledBack
                  ? "Vaše dosavadní data zůstala beze změny; uvolněte místo a zkuste to znovu."
                  : "Prohlížeč odmítl vrátit i předchozí data. Soubor se zálohou si ponechte a zkuste to znovu."
              }`
            : `Could not restore ${label} — your browser refused the write. ${
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
      toast.showToast(t("Backup restored", "Záloha je obnovená"), "success");
    } catch (error) {
      console.error("Error restoring backup:", error);
      toast.showToast(t("Could not restore that backup", "Zálohu se nepodařilo obnovit"), "error");
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
          {t("Backup & transfer", "Záloha a přenos")}
        </h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          {t(
            "WatchList keeps no account, so everything you save lives in this browser only. Download a backup to keep it safe – or to move it to another device.",
            "WatchList nemá účty, takže vše, co si uložíte, je jen v tomto prohlížeči. Stáhněte si zálohu, ať o nic nepřijdete – nebo ať můžete data přenést do jiného zařízení.",
          )}
        </p>
        {/* A backup is this app's own file. A list kept somewhere else is a
            different thing, and has its own page. */}
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          {locale === "cs" ? (
            <>
              Přecházíte z Letterboxd, IMDb, Trakt nebo TV Time? Pak raději{" "}
              <Link
                href="/import"
                prefetch={false}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                importujte své seznamy
              </Link>
              .
            </>
          ) : (
            <>
              Coming from Letterboxd, IMDb, Trakt or TV Time?{" "}
              <Link
                href="/import"
                prefetch={false}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Import your lists
              </Link>{" "}
              instead.
            </>
          )}
        </p>
      </div>

      {/* Withheld until storage has been read: the counts start at zero, and
          "0 to watch" next to a backup button reads as "there is nothing to back
          up" rather than as "still loading". */}
      <p className="text-sm text-gray-500">
        {isReadingStorage ? (
          <span className="inline-block h-4 w-72 max-w-full bg-gray-800 rounded animate-pulse align-middle" />
        ) : locale === "cs" ? (
          <>
            V tomto prohlížeči: ke zhlédnutí {formatNumber(current.watchlist, locale)},
            zhlédnuto {formatNumber(current.watched, locale)},{" "}
            {countCs(current.showsInProgress, SHOWS_IN_PROGRESS_CS)} (
            {countCs(current.episodes, TICKED_EPISODES_CS)}), ohodnoceno{" "}
            {formatNumber(current.ratings, locale)}
            {current.collections > 0 && `, ${countCs(current.collections, LISTS_CS)}`}
            .
            {otherProfileCount > 0 &&
              ` Záloha zahrne i ${countCs(otherProfileCount, OTHER_PROFILES_CS)}.`}
          </>
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
        {/* The button keeps focus while the backup is built: native `disabled`
            would blur the very control that was just pressed. */}
        <button
          onClick={handleExport}
          disabled={isReadingStorage || isRestoring}
          aria-disabled={isExporting || undefined}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 aria-disabled:opacity-60 aria-disabled:cursor-wait text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {isExporting ? t("Preparing…", "Připravuje se…") : t("Download backup", "Stáhnout zálohu")}
        </button>

        <button
          ref={restoreButtonRef}
          onClick={() => {
            fileProfileId.current = watchlistProfileId;
            fileInputRef.current?.click();
          }}
          disabled={isRestoring}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          {t("Restore from file", "Obnovit ze souboru")}
        </button>

        {/* Reached only through the button above. As a Tab stop of its own it
            was a second, invisible control for the same picker – focusable,
            announced, and showing no focus at all. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          disabled={isRestoring}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          aria-label={t("Choose a backup file", "Vybrat soubor se zálohou")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {readingFilename !== null && (
        <p role="status" className="text-sm text-gray-400 break-all">
          {t("Reading", "Načítá se")} {readingFilename}…
        </p>
      )}

      {exportGaps.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 space-y-2">
          <h3 className="font-semibold text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {t("Not in your last backup", "Chybí ve vaší poslední záloze")}
          </h3>
          <p className="text-sm text-red-100/80 leading-relaxed">
            {t(
              "This browser could not read the following, so restoring that file will not bring them back:",
              "Následující data se v tomto prohlížeči nepodařilo přečíst, takže je obnovení z tohoto souboru nevrátí:",
            )}
          </p>
          <ul className="list-disc pl-5 text-sm text-red-100/80 space-y-1">
            {exportGaps.map((gap, index) => (
              <li key={index}>
                {describeUnreadable(gap, locale)}
                {gap.raw === null
                  ? t(" – the browser refused to read it", " – prohlížeč odmítl data přečíst")
                  : t(
                      " – the stored text is kept in the file as it was found",
                      " – uložený text je v souboru zachovaný tak, jak byl nalezen",
                    )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending && (
        <RestoreConfirmation
          filename={pending.filename}
          summary={summarizeBackup(pending.data)}
          replacesProfiles={pending.data.activeProfile !== null}
          exportedAt={pending.data.exportedAt}
          isRestoring={isRestoring}
          returnFocusTo={restoreButtonRef}
          onConfirm={confirmRestore}
          onCancel={() => {
            if (!restoring.current) setPending(null);
          }}
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
  returnFocusTo,
  onConfirm,
  onCancel,
}: {
  filename: string;
  summary: BackupSummary;
  replacesProfiles: boolean;
  exportedAt: string;
  isRestoring: boolean;
  returnFocusTo: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const locale = useLocale();
  const t = useT();

  // An alertdialog is announced when focus moves into it; one that appears
  // beside a file picker and is never focused is silent, and a keyboard user
  // is left on a control behind it. Focus starts on Cancel, the action that
  // cannot lose anything.
  useLayoutEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // When it closes, focus would otherwise fall back to the top of the page.
  // Checked once the dialog is gone: by then a refusal has finished and the
  // restore button is usable again. Focus the visitor moved elsewhere stays.
  useEffect(() => () => {
    const focused = document.activeElement;
    if (focused === null || focused === document.body) returnFocusTo.current?.focus();
  }, [returnFocusTo]);

  return (
    <div
      role="alertdialog"
      aria-labelledby="restore-heading"
      aria-describedby={replacesProfiles
        ? "restore-contents restore-replaces restore-warning"
        : "restore-contents restore-warning"}
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      <h3
        id="restore-heading"
        className="font-semibold text-amber-200 flex items-center gap-2"
      >
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        {t("Replace what is in this browser?", "Nahradit obsah tohoto prohlížeče?")}
      </h3>

      <p className="text-sm text-amber-100/80 break-all">
        {t("File:", "Soubor:")} <strong>{filename}</strong>
      </p>

      <p id="restore-contents" className="text-sm text-amber-100/80 leading-relaxed">
        {locale === "cs" ? (
          <>
            V této záloze je: ke zhlédnutí{" "}
            <strong>{formatNumber(summary.watchlist, locale)}</strong>, zhlédnuto{" "}
            <strong>{formatNumber(summary.watched, locale)}</strong>,{" "}
            <strong>{formatNumber(summary.showsInProgress, locale)}</strong>{" "}
            {formCs(summary.showsInProgress, SHOWS_IN_PROGRESS_CS)} (
            {countCs(summary.episodes, TICKED_EPISODES_CS)}), ohodnoceno{" "}
            <strong>{formatNumber(summary.ratings, locale)}</strong>
            {summary.collections > 0 && `, ${countCs(summary.collections, LISTS_CS)}`}
            {summary.hasSettings && " a k tomu vaše nastavení regionu a streamovacích služeb"}.
            {exportedAt && ` Exportováno ${exportedDay(exportedAt, locale)}.`}
          </>
        ) : (
          <>
            This backup holds <strong>{summary.watchlist}</strong> to watch,{" "}
            <strong>{summary.watched}</strong> watched and{" "}
            <strong>{summary.showsInProgress}</strong> series in progress (
            {summary.episodes} episode{summary.episodes === 1 ? "" : "s"} ticked) and{" "}
            <strong>{summary.ratings}</strong> rated
            {summary.collections > 0 &&
              `, ${summary.collections} named list${summary.collections === 1 ? "" : "s"}`}
            {summary.hasSettings && ", plus your region and platform settings"}.
            {exportedAt && ` Exported ${exportedDay(exportedAt, locale)}.`}
          </>
        )}
      </p>

      {replacesProfiles && (
        <p id="restore-replaces" className="text-sm text-amber-100/80 leading-relaxed">
          {locale === "cs" ? (
            <>
              Tím se nahradí všechny profily v tomto prohlížeči. Profily, které
              v záloze nejsou, se smažou i se všemi svými daty.
              {summary.otherProfiles > 0 && (
                <>
                  {" "}Záloha obsahuje také{" "}
                  <strong>{formatNumber(summary.otherProfiles, locale)}</strong>{" "}
                  {formCs(summary.otherProfiles, OTHER_PROFILES_CS)}.
                </>
              )}
            </>
          ) : (
            <>
              This will replace all profiles in this browser. Profiles absent from
              the backup and all their data will be deleted.
              {summary.otherProfiles > 0 && (
                <>
                  {" "}The backup also holds <strong>{summary.otherProfiles}</strong>{" "}
                  other profile{summary.otherProfiles === 1 ? "" : "s"}.
                </>
              )}
            </>
          )}
        </p>
      )}

      <p id="restore-warning" className="text-sm text-amber-100/80">
        {t(
          "Restoring replaces the lists in this browser. It cannot be undone – if you have anything here worth keeping, download a backup first.",
          "Obnovení nahradí seznamy v tomto prohlížeči a nejde vrátit zpět – pokud tu máte něco, o co nechcete přijít, nejdřív si stáhněte zálohu.",
        )}
      </p>

      {/* aria-disabled rather than disabled while restoring: native disabled
          blurs the pressed button, and a refused restore keeps this dialog up
          for a retry with focus nowhere. The handlers refuse a second press. */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onConfirm}
          aria-disabled={isRestoring || undefined}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 aria-disabled:opacity-60 aria-disabled:cursor-wait text-sm font-semibold text-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {isRestoring ? t("Restoring…", "Obnovuje se…") : t("Replace and restore", "Nahradit a obnovit")}
        </button>
        <button
          ref={cancelRef}
          onClick={onCancel}
          aria-disabled={isRestoring || undefined}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 aria-disabled:opacity-60 aria-disabled:cursor-wait text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {t("Cancel", "Zrušit")}
        </button>
      </div>
    </div>
  );
}
