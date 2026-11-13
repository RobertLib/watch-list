import type { Metadata } from "next";
import { DailyContent } from "@/components/DailyContent";
import { pageMetadata } from "@/lib/page-metadata";

// Named for what people type. "Daily Film Puzzle" was this page's own name for
// itself and nobody's search: the games it sits beside are found as "guess the
// movie" and "movie guessing game", so the title and the heading say that, and
// the old name stays where it is the product's – the footer, the home teaser.
export const metadata: Metadata = pageMetadata({
  title: "Guess the Movie – Daily Movie Guessing Game",
  description:
    "Guess the movie from one blurred still. A new film every day, six guesses, a clue for every miss. Free, no sign-up, and every past puzzle is still playable.",
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
