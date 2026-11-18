import type { Metadata } from "next";
import { MovieContent } from "@/components/MovieContent";
import { getMovieSnapshot } from "@/lib/build-time-tmdb";
import { prerenderedTitleParams } from "@/lib/prerendered-titles-server";
import { movieMetadata } from "@/lib/title-metadata";
import { extractIdFromSlug } from "@/lib/utils";

/**
 * The Czech counterpart of `app/(en)/movie/[slug]/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * The Czech tree's own, smaller set of prerendered titles, each at the slug of
 * its Czech name (`scripts/prebuild.mjs`, `CS_LIMITS`). Every other one lives
 * at `/cs/movie?id=`.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return prerenderedTitleParams("movie", "fight-club-550", "cs");
}

async function snapshotFor(slug: string) {
  const id = extractIdFromSlug(slug);
  return id === null ? null : getMovieSnapshot(id, "cs");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return movieMetadata(`/movie/${slug}`, await snapshotFor(slug), "cs");
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <MovieContent slug={slug} snapshot={await snapshotFor(slug)} />;
}
