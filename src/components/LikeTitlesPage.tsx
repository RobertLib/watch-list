import type { Metadata } from "next";
import Link from "@/i18n/Link";
import { StructuredData } from "@/components/StructuredData";
import { LikeTitlesList } from "@/components/LikeTitlesList";
import { pageMetadata } from "@/lib/page-metadata";
import { getMovieLikeSnapshot, getTVLikeSnapshot } from "@/lib/build-time-tmdb";
import {
  isIndexableLikePage,
  likeHeading,
  likeNoun,
  type LikePageData,
} from "@/lib/like-titles";
import {
  absoluteLocalizedUrl,
  absoluteMediaUrl,
  likePath,
  mediaHref,
} from "@/lib/routes";
import { likePageSlug } from "@/lib/prerendered-titles-server";
import { t, type Locale } from "@/i18n/locale";
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
  locale: Locale = "en",
): Promise<LikePageData | null> {
  const id = extractIdFromSlug(slug);
  if (id === null) return Promise.resolve(null);
  return mediaType === "movie"
    ? getMovieLikeSnapshot(id, locale)
    : getTVLikeSnapshot(id, locale);
}

/**
 * The page's address in each tree, for `hreflang`: the two trees write their
 * "like this" pages under their own slugs, and not every title has both.
 */
function likeLanguages(mediaType: MediaType, slug: string) {
  const id = extractIdFromSlug(slug);
  if (id === null) return false as const;
  const en = likePageSlug(mediaType, id, "en");
  const cs = likePageSlug(mediaType, id, "cs");
  return {
    en: en ? likePath(mediaType, en) : null,
    cs: cs ? likePath(mediaType, cs, "cs") : null,
  };
}

export async function likePageMetadata(
  mediaType: MediaType,
  slug: string,
  locale: Locale = "en",
): Promise<Metadata> {
  const page = await likeSnapshotFor(mediaType, slug, locale);
  const noun = likeNoun(mediaType, locale);
  const path = likePath(mediaType, slug);

  // No snapshot – a build without TMDB access – is a page with no list on it.
  if (!page) {
    return pageMetadata({
      title: t(locale, `${noun} Like This`, `${noun} jako tento titul`),
      description: t(
        locale,
        `${noun} to watch next, picked for what they share with a title you already like.`,
        `${noun}, na které se podívat dál – vybrané podle toho, co mají společného s titulem, který máte rádi.`,
      ),
      path,
      locale,
      noindex: true,
    });
  }

  const year = page.year ? ` (${page.year})` : "";
  // Joined with commas alone: "and more" / „a další“ follows the last one.
  const names = page.items.slice(0, 3).map((item) => item.title).join(", ");
  const count = page.items.length;
  const description = t(
    locale,
    `${count} ${noun.toLowerCase()} like ${page.title}: ${names} and more. See what each shares with it and where to watch.`,
    `${count} ${noun.toLowerCase()} jako ${page.title}: ${names} a další. Co mají společného a kde je sledovat.`,
  );
  const backdrop = getImageUrlOrNull(page.backdropPath, "w1280");

  return pageMetadata({
    // Title case in English ("Movies Like Inception"), as a title is written;
    // Czech capitalises only the first word.
    title: `${t(locale, `${noun} Like ${page.title}`, likeHeading(mediaType, page.title, locale))}${year}`,
    description:
      description.length <= DESCRIPTION_LENGTH
        ? description
        : t(
            locale,
            `${count} ${noun.toLowerCase()} like ${page.title}${year}, with what each one shares with it and where to watch.`,
            `${count} ${noun.toLowerCase()} jako ${page.title}${year} – co s ním mají společného a kde je sledovat.`,
          ),
    path,
    locale,
    languages: likeLanguages(mediaType, slug),
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
  locale = "en",
}: {
  mediaType: MediaType;
  slug: string;
  locale?: Locale;
}) {
  const page = await likeSnapshotFor(mediaType, slug, locale);
  const noun = likeNoun(mediaType, locale);
  const sectionHref = mediaType === "movie" ? "/movies" : "/tv-shows";
  const sectionLabel =
    mediaType === "movie" ? t(locale, "Movies", "Filmy") : t(locale, "TV Shows", "Seriály");

  // A build without TMDB access has no list to show. The page still has to
  // exist – a static export refuses a dynamic route that lists no params – so
  // it says what it would be and sends the visitor to the title.
  if (!page) {
    return (
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-white mb-3">
          {t(locale, `${noun} like this`, `${noun} jako tento titul`)}
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          {t(
            locale,
            "This list is written when the site is built, and this build could not reach TMDB.",
            "Tento seznam vzniká při sestavení webu a toto sestavení se k TMDB nepřipojilo.",
          )}{" "}
          <Link
            href={mediaHref(mediaType, slug)}
            prefetch={false}
            className="text-blue-400 hover:text-blue-300"
          >
            {t(locale, "Open the title's own page", "Otevřete stránku titulu")}
          </Link>{" "}
          {t(
            locale,
            "for its similar titles instead.",
            "a podívejte se na podobné tituly tam.",
          )}
        </p>
      </div>
    );
  }

  const titleUrl = absoluteMediaUrl(mediaType, page.slug, locale);
  const pageUrl = absoluteLocalizedUrl(likePath(mediaType, page.slug), locale);
  const heading = likeHeading(mediaType, page.title, locale);

  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <StructuredData
        type="BreadcrumbList"
        locale={locale}
        data={{
          breadcrumbItems: [
            { name: t(locale, "Home", "Domů"), url: absoluteLocalizedUrl("/", locale) },
            { name: sectionLabel, url: absoluteLocalizedUrl(sectionHref, locale) },
            { name: page.title, url: titleUrl },
            { name: heading, url: pageUrl },
          ],
        }}
      />
      {page.items.length > 0 && (
        <StructuredData
          type="TitleList"
          locale={locale}
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
