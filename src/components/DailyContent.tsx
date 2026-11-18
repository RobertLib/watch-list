"use client";

import { Suspense } from "react";
import Link from "@/i18n/Link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, History, Scale } from "lucide-react";
import { DailyGame } from "@/components/DailyGame";
import { DailyStreakPanel } from "@/components/DailyStreakPanel";
import { NotFoundNotice } from "@/components/NotFoundNotice";
import {
  isPlayableDay,
  puzzleNumberForDay,
  todayUtc,
} from "@/lib/daily-puzzle";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useT } from "@/i18n/LocaleProvider";

/**
 * The daily puzzle: today's by default, or one out of the archive via `?day=`.
 *
 * Those were two routes. They are one page with a branch now, which is what the
 * query-string addressing buys – and it suits them, because the archived board
 * is the same board with a different header.
 */
export function DailyContent() {
  return (
    <Suspense fallback={<TodaysPuzzle />}>
      <DailyPuzzle />
    </Suspense>
  );
}

function DailyPuzzle() {
  const searchParams = useSearchParams();
  const requestedDay = searchParams.get("day");

  if (!requestedDay) return <TodaysPuzzle />;

  return <ArchivedPuzzle day={requestedDay} />;
}

/**
 * One puzzle out of the archive.
 *
 * A future day is the case that matters: the schedule is a pure function of the
 * date, so serving one would hand out an answer nobody has earned yet.
 */
function ArchivedPuzzle({ day }: { day: string }) {
  const t = useT();
  const playable = isPlayableDay(day, todayUtc());

  useDocumentTitle(
    playable
      ? t(
          `Daily Puzzle #${puzzleNumberForDay(day)}`,
          `Denní hádanka #${puzzleNumberForDay(day)}`,
        )
      : t("Puzzle not found", "Hádanka nenalezena"),
  );

  if (!playable) {
    return (
      <NotFoundNotice
        title={t("Puzzle not found", "Hádanka nenalezena")}
        description={t(
          "That is not a day the archive has a puzzle for – tomorrow's is not out yet.",
          "Pro tenhle den archiv žádnou hádanku nemá – ta zítřejší ještě nevyšla.",
        )}
        backHref="/daily/archive"
        backLabel={t("Browse the archive", "Projít archiv")}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto mb-8">
        <Link
          href="/daily/archive"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {t("Archive", "Archiv")}
        </Link>
        <h1 className="text-3xl font-bold mb-2">
          {t("Puzzle", "Hádanka")} #{puzzleNumberForDay(day)}
        </h1>
        <p className="text-gray-400">
          {t(
            "Six guesses, same rules. Each wrong one sharpens the picture and unlocks a clue.",
            "Šest pokusů, stejná pravidla. Každý špatný tip zaostří obrázek a odemkne nápovědu.",
          )}
        </p>
      </div>

      <DailyGame day={day} />
    </div>
  );
}

function TodaysPuzzle() {
  const t = useT();
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">
          {t("Guess the Movie", "Hádej film")}
        </h1>
        <p className="text-gray-400">
          {t(
            "The daily film puzzle: one film a day, the same for everybody. Six guesses – each wrong one sharpens the picture and unlocks a clue.",
            "Denní filmová hádanka: jeden film denně, pro všechny stejný. Šest pokusů – každý špatný tip zaostří obrázek a odemkne nápovědu.",
          )}
        </p>
      </div>

      <DailyGame />

      <div className="mt-10 space-y-8">
        <DailyStreakPanel />

        <div className="max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
          <Link
            href="/daily/archive"
            prefetch={false}
            className="group rounded-xl border border-gray-800 bg-gray-900/60 p-5 hover:border-gray-700 hover:bg-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <History
              className="w-6 h-6 text-blue-400 mb-3"
              aria-hidden="true"
            />
            <h2 className="font-semibold text-white group-hover:text-blue-300 transition-colors">
              {t("The archive", "Archiv")}
            </h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              {t(
                "Every puzzle that has run so far. A day you missed is still there.",
                "Všechny hádanky, které už vyšly. Den, který jste vynechali, na vás pořád čeká.",
              )}
            </p>
          </Link>

          <Link
            href="/daily/higher-lower"
            prefetch={false}
            className="group rounded-xl border border-gray-800 bg-gray-900/60 p-5 hover:border-gray-700 hover:bg-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Scale
              className="w-6 h-6 text-purple-400 mb-3"
              aria-hidden="true"
            />
            <h2 className="font-semibold text-white group-hover:text-purple-300 transition-colors">
              {t("Higher or lower", "Vyšší, nebo nižší")}
            </h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              {t(
                "Which film scored better? No daily limit – play until you get one wrong.",
                "Který film má lepší hodnocení? Bez denního limitu – hrajte, dokud se nespletete.",
              )}
            </p>
          </Link>
        </div>
      </div>

      {/* Part of the static shell, so the page says something to a first
          visitor while the board is still loading. */}
      <section
        aria-labelledby="how-to-play"
        className="max-w-2xl mx-auto mt-16 border-t border-gray-800 pt-8"
      >
        <h2 id="how-to-play" className="text-xl font-semibold text-white mb-3">
          {t("How to play", "Jak hrát")}
        </h2>
        <ul className="text-gray-400 space-y-2 text-sm leading-relaxed list-disc pl-5">
          <li>
            {t(
              "You start with a heavily blurred still from one film. Everyone playing today gets the same one.",
              "Začínáte se silně rozmazaným záběrem z jednoho filmu. Všichni, kdo dnes hrají, dostanou ten stejný.",
            )}
          </li>
          <li>
            {/* Czech players can type either name: the film search matches
                the Czech title and the original one alike, and a guess is
                checked by its TMDB id, not by how it was spelled. */}
            {t(
              "Type a title and pick it from the list. Guesses are matched exactly, so you never have to worry about spelling or which edition of a title counts.",
              "Napište název – český i původní – a vyberte film ze seznamu. Tipy se porovnávají přesně, takže nemusíte řešit pravopis ani to, která verze názvu platí.",
            )}
          </li>
          <li>
            {t(
              "Every wrong guess sharpens the image and reveals a clue – decade first, then genre, runtime and tagline. The fifth reveals the director and the cast together, so your last guess gets every clue.",
              "Každý špatný tip zaostří obrázek a odhalí nápovědu – nejdřív desetiletí, pak žánr, stopáž a slogan. Pátý odhalí režiséra i obsazení najednou, takže k poslednímu tipu máte všechny nápovědy.",
            )}
          </li>
          <li>
            {t(
              "Win within six guesses to keep your streak. Play tomorrow to extend it; skip a day and it starts over.",
              "Uhodněte film do šesti pokusů a vaše série pokračuje. Zahrajte si i zítra a prodlužte ji; vynecháte-li den, začínáte znovu od nuly.",
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}
