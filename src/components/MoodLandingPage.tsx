import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MoodContent } from "@/components/MoodContent";
import { StructuredData } from "@/components/StructuredData";
import { pageMetadata } from "@/lib/page-metadata";
import { MOODS, findMood, moodsWithPlatforms } from "@/lib/moods";
import {
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
  isIndexableLanding,
} from "@/lib/streaming-landing";
import { getMoodSnapshot } from "@/lib/build-time-tmdb";
import { SITE_URL, absoluteUrl, moodHref } from "@/lib/routes";

/**
 * The two mood routes – `/mood/[slug]` and its `/[platform]` child – are thin
 * files over this one, the way the genre routes are over `GenreLandingPage`.
 *
 * Every mood and every platform is in the code (`moods.ts`,
 * `streaming-landing.ts`), so `generateStaticParams` can list them all and the
 * static export writes one HTML file per page. `dynamicParams = false` in each
 * route makes anything else a 404 rather than an attempt to render it.
 */

export function moodParams(): { slug: string }[] {
  return MOODS.map((mood) => ({ slug: mood.slug }));
}

/** Only the moods that have platform pages – see `Mood.platforms`. */
export function moodPlatformParams(): { slug: string; platform: string }[] {
  return moodsWithPlatforms().flatMap((mood) =>
    STREAMING_LANDING_PLATFORMS.map((platform) => ({
      slug: mood.slug,
      platform: platform.slug,
    })),
  );
}

/** The mood and platform a route's params name, or a 404. */
function resolve(slug: string, platformSlug?: string) {
  const mood = findMood(slug);
  const platform = platformSlug ? findStreamingPlatform(platformSlug) : undefined;
  if (!mood || (platformSlug && (!platform || !mood.platforms))) notFound();
  return { mood, platform };
}

export async function moodLandingMetadata(
  slug: string,
  platformSlug?: string,
): Promise<Metadata> {
  const { mood, platform } = resolve(slug, platformSlug);

  if (!platform) {
    return pageMetadata({
      title: mood.title,
      description: mood.description,
      path: moodHref(mood.slug),
    });
  }

  const snapshot = await getMoodSnapshot(mood.slug, platform.slug);
  return pageMetadata({
    title: `${mood.title} on ${platform.name}`,
    description: `${mood.title} streaming on ${platform.name} right now, best-rated first. Save any to a free watchlist – no account needed.`,
    path: moodHref(mood.slug, 1, platform.slug),
    // A landing with a handful of titles is thin, and dozens of them read as
    // doorway pages – see `MIN_INDEXABLE_LANDING_RESULTS`.
    noindex: !isIndexableLanding(snapshot?.totalResults),
  });
}

/**
 * One mood's picks, prerendered per mood – and per platform, for the moods
 * that have those.
 *
 * These were one `/mood?id=` shell for all of them – byte-identical markup at
 * every address, so `noindex` and out of the sitemap. A path each, with the
 * build's snapshot of page one in it, is a page of its own.
 */
export async function MoodLandingPage({
  slug,
  platformSlug,
}: {
  slug: string;
  platformSlug?: string;
}) {
  const { mood, platform } = resolve(slug, platformSlug);
  const snapshot = await getMoodSnapshot(mood.slug, platform?.slug);

  const moodUrl = absoluteUrl(moodHref(mood.slug));
  const pageUrl = absoluteUrl(moodHref(mood.slug, 1, platform?.slug));
  const pageName = platform ? `${mood.title} on ${platform.name}` : mood.title;

  const breadcrumbItems = [
    { name: "Home", url: SITE_URL },
    { name: "Moods", url: absoluteUrl("/moods") },
    { name: mood.title, url: moodUrl },
  ];
  if (platform) breadcrumbItems.push({ name: platform.name, url: pageUrl });

  // Films and series apart: every item of a list has to be one type. Named
  // apart only where the page has both – "Best Heist Movies: movies" is not a
  // name.
  const both = Boolean(mood.movie && mood.tv);
  const lists = [
    {
      name: both ? `${pageName}: movies` : pageName,
      mediaType: "movie" as const,
      items: snapshot?.movies ?? [],
    },
    {
      name: both ? `${pageName}: TV shows` : pageName,
      mediaType: "tv" as const,
      items: snapshot?.shows ?? [],
    },
  ].filter((list) => list.items.length > 0);

  return (
    <>
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} />
      {lists.map((list) => (
        <StructuredData
          key={list.mediaType}
          type="TitleList"
          data={{
            name: list.name,
            url: pageUrl,
            titles: list.items.map((item) => ({
              id: item.id,
              title: item.title,
              mediaType: list.mediaType,
            })),
          }}
        />
      ))}
      <MoodContent mood={mood} platform={platform} snapshot={snapshot} />
    </>
  );
}
