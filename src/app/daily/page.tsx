import type { Metadata } from "next";
import { DailyContent } from "@/components/DailyContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Daily Film Puzzle",
  description:
    "One film a day, six guesses. A new puzzle every midnight UTC, with a clue unlocked for every wrong answer.",
  path: "/daily",
});

/**
 * The daily puzzle: today's by default, or one out of the archive via `?day=`.
 *
 * Those were two routes. They are one page with a branch now, which is what the
 * query-string addressing buys – and it suits them, because the archived board
 * is the same board with a different header.
 */
export default function Page() {
  return <DailyContent />;
}
