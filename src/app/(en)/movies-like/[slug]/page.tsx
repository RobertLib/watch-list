import type { Metadata } from "next";
import { LikeTitlesPage, likePageMetadata } from "@/components/LikeTitlesPage";
import { likePageParams } from "@/lib/prerendered-titles-server";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * "Movies like …", for the best-known of the prerendered films
 * (`LIKE_PAGE_LIMITS`). Any other path is a 404 – a title without one of
 * these has its similar titles on its own page.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return likePageParams("movie", "fight-club-550");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return likePageMetadata("movie", (await params).slug);
}

export default async function Page({ params }: Props) {
  return <LikeTitlesPage mediaType="movie" slug={(await params).slug} />;
}
