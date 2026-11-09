import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MoodContent } from "@/components/MoodContent";
import { StructuredData } from "@/components/StructuredData";
import { pageMetadata } from "@/lib/page-metadata";
import { MOODS, findMood } from "@/lib/moods";
import { getMoodSnapshot } from "@/lib/build-time-tmdb";
import { SITE_URL, absoluteUrl, moodHref } from "@/lib/routes";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Every mood is listed below; any other path is a 404, not a render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return MOODS.map((mood) => ({ slug: mood.slug }));
}

function resolve(slug: string) {
  const mood = findMood(slug);
  if (!mood) notFound();
  return mood;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mood = resolve((await params).slug);
  return pageMetadata({
    title: `${mood.label} – ${mood.tv ? "Movies & TV Shows" : "Movies"} to Watch`,
    description: mood.description,
    path: moodHref(mood.slug),
  });
}

/**
 * One mood's picks, prerendered per mood.
 *
 * These were one `/mood?id=` shell for all of them – byte-identical markup at
 * every address, so `noindex` and out of the sitemap. A path each, with the
 * build's snapshot of page one in it, is a page of its own.
 */
export default async function Page({ params }: Props) {
  const mood = resolve((await params).slug);
  const snapshot = await getMoodSnapshot(mood.slug);

  return (
    <>
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: SITE_URL },
            { name: "Moods", url: absoluteUrl("/moods") },
            { name: mood.label, url: absoluteUrl(moodHref(mood.slug)) },
          ],
        }}
      />
      <MoodContent mood={mood} snapshot={snapshot} />
    </>
  );
}
