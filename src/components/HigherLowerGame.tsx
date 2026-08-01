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
import { getRatingDuel, resolveRatingDuel } from "@/app/actions";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { toast } from "@/components/Toast";
import {
  EMPTY_RECORD,
  getRecord,
  recordRound,
  saveRecord,
  type HigherLowerRecord,
} from "@/lib/higher-lower";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn } from "@/lib/utils";
import type {
  DuelFilm,
  RatedFilm,
} from "@/lib/rating-duel-server";

type Phase = "loading" | "playing" | "revealed" | "over" | "error";

/**
 * Higher or lower, on TMDB's average score.
 *
 * The daily puzzle is over in two minutes and then there is nothing to do until
 * tomorrow. This is what fills that gap: no schedule, no limit, and a record that
 * only moves by playing one more round.
 *
 * The challenger's score is never in the page until the guess is in – the server
 * withholds it and reveals it in the answer, the same discipline the daily
 * puzzle's proxied image follows.
 */
export function HigherLowerGame() {
  const [champion, setChampion] = useState<RatedFilm | null>(null);
  const [challenger, setChallenger] = useState<DuelFilm | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [streak, setStreak] = useState(0);
  const [record, setRecord] = useState<HigherLowerRecord>(EMPTY_RECORD);

  // Everything already shown this run, so a long streak never repeats a film.
  const seen = useRef<number[]>([]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from
       a browser-only store, like every other stored record here */
    setRecord(getRecord());
  }, []);

  // Bumped to start a fresh run. The opening pair is fetched in an effect rather
  // than in the click handler so mounting and restarting take the same path –
  // and so a run abandoned mid-request cannot write to a component that moved on.
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    (async () => {
      try {
        const duel = await getRatingDuel([], true);
        if (!isCurrent) return;

        if (!duel?.champion) {
          setPhase("error");
          return;
        }

        seen.current = [duel.champion.id, duel.challenger.id];
        setChampion(duel.champion);
        setChallenger(duel.challenger);
        setRevealed(null);
        setStreak(0);
        setPhase("playing");
      } catch (error) {
        console.error("Error starting higher or lower:", error);
        if (isCurrent) setPhase("error");
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [runId]);

  function restart() {
    setPhase("loading");
    setRunId((id) => id + 1);
  }

  async function guess(direction: "higher" | "lower") {
    if (phase !== "playing" || !champion || !challenger) return;

    setPhase("loading");

    try {
      const result = await resolveRatingDuel(
        champion.id,
        challenger.id,
        direction,
      );

      if (!result) {
        toast.showToast("Could not settle that round – try again", "error");
        setPhase("playing");
        return;
      }

      setRevealed(result.challengerRating);

      const nextStreak = result.correct ? streak + 1 : streak;
      setStreak(nextStreak);

      // Written on every round rather than only at the end: a tab closed
      // mid-run should still have counted.
      const updated = recordRound(record, nextStreak);
      setRecord(updated);
      saveRecord(updated);

      setPhase(result.correct ? "revealed" : "over");
    } catch (error) {
      console.error("Error resolving the round:", error);
      setPhase("playing");
    }
  }

  async function next() {
    if (!challenger || revealed === null) return;

    // The film just judged becomes the one to beat – which is what makes this a
    // run rather than a series of unrelated pairs.
    const promoted: RatedFilm = { ...challenger, rating: revealed };
    setChampion(promoted);
    setChallenger(null);
    setRevealed(null);
    setPhase("loading");

    try {
      const duel = await getRatingDuel(seen.current, false);
      if (!duel) {
        setPhase("error");
        return;
      }

      seen.current = [...seen.current, duel.challenger.id];
      setChallenger(duel.challenger);
      setPhase("playing");
    } catch (error) {
      console.error("Error loading the next round:", error);
      setPhase("error");
    }
  }

  if (phase === "error") {
    return (
      <div className="max-w-3xl mx-auto text-center py-16 space-y-4">
        <p className="text-gray-400">
          Could not load a pair of films just now.
        </p>
        <button
          onClick={restart}
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

      {phase === "playing" && challenger && (
        <div className="space-y-3">
          <p className="text-center text-gray-400 text-sm">
            Did <span className="text-white">{challenger.title}</span> score
            higher or lower than{" "}
            <span className="text-white">{champion.title}</span>?
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => guess("higher")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            >
              <ArrowUp className="w-4 h-4" aria-hidden="true" />
              Higher
            </button>
            <button
              onClick={() => guess("lower")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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
            onClick={next}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Next round
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
            {streak > 0 && streak === record.best && " – a new best."}
          </p>
          <button
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
              href={`/movie/${film.slug}`}
              prefetch={false}
              target="_blank"
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
