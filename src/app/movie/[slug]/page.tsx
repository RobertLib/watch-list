import type { Metadata } from "next";
import { MovieContent } from "@/components/MovieContent";
import { getMovieSnapshot } from "@/lib/build-time-tmdb";
import { prerenderedTitleParams } from "@/lib/prerendered-titles-server";
import { movieMetadata } from "@/lib/title-metadata";
import { extractIdFromSlug } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * One of the films the build prerendered (`scripts/prebuild.mjs` chose them),
 * at a path of its own with its content in the HTML. Every other one lives at
 * `/movie?id=`; any other path here is a 404, which sends the visitor there.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return prerenderedTitleParams("movie", "fight-club-550");
}

async function snapshotFor(slug: string) {
  const id = extractIdFromSlug(slug);
  return id === null ? null : getMovieSnapshot(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return movieMetadata(`/movie/${slug}`, await snapshotFor(slug));
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <MovieContent slug={slug} snapshot={await snapshotFor(slug)} />;
}
