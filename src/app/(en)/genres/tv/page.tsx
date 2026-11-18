import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { LegacyGenreQueryRedirect } from "@/components/LegacyQueryRedirect";

export const metadata: Metadata = pageMetadata({
  title: "TV Shows by Genre",
  description: "Moving you to the genre you asked for.",
  noindex: true,
});

/**
 * The old address of a genre – `?genre=action-28`, optionally
 * `&provider=netflix` – from before genres were paths of their own
 * (`/genres/tv/action-28`). It only moves the visitor on, filters included.
 */
export default function GenreTVShowsPage() {
  return <LegacyGenreQueryRedirect mediaType="tv" />;
}
