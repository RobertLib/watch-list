import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenreListing } from "@/components/GenreListing";
import { StructuredData } from "@/components/StructuredData";
import { pageMetadata } from "@/lib/page-metadata";
import { SITE_URL, absoluteUrl, genreHref } from "@/lib/routes";
import {
  findGenreBySlug,
  genreSlug,
  genresFor,
} from "@/lib/genre-catalog";
import {
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
  isIndexableLanding,
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
): Promise<Metadata> {
  const { genre, platform } = resolve(mediaType, slug, platformSlug);
  const noun = mediaType === "movie" ? "Movies" : "TV Shows";
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";
  const genreLower = genre.name.toLowerCase();

  if (!platform) {
    return pageMetadata({
      title: `${genre.name} ${noun}`,
      description: `The most popular ${genreLower} ${mediaNoun} right now, and where each one is streaming. Narrow them by year, rating, language or the services you pay for.`,
      path: genreHref(mediaType, genreSlug(genre)),
    });
  }

  const snapshot = await getGenreSnapshot(mediaType, genre.id, platform.slug);
  return pageMetadata({
    title: `${genre.name} ${noun} on ${platform.name}`,
    description: `${genre.name} ${mediaNoun} you can stream on ${platform.name} right now, most popular first. Save any of them to a free watchlist, no account needed.`,
    path: genreHref(mediaType, genreSlug(genre), { provider: platform.slug }),
    // A landing with a handful of titles is thin, and dozens of them read as
    // doorway pages – see `MIN_INDEXABLE_LANDING_RESULTS`.
    noindex: !isIndexableLanding(snapshot?.totalResults),
  });
}

export async function GenreLandingPage({
  mediaType,
  slug,
  platformSlug,
}: {
  mediaType: MediaType;
  slug: string;
  platformSlug?: string;
}) {
  const { genre, platform } = resolve(mediaType, slug, platformSlug);
  const snapshot = await getGenreSnapshot(mediaType, genre.id, platform?.slug);
  const noun = mediaType === "movie" ? "Movies" : "TV Shows";
  const genreUrl = absoluteUrl(genreHref(mediaType, genreSlug(genre)));

  const breadcrumbItems = [
    { name: "Home", url: SITE_URL },
    { name: "Genres", url: absoluteUrl("/genres") },
    { name: `${genre.name} ${noun}`, url: genreUrl },
  ];
  if (platform) {
    breadcrumbItems.push({
      name: platform.name,
      url: absoluteUrl(
        genreHref(mediaType, genreSlug(genre), { provider: platform.slug }),
      ),
    });
  }

  return (
    <>
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} />
      <GenreListing
        mediaType={mediaType}
        genre={genre}
        platform={platform}
        snapshot={snapshot}
      />
    </>
  );
}
