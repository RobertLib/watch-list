import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MoodContent } from "@/components/MoodContent";
import { StructuredData } from "@/components/StructuredData";
import { pageMetadata } from "@/lib/page-metadata";
import { MOODS, findMood, localizeMood, moodsWithPlatforms } from "@/lib/moods";
import {
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
  isIndexableLanding,
  onPlatform,
} from "@/lib/streaming-landing";
import { getMoodSnapshot } from "@/lib/build-time-tmdb";
import { absoluteLocalizedUrl, moodHref } from "@/lib/routes";
import { t, type Locale } from "@/i18n/locale";

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
function resolve(slug: string, platformSlug: string | undefined, locale: Locale) {
  const mood = findMood(slug);
  const platform = platformSlug ? findStreamingPlatform(platformSlug) : undefined;
  if (!mood || (platformSlug && (!platform || !mood.platforms))) notFound();
  return { mood: localizeMood(mood, locale), platform };
}

export async function moodLandingMetadata(
  slug: string,
  platformSlug?: string,
  locale: Locale = "en",
): Promise<Metadata> {
  const { mood, platform } = resolve(slug, platformSlug, locale);

  if (!platform) {
    return pageMetadata({
      title: mood.title,
      description: mood.description,
      path: moodHref(mood.slug),
      locale,
    });
  }

  const other = locale === "en" ? "cs" : "en";
  const [snapshot, otherSnapshot] = await Promise.all([
    getMoodSnapshot(mood.slug, platform.slug, locale),
    // As for a genre's landing: the twin counts its own region's titles.
    getMoodSnapshot(mood.slug, platform.slug, other),
  ]);
  return pageMetadata({
    title: t(locale, `${mood.title} on ${platform.name}`, `${mood.title} ${onPlatform(platform, "cs")}`),
    description: t(
      locale,
      `${mood.title} streaming on ${platform.name} right now, best-rated first. Save any to a free watchlist – no account needed.`,
      `${mood.title}, které teď běží ${onPlatform(platform, "cs")}, od nejlépe hodnocených. Kterýkoli si uložte na seznam zdarma – bez registrace.`,
    ),
    path: moodHref(mood.slug, 1, platform.slug),
    locale,
    languages: isIndexableLanding(otherSnapshot?.totalResults)
      ? undefined
      : { [other]: null },
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
  locale = "en",
}: {
  slug: string;
  platformSlug?: string;
  locale?: Locale;
}) {
  const { mood, platform } = resolve(slug, platformSlug, locale);
  const snapshot = await getMoodSnapshot(mood.slug, platform?.slug, locale);

  const moodUrl = absoluteLocalizedUrl(moodHref(mood.slug), locale);
  const pageUrl = absoluteLocalizedUrl(moodHref(mood.slug, 1, platform?.slug), locale);
  const pageName = platform
    ? t(locale, `${mood.title} on ${platform.name}`, `${mood.title} ${onPlatform(platform, "cs")}`)
    : mood.title;

  const breadcrumbItems = [
    { name: t(locale, "Home", "Domů"), url: absoluteLocalizedUrl("/", locale) },
    { name: t(locale, "Moods", "Nálady"), url: absoluteLocalizedUrl("/moods", locale) },
    { name: mood.title, url: moodUrl },
  ];
  if (platform) breadcrumbItems.push({ name: platform.name, url: pageUrl });

  // Films and series apart: every item of a list has to be one type. Named
  // apart only where the page has both – "Best Heist Movies: movies" is not a
  // name.
  const both = Boolean(mood.movie && mood.tv);
  const lists = [
    {
      name: both ? `${pageName}: ${t(locale, "movies", "filmy")}` : pageName,
      mediaType: "movie" as const,
      items: snapshot?.movies ?? [],
    },
    {
      name: both ? `${pageName}: ${t(locale, "TV shows", "seriály")}` : pageName,
      mediaType: "tv" as const,
      items: snapshot?.shows ?? [],
    },
  ].filter((list) => list.items.length > 0);

  return (
    <>
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} locale={locale} />
      {lists.map((list) => (
        <StructuredData
          key={list.mediaType}
          type="TitleList"
          locale={locale}
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
