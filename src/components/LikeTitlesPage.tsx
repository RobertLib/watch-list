import type { Metadata } from "next";
import Link from "next/link";
import { StructuredData } from "@/components/StructuredData";
import { LikeTitlesList } from "@/components/LikeTitlesList";
import { pageMetadata } from "@/lib/page-metadata";
import { getMovieLikeSnapshot, getTVLikeSnapshot } from "@/lib/build-time-tmdb";
import {
  isIndexableLikePage,
  likeNoun,
  type LikePageData,
} from "@/lib/like-titles";
import {
  SITE_URL,
  absoluteMediaUrl,
  absoluteUrl,
  likePath,
  mediaHref,
} from "@/lib/routes";
import { getImageUrlOrNull } from "@/lib/tmdb-image";
import { extractIdFromSlug } from "@/lib/utils";
import type { MediaType } from "@/types/tmdb";

/**
 * The two "like this" routes – `/movies-like/[slug]` and `/shows-like/[slug]`
 * – are thin files over this one.
 *
 * The list is the build's and there is nothing for the browser to refetch – no
 * region in it, no filters, and tomorrow's build writes tomorrow's. This file
 * is the half a server has to do: the `<head>`, the structured data, and
 * reading the snapshot. What the visitor sees is `LikeTitlesList`, which says
 * why it is a Client Component when nothing on it needs to be.
 */

/** Search results cut a description at about this many characters. */
const DESCRIPTION_LENGTH = 155;

export function likeSnapshotFor(
  mediaType: MediaType,
  slug: string,
): Promise<LikePageData | null> {
  const id = extractIdFromSlug(slug);
  if (id === null) return Promise.resolve(null);
  return mediaType === "movie" ? getMovieLikeSnapshot(id) : getTVLikeSnapshot(id);
}

export async function likePageMetadata(
  mediaType: MediaType,
  slug: string,
): Promise<Metadata> {
  const page = await likeSnapshotFor(mediaType, slug);
  const noun = likeNoun(mediaType);
  const path = likePath(mediaType, slug);

  // No snapshot – a build without TMDB access – is a page with no list on it.
  if (!page) {
    return pageMetadata({
      title: `${noun} Like This`,
      description: `${noun} to watch next, picked for what they share with a title you already like.`,
      path,
      noindex: true,
    });
  }

  const year = page.year ? ` (${page.year})` : "";
  const names = page.items.slice(0, 3).map((item) => item.title).join(", ");
  const description = `${page.items.length} ${noun.toLowerCase()} like ${page.title}: ${names} and more. See what each shares with it and where to watch.`;
  const backdrop = getImageUrlOrNull(page.backdropPath, "w1280");

  return pageMetadata({
    title: `${noun} Like ${page.title}${year}`,
    description:
      description.length <= DESCRIPTION_LENGTH
        ? description
        : `${page.items.length} ${noun.toLowerCase()} like ${page.title}${year}, with what each one shares with it and where to watch.`,
    path,
    // A handful of titles is a thin page – see `MIN_INDEXABLE_LIKE_RESULTS`.
    noindex: !isIndexableLikePage(page),
    image: backdrop
      ? { url: backdrop, width: 1280, height: 720, alt: page.title }
      : undefined,
  });
}

export async function LikeTitlesPage({
  mediaType,
  slug,
}: {
  mediaType: MediaType;
  slug: string;
}) {
  const page = await likeSnapshotFor(mediaType, slug);
  const noun = likeNoun(mediaType);
  const sectionHref = mediaType === "movie" ? "/movies" : "/tv-shows";
  const sectionLabel = mediaType === "movie" ? "Movies" : "TV Shows";

  // A build without TMDB access has no list to show. The page still has to
  // exist – a static export refuses a dynamic route that lists no params – so
  // it says what it would be and sends the visitor to the title.
  if (!page) {
    return (
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-white mb-3">{noun} like this</h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          This list is written when the site is built, and this build could not
          reach TMDB.{" "}
          <Link
            href={mediaHref(mediaType, slug)}
            prefetch={false}
            className="text-blue-400 hover:text-blue-300"
          >
            Open the title&apos;s own page
          </Link>{" "}
          for its similar titles instead.
        </p>
      </div>
    );
  }

  const titleUrl = absoluteMediaUrl(mediaType, page.slug);
  const pageUrl = absoluteUrl(likePath(mediaType, page.slug));
  const heading = `${noun} like ${page.title}`;

  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: SITE_URL },
            { name: sectionLabel, url: absoluteUrl(sectionHref) },
            { name: page.title, url: titleUrl },
            { name: heading, url: pageUrl },
          ],
        }}
      />
      {page.items.length > 0 && (
        <StructuredData
          type="TitleList"
          data={{
            name: heading,
            url: pageUrl,
            titles: page.items.map((item) => ({
              id: item.id,
              title: item.title,
              mediaType,
            })),
          }}
        />
      )}
      <LikeTitlesList page={page} />
    </div>
  );
}
