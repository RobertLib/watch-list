"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Star,
  Trophy,
} from "lucide-react";
import { getRatingDuel, resolveRatingDuel } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { toast } from "@/components/Toast";
import {
  EMPTY_RECORD,
  HIGHER_LOWER_STORAGE_KEY,
  getRecord,
  recordRound,
  saveRecord,
  type HigherLowerRecord,
} from "@/lib/higher-lower";
import { getActiveProfileId, subscribeProfiles } from "@/lib/profiles";
import { isProfileStoreEvent, withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn } from "@/lib/utils";
import {
  isPoolExhausted,
  type DuelFilm,
  type RatedFilm,
} from "@/lib/rating-duel-data";
import { movieHref } from "@/lib/routes";

type Phase =
  | "loading"
  | "playing"
  /** A guess is being settled: the pair stays up, the choices wait. */
  | "judging"
  | "revealed"
  | "over"
  /** Every film in the pool has been shown: the run ends on a right answer. */
  | "complete"
  | "error"
  | "next-error";

/**
 * Higher or lower, on TMDB's average score.
 *
 * The daily puzzle is over in two minutes and then there is nothing to do until
 * tomorrow. This is what fills that gap: no schedule, no limit, and a record that
 * only moves by playing one more round.
 *
 * The UI reveals the challenger's score after the guess. Catalogue reads run in
 * the browser, so the game relies on the player's honour.
 */
export function HigherLowerGame() {
  const [champion, setChampion] = useState<RatedFilm | null>(null);
  const [challenger, setChallenger] = useState<DuelFilm | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [streak, setStreak] = useState(0);
  const [record, setRecord] = useState<HigherLowerRecord>(EMPTY_RECORD);
  // Only this tab's unsaved rounds: already persisted rounds belong to storage,
  // which may have advanced in another tab before the next result arrives.
  const pendingRecord = useRef<HigherLowerRecord>(EMPTY_RECORD);
  const profileId = useRef<string | null>(null);
  const runVersion = useRef(0);
  const pendingRoundVersion = useRef<number | null>(null);
  const isMounted = useRef(false);
  // Whether this run has saved a streak above the best that stood before it.
  // Comparing the final streak with `record.best` cannot say: the record is
  // raised as the run goes, so a run that only equalled the old best matched it
  // too and was congratulated on "a new best".
  const [beatBest, setBeatBest] = useState(false);

  // Each control that takes a click is replaced by the next one once the round
  // moves on, and focus would otherwise fall back to the page. `focusNext` says
  // where it goes when the next phase renders; set only by the player's own
  // clicks, so loading the page never pulls focus anywhere.
  const choicesRef = useRef<HTMLButtonElement>(null);
  const nextRoundRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"choices" | "result" | null>(null);

  // Everything already shown this run, so a long streak never repeats a film.
  const seen = useRef<number[]>([]);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    isMounted.current = true;
    const active = getActiveProfileId();
    profileId.current = active;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from
       a browser-only store, like every other stored record here */
    setRecord(withProfileStorage(active, getRecord));

    const refresh = () => {
      const active = getActiveProfileId();
      if (active !== profileId.current) {
        profileId.current = active;
        pendingRecord.current = EMPTY_RECORD;
        runVersion.current += 1;
        setChampion(null);
        setChallenger(null);
        setRevealed(null);
        setStreak(0);
        setBeatBest(false);
        setPhase("loading");
        setRunId((id) => id + 1);
      }
      setRecord(withProfileStorage(active, getRecord));
    };
    const onStorage = (event: StorageEvent) => {
      if (isProfileStoreEvent(event.key, HIGHER_LOWER_STORAGE_KEY)) refresh();
    };
    const unsubscribeProfiles = subscribeProfiles(refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      isMounted.current = false;
      runVersion.current += 1;
      unsubscribeProfiles();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Bumped to start a fresh run. The opening pair is fetched in an effect rather
  // than in the click handler so mounting and restarting take the same path –
  // and so a run abandoned mid-request cannot write to a component that moved on.
  useEffect(() => {
    let isCurrent = true;
    const version = runVersion.current;
    const active = getActiveProfileId();

    (async () => {
      try {
        const duel = await getRatingDuel([], true);
        if (!isCurrent || version !== runVersion.current || active !== getActiveProfileId()) return;

        if (!duel?.champion) {
          setPhase("error");
          return;
        }

        seen.current = [duel.champion.id, duel.challenger.id];
        setChampion(duel.champion);
        setChallenger(duel.challenger);
        setRevealed(null);
        setStreak(0);
        setBeatBest(false);
        setPhase("playing");
      } catch (error) {
        console.error("Error starting higher or lower:", error);
        if (isCurrent && version === runVersion.current && active === getActiveProfileId()) setPhase("error");
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [runId]);

  // Focus follows the round. Runs after the phase has rendered, so the control
  // it moves to exists.
  useEffect(() => {
    if (focusNext.current === "result") {
      if (phase === "revealed") nextRoundRef.current?.focus();
      else if (phase === "over" || phase === "complete") playAgainRef.current?.focus();
      else return;
    } else if (focusNext.current === "choices") {
      if (phase !== "playing") return;
      choicesRef.current?.focus();
    } else {
      return;
    }
    focusNext.current = null;
  }, [phase]);

  function restart() {
    runVersion.current += 1;
    focusNext.current = "choices";
    setPhase("loading");
    setRunId((id) => id + 1);
  }

  async function guess(direction: "higher" | "lower") {
    const active = profileId.current;
    const version = runVersion.current;
    if (phase !== "playing" || pendingRoundVersion.current === version || !champion || !challenger || active === null || active !== getActiveProfileId()) return;

    pendingRoundVersion.current = version;
    // Not "loading": that takes the pair and the choices off the screen, and the
    // button just pressed – focus included – with them.
    setPhase("judging");
    const isCurrent = () => isMounted.current && version === runVersion.current && active === getActiveProfileId();

    try {
      const result = await resolveRatingDuel(
        champion.rating,
        challenger.id,
        direction,
      );
      if (!isCurrent()) return;

      if (!result) {
        toast.showToast("Could not settle that round – try again", "error");
        setPhase("playing");
        return;
      }
      focusNext.current = "result";

      setRevealed(result.challengerRating);

      const nextStreak = result.correct ? streak + 1 : streak;
      setStreak(nextStreak);

      // Retain this tab's round even if the browser cannot acquire the lock.
      // The shared record is read only after other rounds/restores finish.
      pendingRecord.current = recordRound(pendingRecord.current, nextStreak);
      const saved = await withProfileRosterLock<"saved" | "refused" | "skipped" | "unavailable">(() => {
        if (!isCurrent()) return "skipped";
        return withProfileStorage(active, () => {
          const stored = getRecord({ strict: true });
          const updated = {
            best: Math.max(stored.best, pendingRecord.current.best),
            totalRounds: stored.totalRounds + pendingRecord.current.totalRounds,
          };
          if (!saveRecord(updated)) return "refused";
          pendingRecord.current = EMPTY_RECORD;
          setRecord(updated);
          // Strictly above what stood before this save; equalling it is not
          // a new best.
          if (nextStreak > stored.best) setBeatBest(true);
          return "saved";
        });
      }, "unavailable");
      if (!isCurrent()) return;
      if (saved === "refused" || saved === "unavailable") {
        toast.showToast(
          saved === "refused"
            ? "Your browser would not save this round. Check its storage settings; you can keep playing."
            : "Could not safely save this round. You can keep playing; another round will retry the save.",
          "error",
        );
      }
      setPhase(result.correct ? "revealed" : "over");
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Error resolving the round:", error);
      toast.showToast("Could not settle that round – try again", "error");
      setPhase("playing");
    } finally {
      if (pendingRoundVersion.current === version) pendingRoundVersion.current = null;
    }
  }

  function next() {
    if (phase !== "revealed" || !challenger || revealed === null || profileId.current !== getActiveProfileId()) return;

    // The film just judged becomes the one to beat – which is what makes this a
    // run rather than a series of unrelated pairs.
    const promoted: RatedFilm = { ...challenger, rating: revealed };
    focusNext.current = "choices";
    setChampion(promoted);
    setChallenger(null);
    setRevealed(null);
    void loadNextChallenger();
  }

  // Retrying a failed load keeps the promoted film, streak and seen list. A
  // wrong answer ends the run, and so does running out of films – an
  // unavailable opponent does not.
  async function loadNextChallenger() {
    if (profileId.current !== getActiveProfileId()) return;

    setPhase("loading");
    const version = ++runVersion.current;
    const active = getActiveProfileId();
    const isCurrent = () => isMounted.current && version === runVersion.current && active === getActiveProfileId();

    try {
      const duel = await getRatingDuel(seen.current, false);
      if (!isCurrent()) return;
      if (!duel) {
        // A pool with nothing left to draw is the end of the run, not an
        // error: "Try again" could never succeed there. Anything else – an
        // outage, a rate limit – is worth retrying.
        if (isPoolExhausted(seen.current)) {
          focusNext.current = "result";
          setPhase("complete");
        } else {
          setPhase("next-error");
        }
        return;
      }

      seen.current = [...seen.current, duel.challenger.id];
      setChallenger(duel.challenger);
      setPhase("playing");
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Error loading the next round:", error);
      setPhase("next-error");
    }
  }

  if (phase === "error" || phase === "next-error") {
    return (
      <div className="max-w-3xl mx-auto text-center py-16 space-y-4">
        <p className="text-gray-400">
          {phase === "next-error"
            ? "Could not load the next film just now. Your streak is still intact."
            : "Could not load a pair of films just now."}
        </p>
        <button
          onClick={phase === "next-error" ? loadNextChallenger : restart}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (!champion) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          Streak <span className="text-white font-semibold">{streak}</span>
        </span>
        {record.best > 0 && (
          <span className="flex items-center gap-1.5 text-gray-400">
            <Trophy className="w-4 h-4" aria-hidden="true" />
            best {record.best}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <FilmCard film={champion} rating={champion.rating} />
        {challenger && (
          <FilmCard
            film={challenger}
            rating={revealed}
            highlight={phase === "over"}
          />
        )}
      </div>

      {/* Always rendered, so a result written into it is announced; a region
          that mounts already holding its text is not. */}
      <p role="status" className="sr-only">
        {phase === "revealed" && challenger && revealed !== null
          ? `Correct. ${challenger.title} scored ${revealed.toFixed(1)}. Streak ${streak}.`
          : phase === "over" && challenger && revealed !== null
            ? `That one went the other way. ${challenger.title} scored ${revealed.toFixed(1)}. You got ${streak} right${beatBest ? " – a new best" : ""}.`
            : phase === "complete"
              ? `You have seen every film in the game. Final score ${streak}${beatBest ? " – a new best" : ""}.`
              : ""}
      </p>

      {(phase === "playing" || phase === "judging") && challenger && (
        <div className="space-y-3">
          <p className="text-center text-gray-400 text-sm">
            Did <span className="text-white">{challenger.title}</span> score
            higher or lower than{" "}
            <span className="text-white">{champion.title}</span>?
          </p>
          {/* Kept on screen while the round is settled, aria-disabled rather
              than disabled: native disabled blurs the button just pressed,
              and unmounting it – as the spinner used to – loses focus too.
              `guess` refuses a second answer while one is pending. */}
          <div className="flex gap-3 justify-center" aria-busy={phase === "judging"}>
            <button
              ref={choicesRef}
              onClick={() => guess("higher")}
              aria-disabled={phase === "judging"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 aria-disabled:opacity-60 aria-disabled:cursor-wait"
            >
              <ArrowUp className="w-4 h-4" aria-hidden="true" />
              Higher
            </button>
            <button
              onClick={() => guess("lower")}
              aria-disabled={phase === "judging"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 aria-disabled:opacity-60 aria-disabled:cursor-wait"
            >
              <ArrowDown className="w-4 h-4" aria-hidden="true" />
              Lower
            </button>
          </div>
        </div>
      )}

      {phase === "loading" && (
        <div className="py-4">
          <LoadingSpinner />
        </div>
      )}

      {phase === "revealed" && (
        <div className="text-center space-y-3">
          <p className="text-green-300 font-semibold">Correct.</p>
          <button
            ref={nextRoundRef}
            onClick={next}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Next round
          </button>
        </div>
      )}

      {phase === "complete" && (
        <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 text-center space-y-3">
          <p className="text-green-300 font-semibold">
            That was every film in the game.
          </p>
          <p className="text-gray-400 text-sm">
            Final score {streak}
            {beatBest && " – a new best."}
          </p>
          <button
            ref={playAgainRef}
            onClick={restart}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Play again
          </button>
        </div>
      )}

      {phase === "over" && (
        <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-5 text-center space-y-3">
          <p className="text-red-300 font-semibold">
            That one went the other way.
          </p>
          <p className="text-gray-400 text-sm">
            You got {streak} right
            {beatBest && " – a new best."}
          </p>
          <button
            ref={playAgainRef}
            onClick={restart}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Play again
          </button>
        </div>
      )}
    </div>
  );
}

function FilmCard({
  film,
  rating,
  highlight = false,
}: {
  film: DuelFilm;
  /** Null while it is still the thing being guessed. */
  rating: number | null;
  highlight?: boolean;
}) {
  const artwork = film.backdropPath ?? film.posterPath;

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border bg-gray-900",
        highlight ? "border-red-500/50" : "border-gray-800",
      )}
    >
      <div className="relative aspect-video bg-gray-800">
        {artwork && (
          <Image
            src={getImageUrl(artwork, "w500")}
            alt={film.title}
            fill
            className="object-cover"
          />
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="font-semibold text-white text-sm line-clamp-2">
          {/* Only linked once its score is out: a link is an invitation to open
              the page the answer is printed on. */}
          {rating === null ? (
            film.title
          ) : (
            <Link
              href={movieHref(film.slug)}
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-300 transition-colors"
            >
              {film.title}
            </Link>
          )}
        </p>
        <p className="text-xs text-gray-500">{film.year ?? "—"}</p>
        <p className="flex items-center gap-1.5 text-sm">
          <Star
            className="w-4 h-4 text-yellow-400"
            fill="currentColor"
            aria-hidden="true"
          />
          {rating === null ? (
            <span className="text-gray-500">?</span>
          ) : (
            <span className="text-white font-semibold tabular-nums">
              {rating.toFixed(1)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
