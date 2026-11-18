import type { Metadata } from "next";
import { PersonContent } from "@/components/PersonContent";
import { getPersonSnapshot } from "@/lib/build-time-tmdb";
import { prerenderedTitleParams } from "@/lib/prerendered-titles-server";
import { personMetadata } from "@/lib/title-metadata";
import { extractIdFromSlug } from "@/lib/utils";

/**
 * The Czech counterpart of `app/(en)/person/[slug]/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * The Czech tree's own, smaller set of prerendered titles, each at the slug of
 * its Czech name (`scripts/prebuild.mjs`, `CS_LIMITS`). Every other one lives
 * at `/cs/person?id=`.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return prerenderedTitleParams("person", "tom-hanks-31", "cs");
}

async function snapshotFor(slug: string) {
  const id = extractIdFromSlug(slug);
  return id === null ? null : getPersonSnapshot(id, "cs");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return personMetadata(`/person/${slug}`, await snapshotFor(slug), "cs");
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <PersonContent slug={slug} snapshot={await snapshotFor(slug)} />;
}
