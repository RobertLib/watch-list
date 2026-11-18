import type { Metadata } from "next";
import { TVContent } from "@/components/TVContent";
import { getTVSnapshot } from "@/lib/build-time-tmdb";
import { prerenderedTitleParams } from "@/lib/prerendered-titles-server";
import { tvMetadata } from "@/lib/title-metadata";
import { extractIdFromSlug } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * One of the series the build prerendered (`scripts/prebuild.mjs` chose them),
 * at a path of its own with its content in the HTML. Every other one lives at
 * `/tv?id=`; any other path here is a 404, which sends the visitor there.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return prerenderedTitleParams("tv", "breaking-bad-1396");
}

async function snapshotFor(slug: string) {
  const id = extractIdFromSlug(slug);
  return id === null ? null : getTVSnapshot(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return tvMetadata(`/tv/${slug}`, await snapshotFor(slug));
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <TVContent slug={slug} snapshot={await snapshotFor(slug)} />;
}
