"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/i18n/Link";
import { AlertTriangle, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { applyImport, type ImportCounts, type ImportOutcome, type ImportStore } from "@/lib/import/apply";
import { parseExport, wantedFromArchive } from "@/lib/import/formats";
import { resolveEntries } from "@/lib/import/resolve";
import { capEntries, summariseEntries } from "@/lib/import/summary";
import { IMPORT_SOURCE_NAMES, type ImportEntry, type ImportFile, type ParsedExport } from "@/lib/import/types";
import { ZipError, isZip, readZip, tooLargeMessage } from "@/lib/import/zip";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatList, formatNumber, pluralForm, type PluralForms } from "@/i18n/format";
import type { Locale, Localized } from "@/i18n/locale";

/** The largest file read: an export with a decade of history is a few megabytes. */
const MAX_FILE_BYTES = 200 * 1024 * 1024;
/** Titles that could not be matched, named in the result before "and N more". */
const UNMATCHED_SHOWN = 25;

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "ready"; parsed: ParsedExport; entries: ImportEntry[]; dropped: number; profileId: string }
  | { kind: "matching"; done: number; total: number }
  | {
      kind: "done";
      outcome: ImportOutcome;
      unmatched: ImportEntry[];
      /** Titles TMDB did not answer for. */
      failed: number;
    }
  | { kind: "error"; message: string };

/**
 * The files to read out of what the visitor chose: each plain file as it is,
 * and out of each archive only the files an importer knows (`wantedFromArchive`)
 * – the rest of an export is the account's profile and devices, and is never
 * inflated.
 */
async function collectFiles(chosen: File[], locale: Locale): Promise<ImportFile[]> {
  const files: ImportFile[] = [];
  for (const file of chosen) {
    if (file.size > MAX_FILE_BYTES) {
      throw new ZipError(tooLargeMessage(file.name, locale));
    }
    const head = await file.slice(0, 4).arrayBuffer();
    if (isZip(head)) {
      for (const entry of readZip(await file.arrayBuffer(), locale)) {
        if (wantedFromArchive(entry.name)) files.push({ name: entry.name, text: entry.text });
      }
    } else {
      files.push({ name: file.name, text: () => file.text() });
    }
  }
  return files;
}

/** "3 titles" – an English count and its noun. */
function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count, "en")} ${count === 1 ? one : many}`;
}

/** The Czech form for a count: one, two to four, or five and up (`pluralForm`). */
function formCs(count: number, forms: PluralForms["cs"]): string {
  return pluralForm(count, "cs", { en: [forms[0], forms[2]], cs: forms });
}

/**
 * "3 tituly" – a Czech count and its noun. The forms may run on past the noun
 * – "titul přidán", "tituly přidány", "titulů přidáno" – where the rest of the
 * phrase agrees with the count too.
 */
function plural3(count: number, forms: PluralForms["cs"]): string {
  return `${formatNumber(count, "cs")} ${formCs(count, forms)}`;
}

const TITLES_CS: PluralForms["cs"] = ["titul", "tituly", "titulů"];
const SERIES_CS: PluralForms["cs"] = ["seriál", "seriály", "seriálů"];
const RATINGS_CS: PluralForms["cs"] = ["hodnocení", "hodnocení", "hodnocení"];

/** "and 3 more" after a list cut short: "a 3 další", but "a dalších 7". */
function andMoreCs(count: number): string {
  const number = formatNumber(count, "cs");
  return count >= 1 && count <= 4 ? `a ${number} další` : `a dalších ${number}`;
}

/** What `outcome.saved` names, as the visitor reads it. English shows the store's own name. */
const IMPORT_STORE_NAMES: Record<ImportStore, Localized> = {
  watched: { en: "watched", cs: "zhlédnuté" },
  ratings: { en: "ratings", cs: "hodnocení" },
  episodes: { en: "episodes", cs: "epizody" },
  watchlist: { en: "watchlist", cs: "seznam" },
};

function describeEntry(entry: ImportEntry, locale: Locale): string {
  const { title, year, imdbId } = entry.ref;
  return title
    ? `${title}${year ? ` (${year})` : ""}`
    : (imdbId ?? (locale === "cs" ? "Položka bez názvu" : "An untitled entry"));
}

/**
 * Brings a watchlist, a history, scores and ticked episodes in from another
 * service's export.
 *
 * Three steps, each waiting on the visitor: choose the file and see what is in
 * it; start the import and watch the titles being matched; read what happened.
 * Nothing is written until every title has been looked up, and what is written
 * only ever adds (`apply.ts`) – so stopping half-way, or running it twice,
 * costs nothing.
 */
export function ImportData() {
  const { profileId, refreshWatchlist } = useWatchlist();
  const { refreshWatched } = useWatched();
  const { refreshProgress } = useEpisodeProgress();
  const locale = useLocale();
  const t = useT();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const matching = useRef<AbortController | null>(null);
  /** Bumped by every start-over, so a slow read or match that finishes late is dropped. */
  const run = useRef(0);

  // Leaving the page stops the lookups; nothing has been written yet.
  useEffect(() => () => matching.current?.abort(), []);

  // Each step replaces the last one's controls, so focus would fall back to the
  // page. It goes to the step's heading instead, which is also what says what
  // just happened.
  useEffect(() => {
    if (phase.kind === "ready" || phase.kind === "done" || phase.kind === "error") {
      headingRef.current?.focus();
    }
  }, [phase.kind]);

  function reset() {
    run.current += 1;
    matching.current?.abort();
    matching.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setPhase({ kind: "idle" });
  }

  async function handleFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    const current = ++run.current;
    setPhase({ kind: "reading" });

    try {
      const parsed = await parseExport(await collectFiles(chosen, locale));
      if (current !== run.current) return;

      if (parsed.entries.length === 0) {
        const named = `${parsed.unrecognised.slice(0, 3).join(", ")}${parsed.unrecognised.length > 3 ? ", …" : ""}`;
        setPhase({
          kind: "error",
          message:
            parsed.unrecognised.length > 0
              ? t(
                  `Nothing here looks like an export from Letterboxd, IMDb, Trakt or TV Time (${named}).`,
                  `Nic z toho nevypadá jako export z Letterboxd, IMDb, Trakt ani TV Time (${named}).`,
                )
              : t(
                  "That export has no watchlist, history, ratings or episodes in it.",
                  "Tento export neobsahuje žádný seznam, historii, hodnocení ani epizody.",
                ),
        });
        return;
      }

      const { entries, dropped } = capEntries(parsed.entries);
      setPhase({ kind: "ready", parsed, entries, dropped, profileId });
    } catch (error) {
      if (current !== run.current) return;
      console.error("Error reading an export:", error);
      setPhase({
        kind: "error",
        message:
          error instanceof ZipError
            ? error.message
            : t(
                "That file could not be read. If it is a ZIP, try unzipping it and choosing the files inside.",
                "Soubor se nepodařilo přečíst. Pokud je to ZIP, zkuste ho rozbalit a vybrat soubory, které obsahuje.",
              ),
      });
    }
  }

  async function runImport(entries: ImportEntry[], owner: string) {
    const current = ++run.current;
    const controller = new AbortController();
    matching.current = controller;
    setPhase({ kind: "matching", done: 0, total: entries.length });

    try {
      const { resolved, unmatched, failed } = await resolveEntries(entries, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (current === run.current) setPhase({ kind: "matching", done, total });
        },
      });
      if (current !== run.current) return;

      const outcome = await applyImport(owner, resolved);
      if (current !== run.current) return;

      // The lists were written from outside their contexts.
      refreshWatchlist();
      refreshWatched();
      refreshProgress();
      setPhase({ kind: "done", outcome, unmatched, failed: failed.length });
    } catch (error) {
      if (current !== run.current || controller.signal.aborted) return;
      console.error("Error importing:", error);
      setPhase({
        kind: "error",
        message: t(
          "The import stopped before anything was saved. Check your connection and try again.",
          "Import se zastavil dřív, než se cokoli uložilo. Zkontrolujte připojení a zkuste to znovu.",
        ),
      });
    } finally {
      if (matching.current === controller) matching.current = null;
    }
  }

  return (
    <section
      aria-labelledby="import-heading"
      className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-5"
    >
      <div>
        <h2 id="import-heading" className="text-xl font-semibold text-white flex items-center gap-2">
          <FileUp className="w-5 h-5 text-blue-400" aria-hidden="true" />
          {t("Choose your export", "Vyberte svůj export")}
        </h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          {t(
            "The ZIP as you downloaded it, or the CSV and JSON files from inside it. Several at once is fine.",
            "Soubor ZIP tak, jak jste ho stáhli, nebo soubory CSV a JSON z něj. Klidně několik najednou.",
          )}
        </p>
      </div>

      {(phase.kind === "idle" || phase.kind === "reading" || phase.kind === "error") && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={phase.kind === "reading"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <FileUp className="w-4 h-4" aria-hidden="true" />
            {phase.kind === "reading" ? t("Reading…", "Načítání…") : t("Choose files", "Vybrat soubory")}
          </button>
          {/* Reached only through the button above, like the backup picker. */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".zip,.csv,.json,application/zip,text/csv,application/json"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            aria-label={t("Choose export files", "Vybrat soubory exportu")}
            onChange={(event) => handleFiles([...(event.target.files ?? [])])}
          />
        </>
      )}

      {phase.kind === "error" && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-semibold text-red-200 flex items-center gap-2 focus:outline-none"
          >
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {t("Nothing was imported", "Nic se neimportovalo")}
          </h3>
          <p className="text-sm text-red-100/80 mt-1 leading-relaxed">{phase.message}</p>
        </div>
      )}

      {phase.kind === "ready" && (
        <ReadyStep
          phase={phase}
          headingRef={headingRef}
          onImport={() => runImport(phase.entries, phase.profileId)}
          onCancel={reset}
        />
      )}

      {phase.kind === "matching" && (
        <div className="space-y-3">
          <p role="status" className="text-sm text-gray-300">
            {t("Matching titles with TMDB…", "Dohledávání titulů na TMDB…")}{" "}
            {formatNumber(phase.done, locale)} {t("of", "z")}{" "}
            {formatNumber(phase.total, locale)}
          </p>
          <div
            role="progressbar"
            aria-label={t("Titles matched", "Dohledané tituly")}
            aria-valuemin={0}
            aria-valuemax={phase.total}
            aria-valuenow={phase.done}
            className="h-2 rounded-full bg-gray-800 overflow-hidden"
          >
            <div
              className="h-full bg-blue-500 transition-[width]"
              style={{ width: `${phase.total > 0 ? (phase.done / phase.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm text-gray-400">
            {t(
              "Nothing is saved until every title has been matched.",
              "Dokud se nedohledají všechny tituly, nic se neuloží.",
            )}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {t("Cancel", "Zrušit")}
          </button>
        </div>
      )}

      {phase.kind === "done" && (
        <DoneStep phase={phase} headingRef={headingRef} onAgain={reset} />
      )}

      <p className="text-sm text-gray-400 flex gap-2 leading-relaxed">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-400" aria-hidden="true" />
        <span>
          {t(
            "The file is read here, in your browser, and is not uploaded. To match a title, its name or ID is looked up at TMDB – the same service every page here already asks. Only your lists are read; an export's profile and account details are not opened.",
            "Soubor se čte tady ve vašem prohlížeči a nikam se nenahrává. Aby se titul dohledal, vyhledá se jeho název nebo ID na TMDB – ve stejné službě, které se ptá každá stránka tady. Čtou se jen vaše seznamy; profil a údaje o účtu z exportu se neotevírají.",
          )}
        </span>
      </p>
    </section>
  );
}

function ReadyStep({
  phase,
  headingRef,
  onImport,
  onCancel,
}: {
  phase: Extract<Phase, { kind: "ready" }>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onImport: () => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = useT();
  const { parsed, entries, dropped } = phase;
  const summary = summariseEntries(entries);
  const sourceNames = parsed.sources.map((source) => IMPORT_SOURCE_NAMES[source]);
  const sources = sourceNames.join(" and ");

  const lines = (locale === "cs"
    ? [
        summary.toWatch > 0 && `${plural3(summary.toWatch, TITLES_CS)} na váš seznam`,
        summary.watched > 0 &&
          plural3(summary.watched, ["zhlédnutý titul", "zhlédnuté tituly", "zhlédnutých titulů"]),
        summary.ratings > 0 && plural3(summary.ratings, RATINGS_CS),
        // "ve 2 seriálech", but "v 5 seriálech": a preposition before a
        // number changes with how the number is read, so the series go in
        // brackets instead.
        summary.shows > 0 &&
          `${plural3(summary.episodes, ["zhlédnutá epizoda", "zhlédnuté epizody", "zhlédnutých epizod"])} (${plural3(summary.shows, SERIES_CS)})`,
      ]
    : [
        summary.toWatch > 0 && `${plural(summary.toWatch, "title", "titles")} for your watchlist`,
        summary.watched > 0 && `${plural(summary.watched, "watched title", "watched titles")}`,
        summary.ratings > 0 && `${plural(summary.ratings, "score", "scores")}`,
        summary.shows > 0 &&
          `${plural(summary.episodes, "watched episode", "watched episodes")} across ${plural(summary.shows, "series", "series")}`,
      ]
  ).filter((line): line is string => Boolean(line));

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <h3 ref={headingRef} tabIndex={-1} className="font-semibold text-white focus:outline-none">
        {locale === "cs"
          ? `Nalezeno ve vašem exportu z ${formatList(sourceNames, locale)}`
          : `Found in your ${sources} export`}
      </h3>
      <ul className="list-disc pl-5 text-sm text-gray-200 space-y-1">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {dropped > 0 && (
        <p className="text-sm text-amber-200/90 leading-relaxed">
          {locale === "cs" ? (
            <>
              To je víc, než jeden import dokáže dohledat. Import proto zahrne{" "}
              {plural3(entries.length, TITLES_CS)} z výše uvedených – nejdřív to,
              co teprve chcete vidět, potom vaši nejnovější historii – a{" "}
              {plural3(dropped, ["starší titul", "starší tituly", "starších titulů"])}{" "}
              vynechá.
            </>
          ) : (
            <>
              That is more than one import can match. The{" "}
              {formatNumber(entries.length, "en")} listed above go in – what you
              still mean to watch first, then your most recent history – and{" "}
              {plural(dropped, "older title is", "older titles are")} left out.
            </>
          )}
        </p>
      )}
      {parsed.skippedRows > 0 && (
        <p className="text-sm text-gray-400 leading-relaxed">
          {locale === "cs" ? (
            <>
              {plural3(parsed.skippedRows, [
                "řádek se vynechá, protože tu pro něj není místo",
                "řádky se vynechají, protože tu pro ně není místo",
                "řádků se vynechá, protože tu pro ně není místo",
              ])}
              : jednotlivě hodnocené epizody, speciály, videohry.
            </>
          ) : (
            <>
              {plural(parsed.skippedRows, "row is", "rows are")} left out because
              there is nowhere to put {parsed.skippedRows === 1 ? "it" : "them"}{" "}
              here: single rated episodes, specials, video games.
            </>
          )}
        </p>
      )}
      {parsed.unrecognised.length > 0 && (
        <p className="text-sm text-gray-400 leading-relaxed break-all">
          {t("Not read:", "Nepřečteno:")} {parsed.unrecognised.slice(0, 5).join(", ")}
          {parsed.unrecognised.length > 5 &&
            (locale === "cs"
              ? ` ${andMoreCs(parsed.unrecognised.length - 5)}`
              : ` and ${parsed.unrecognised.length - 5} more`)}
          .
        </p>
      )}
      <p className="text-sm text-gray-400 leading-relaxed">
        {t(
          "These are added to the profile you are using now. Nothing already here is removed or changed, except that a title the export says you have watched leaves your watchlist.",
          "Přidají se k profilu, který právě používáte. Nic z toho, co tu už máte, se neodstraní ani nezmění – jen titul, který jste podle exportu už viděli, zmizí z vašeho seznamu.",
        )}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onImport}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {locale === "cs"
            ? `Importovat ${plural3(entries.length, TITLES_CS)}`
            : `Import ${plural(entries.length, "title", "titles")}`}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {t("Cancel", "Zrušit")}
        </button>
      </div>
    </div>
  );
}

function countLines(counts: ImportCounts, locale: Locale): string[] {
  if (locale === "cs") return countLinesCs(counts);
  return [
    counts.watchlistAdded > 0 && `${plural(counts.watchlistAdded, "title", "titles")} added to your watchlist`,
    counts.watchedAdded > 0 && `${plural(counts.watchedAdded, "title", "titles")} added to your watched history`,
    counts.ratingsAdded > 0 && `${plural(counts.ratingsAdded, "score", "scores")} recorded`,
    counts.episodesTicked > 0 &&
      `${plural(counts.episodesTicked, "episode", "episodes")} ticked across ${plural(counts.showsTracked, "series", "series")}`,
    counts.movedOffWatchlist > 0 &&
      `${plural(counts.movedOffWatchlist, "title", "titles")} moved off your watchlist, now that ${counts.movedOffWatchlist === 1 ? "it is" : "they are"} watched`,
    counts.ratingsKept > 0 &&
      `${plural(counts.ratingsKept, "score", "scores")} left as you gave ${counts.ratingsKept === 1 ? "it" : "them"} here`,
    counts.watchlistFull + counts.watchedFull > 0 &&
      `${plural(counts.watchlistFull + counts.watchedFull, "title", "titles")} did not fit: a list holds 2,000`,
  ].filter((line): line is string => Boolean(line));
}

/**
 * The same lines in Czech, where the participle agrees with the count as well
 * as the noun – "1 titul přidán", "2 tituly přidány", "5 titulů přidáno".
 */
function countLinesCs(counts: ImportCounts): string[] {
  const full = counts.watchlistFull + counts.watchedFull;
  return [
    counts.watchlistAdded > 0 &&
      plural3(counts.watchlistAdded, [
        "titul přidán na váš seznam",
        "tituly přidány na váš seznam",
        "titulů přidáno na váš seznam",
      ]),
    counts.watchedAdded > 0 &&
      plural3(counts.watchedAdded, [
        "titul přidán mezi zhlédnuté",
        "tituly přidány mezi zhlédnuté",
        "titulů přidáno mezi zhlédnuté",
      ]),
    counts.ratingsAdded > 0 &&
      plural3(counts.ratingsAdded, ["hodnocení uloženo", "hodnocení uložena", "hodnocení uloženo"]),
    counts.episodesTicked > 0 &&
      `${plural3(counts.episodesTicked, ["epizoda odškrtnuta", "epizody odškrtnuty", "epizod odškrtnuto"])} (${plural3(counts.showsTracked, SERIES_CS)})`,
    counts.movedOffWatchlist > 0 &&
      plural3(counts.movedOffWatchlist, [
        "titul přesunut ze seznamu mezi zhlédnuté",
        "tituly přesunuty ze seznamu mezi zhlédnuté",
        "titulů přesunuto ze seznamu mezi zhlédnuté",
      ]),
    counts.ratingsKept > 0 &&
      plural3(counts.ratingsKept, [
        "hodnocení ponecháno tak, jak jste ho tu zadali",
        "hodnocení ponechána tak, jak jste je tu zadali",
        "hodnocení ponecháno tak, jak jste je tu zadali",
      ]),
    full > 0 &&
      `${plural3(full, ["titul se nevešel", "tituly se nevešly", "titulů se nevešlo"])} – seznam pojme nejvýš ${formatNumber(2000, "cs")}`,
  ].filter((line): line is string => Boolean(line));
}

function DoneStep({
  phase,
  headingRef,
  onAgain,
}: {
  phase: Extract<Phase, { kind: "done" }>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAgain: () => void;
}) {
  const locale = useLocale();
  const t = useT();
  const { outcome, unmatched, failed } = phase;
  const stored = outcome.status === "ok" || outcome.status === "partial";
  const lines = stored ? countLines(outcome.counts, locale) : [];

  const failure: Record<Exclude<ImportOutcome["status"], "ok" | "partial">, string> = {
    "profile-unavailable": t(
      "The profile this import was started for is no longer there. Reload the page and import again.",
      "Profil, pro který se import spustil, už neexistuje. Načtěte stránku znovu a import zopakujte.",
    ),
    unreadable: t(
      "One of the lists already in this browser could not be read, so nothing was added to avoid overwriting it. Download a backup from your profile page first.",
      "Jeden ze seznamů, které už v tomto prohlížeči jsou, se nepodařilo přečíst, a aby se nepřepsal, nic se nepřidalo. Nejdřív si na stránce profilu stáhněte zálohu.",
    ),
    failed: t(
      "This browser would not store the import – it may be out of space, or in a private window that stores nothing.",
      "Tento prohlížeč import neuložil – možná mu došlo místo, nebo jde o anonymní okno, které nic neukládá.",
    ),
  };

  return (
    <div
      className={
        stored
          ? "rounded-lg border border-green-500/40 bg-green-500/10 p-4 space-y-3"
          : "rounded-lg border border-red-500/40 bg-red-500/10 p-4 space-y-3"
      }
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold text-white flex items-center gap-2 focus:outline-none"
      >
        {stored ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-red-300" aria-hidden="true" />
        )}
        {outcome.status === "ok"
          ? lines.length > 0
            ? t("Imported", "Importováno")
            : t("Everything in that export was already here", "Vše z tohoto exportu tu už bylo")
          : outcome.status === "partial"
            ? t("Partly imported", "Importováno jen zčásti")
            : t("Nothing was imported", "Nic se neimportovalo")}
      </h3>

      {!stored && <p className="text-sm text-red-100/80 leading-relaxed">{failure[outcome.status]}</p>}

      {outcome.status === "partial" && (
        <p className="text-sm text-amber-100/90 leading-relaxed">
          {locale === "cs" ? (
            <>
              Prohlížeči v půlce došlo místo. Uloženo:{" "}
              {formatList(outcome.saved.map((store) => IMPORT_STORE_NAMES[store].cs), locale)}.
              Zbytek ne – uvolněte trochu místa a naimportujte stejný soubor
              znovu; co už tu je, se přeskočí.
            </>
          ) : (
            <>
              The browser ran out of room part-way. Saved:{" "}
              {outcome.saved.map((store) => IMPORT_STORE_NAMES[store].en).join(", ")}.
              The rest was not – free some space and import the same file again;
              what is already here is skipped.
            </>
          )}
        </p>
      )}

      {lines.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-gray-100 space-y-1">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {failed > 0 && (
        <p className="text-sm text-amber-100/90 leading-relaxed">
          {locale === "cs" ? (
            <>
              U {plural3(failed, ["titulu", "titulů", "titulů"])} nepřišla z TMDB
              odpověď. Naimportujte stejný soubor znovu a doplní se.
            </>
          ) : (
            <>
              TMDB did not answer for {plural(failed, "title", "titles")}. Import
              the same file again to pick {failed === 1 ? "it" : "them"} up.
            </>
          )}
        </p>
      )}

      {unmatched.length > 0 && (
        <div>
          <p className="text-sm text-gray-200">
            {locale === "cs"
              ? `Na TMDB se ${formCs(unmatched.length, ["nenašel", "nenašly", "nenašlo"])} ${plural3(unmatched.length, TITLES_CS)}:`
              : `${plural(unmatched.length, "title was", "titles were")} not found on TMDB:`}
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-400 space-y-0.5">
            {unmatched.slice(0, UNMATCHED_SHOWN).map((entry, index) => (
              <li key={index}>{describeEntry(entry, locale)}</li>
            ))}
            {unmatched.length > UNMATCHED_SHOWN && (
              <li>
                {locale === "cs"
                  ? andMoreCs(unmatched.length - UNMATCHED_SHOWN)
                  : `and ${formatNumber(unmatched.length - UNMATCHED_SHOWN, "en")} more`}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        {stored && (
          <>
            <Link
              href="/watchlist"
              prefetch={false}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {t("Open your watchlist", "Otevřít seznam")}
            </Link>
            <Link
              href="/stats"
              prefetch={false}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {t("See your stats", "Zobrazit statistiky")}
            </Link>
          </>
        )}
        <button
          onClick={onAgain}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {t("Import another file", "Importovat další soubor")}
        </button>
      </div>
    </div>
  );
}
