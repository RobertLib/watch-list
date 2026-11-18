import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenreListing } from "@/components/GenreListing";
import { StructuredData } from "@/components/StructuredData";
import { pageMetadata } from "@/lib/page-metadata";
import { absoluteLocalizedUrl, genreHref } from "@/lib/routes";
import {
  findGenreBySlug,
  genrePhrase,
  genreSlug,
  genreTitle,
  genresFor,
} from "@/lib/genre-catalog";
import { t, type Locale } from "@/i18n/locale";
import {
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
  isIndexableLanding,
  onPlatform,
} from "@/lib/streaming-landing";
import { getGenreSnapshot } from "@/lib/build-time-tmdb";
import type { MediaType } from "@/types/tmdb";

/**
 * The four genre routes – films and series, each plain and per platform – are
 * thin files over this one: `/genres/movie/[genre]`, `/genres/tv/[genre]` and
 * their `/[platform]` children.
 *
 * Every genre and every platform is in the code (`genre-catalog.ts`,
 * `streaming-landing.ts`), so `generateStaticParams` can list them all and the
 * static export writes one HTML file per page. `dynamicParams = false` in each
 * route makes anything else a 404 rather than an attempt to render it.
 */

export function genreParams(mediaType: MediaType): { genre: string }[] {
  return genresFor(mediaType).map((genre) => ({ genre: genreSlug(genre) }));
}

export function genrePlatformParams(
  mediaType: MediaType,
): { genre: string; platform: string }[] {
  return genresFor(mediaType).flatMap((genre) =>
    STREAMING_LANDING_PLATFORMS.map((platform) => ({
      genre: genreSlug(genre),
      platform: platform.slug,
    })),
  );
}

/** The genre and platform a route's params name, or a 404. */
function resolve(mediaType: MediaType, slug: string, platformSlug?: string) {
  const genre = findGenreBySlug(mediaType, slug);
  const platform = platformSlug ? findStreamingPlatform(platformSlug) : undefined;
  if (!genre || (platformSlug && !platform)) notFound();
  return { genre, platform };
}

export async function genreLandingMetadata(
  mediaType: MediaType,
  slug: string,
  platformSlug?: string,
  locale: Locale = "en",
): Promise<Metadata> {
  const { genre, platform } = resolve(mediaType, slug, platformSlug);
  const title = genreTitle(genre, mediaType, locale);
  const phrase = genrePhrase(genre, mediaType, locale);

  if (!platform) {
    return pageMetadata({
      title,
      description: t(
        locale,
        `The most popular ${phrase} right now, and where each one is streaming. Narrow them by year, rating, language or the services you pay for.`,
        `Nejpopulárnější ${phrase} právě teď a kde je která streamuje. Zúžte výběr podle roku, hodnocení, jazyka nebo služeb, které platíte.`,
      ),
      path: genreHref(mediaType, genreSlug(genre)),
      locale,
    });
  }

  const other = locale === "en" ? "cs" : "en";
  const [snapshot, otherSnapshot] = await Promise.all([
    getGenreSnapshot(mediaType, genre.id, platform.slug, locale),
    // The twin in the other tree counts its own region's titles, so it can be
    // `noindex` where this one is not – and a translation that is `noindex`
    // is not one to name.
    getGenreSnapshot(mediaType, genre.id, platform.slug, other),
  ]);
  return pageMetadata({
    title: t(locale, `${title} on ${platform.name}`, `${title} ${onPlatform(platform, "cs")}`),
    description: t(
      locale,
      `${title} you can stream on ${platform.name} right now, most popular first. Save any of them to a free watchlist, no account needed.`,
      `${title}, které teď můžete streamovat ${onPlatform(platform, "cs")}, od nejpopulárnějších. Kterýkoli si uložte na seznam zdarma, bez registrace.`,
    ),
    path: genreHref(mediaType, genreSlug(genre), { provider: platform.slug }),
    locale,
    languages: isIndexableLanding(otherSnapshot?.totalResults)
      ? undefined
      : { [other]: null },
    // A landing with a handful of titles is thin, and dozens of them read as
    // doorway pages – see `MIN_INDEXABLE_LANDING_RESULTS`.
    noindex: !isIndexableLanding(snapshot?.totalResults),
  });
}

export async function GenreLandingPage({
  mediaType,
  slug,
  platformSlug,
  locale = "en",
}: {
  mediaType: MediaType;
  slug: string;
  platformSlug?: string;
  locale?: Locale;
}) {
  const { genre, platform } = resolve(mediaType, slug, platformSlug);
  const snapshot = await getGenreSnapshot(mediaType, genre.id, platform?.slug, locale);
  const title = genreTitle(genre, mediaType, locale);
  const genreUrl = absoluteLocalizedUrl(genreHref(mediaType, genreSlug(genre)), locale);
  const platformUrl = platform
    ? absoluteLocalizedUrl(
        genreHref(mediaType, genreSlug(genre), { provider: platform.slug }),
        locale,
      )
    : genreUrl;

  const breadcrumbItems = [
    { name: t(locale, "Home", "Domů"), url: absoluteLocalizedUrl("/", locale) },
    { name: t(locale, "Genres", "Žánry"), url: absoluteLocalizedUrl("/genres", locale) },
    { name: title, url: genreUrl },
  ];
  if (platform) {
    breadcrumbItems.push({ name: platform.name, url: platformUrl });
  }

  return (
    <>
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} locale={locale} />
      {/* Page one, as the build saw it – the same titles the HTML lists. None
          in a build without TMDB access, where the page lists none either. */}
      {snapshot && snapshot.items.length > 0 && (
        <StructuredData
          type="TitleList"
          locale={locale}
          data={{
            name: platform
              ? t(locale, `${title} on ${platform.name}`, `${title} ${onPlatform(platform, "cs")}`)
              : title,
            url: platformUrl,
            titles: snapshot.items.map((item) => ({
              id: item.id,
              title: item.title,
              mediaType,
            })),
          }}
        />
      )}
      <GenreListing
        mediaType={mediaType}
        genre={genre}
        platform={platform}
        snapshot={snapshot}
      />
    </>
  );
}
