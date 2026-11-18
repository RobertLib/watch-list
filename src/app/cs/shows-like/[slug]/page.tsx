import type { Metadata } from "next";
import { LikeTitlesPage, likePageMetadata } from "@/components/LikeTitlesPage";
import { likePageParams } from "@/lib/prerendered-titles-server";

/**
 * The Czech counterpart of `app/(en)/shows-like/[slug]/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

/**
 * The Czech tree's own list (`LIKE_PAGE_LIMITS.cs`), under Czech slugs. Empty
 * for now, so this writes the one fallback page a static export needs.
 */
export function generateStaticParams() {
  return likePageParams("tv", "breaking-bad-1396", "cs");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return likePageMetadata("tv", (await params).slug, "cs");
}

export default async function Page({ params }: Props) {
  return <LikeTitlesPage mediaType="tv" slug={(await params).slug} locale="cs" />;
}
