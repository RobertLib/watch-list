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
 * A series. The mirror of the film page, and addressed the same way: the show
 * travels in `?id=`, because a static export has no route for every series TMDB
 * knows about.
 */
export default function Page() {
  return <TVContent />;
}
