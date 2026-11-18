import type { Metadata } from "next";
import { PersonContent } from "@/components/PersonContent";
import { getPersonSnapshot } from "@/lib/build-time-tmdb";
import { prerenderedTitleParams } from "@/lib/prerendered-titles-server";
import { personMetadata } from "@/lib/title-metadata";
import { extractIdFromSlug } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * One of the people the build prerendered (`scripts/prebuild.mjs` chose them),
 * at a path of its own with its content in the HTML. Every other one lives at
 * `/person?id=`; any other path here is a 404, which sends the visitor there.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return prerenderedTitleParams("person", "tom-hanks-31");
}

async function snapshotFor(slug: string) {
  const id = extractIdFromSlug(slug);
  return id === null ? null : getPersonSnapshot(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return personMetadata(`/person/${slug}`, await snapshotFor(slug));
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <PersonContent slug={slug} snapshot={await snapshotFor(slug)} />;
}
