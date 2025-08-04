import type { Metadata } from "next";
import { PeoplePageContent } from "@/components/PeoplePageContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "People",
  description:
    "The most popular actors, directors and crew in film and TV this week, and everything they are known for.",
  path: "/people",
});

/** Whoever TMDB says is popular this week. Two pages, de-duplicated. */
export default function Page() {
  return <PeoplePageContent />;
}
