import type { Metadata } from "next";
import { TVContent } from "@/components/TVContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "TV Show Details",
  description:
    "Seasons, cast, trailers and where to stream a series, with episode progress you can track as you go.",
  noindex: true,
});

/**
 * Any series, by query string – the mirror of the film page: a static export
 * has no route for every series TMDB knows about, and the best-known ones have
 * a prerendered path of their own (`tv/[slug]`).
 */
export default function Page() {
  return <TVContent />;
}
