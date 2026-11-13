"use client";

import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WatchlistButton } from "@/components/WatchlistButton";
import {
  likeIntroduction,
  likeNoun,
  type LikePageData,
  type LikeTitle,
} from "@/lib/like-titles";
import { genreHref, likeHref, likePath, mediaHref } from "@/lib/routes";
import { getImageUrl } from "@/lib/tmdb-image";
import { createSlug } from "@/lib/utils";
import type { MediaType } from "@/types/tmdb";

/**
 * The visible half of a "like this" page: the heading, the ranked list, the
 * links onward.
 *
 * A Client Component for a reason that has nothing to do with interactivity –
 * the page fetches nothing and the only thing on it that responds to a click
 * is the watchlist button. It is about what Next writes to disk. A Server
 * Component's payload is its whole rendered tree, every element and class name,
 * and a static export writes that payload three times beside the HTML; as one,
 * this page was 360 KB. A Client Component's payload is its props – the
 * twenty titles as data, a fifth of the size – and the same page is about half
 * that. With several hundred of these competing with the title pages for
 * GitHub Pages' 1 GB (`LIKE_PAGE_LIMITS`), that is the difference between
 * affording them and not.
 *
 * The links are built here from the same inlined lists the title pages use
 * (`routes.ts`), so the prerendered HTML and the hydrating browser agree.
 */
function LikeRow({
  mediaType,
  item,
  position,
}: {
  mediaType: MediaType;
  item: LikeTitle;
  position: number;
}) {
  const href = mediaHref(mediaType, item.slug);
  const moreLikeIt = likeHref(mediaType, item.slug);
  const noun = likeNoun(mediaType);

  return (
    <li className="flex gap-4 sm:gap-5 py-5 border-b border-gray-800">
      <span
        aria-hidden="true"
        className="w-7 shrink-0 pt-1 text-right text-lg font-semibold text-gray-500 tabular-nums"
      >
        {position}
      </span>
      <Link
        href={href}
        prefetch={false}
        tabIndex={-1}
        aria-hidden="true"
        className="relative w-20 sm:w-24 shrink-0 aspect-2/3 self-start"
      >
        {/* 96px at its widest, so w154 still covers a 1.5x screen and w185 a
            2x one; the first few are above the fold. */}
        <Image
          src={getImageUrl(item.posterPath, "w185")}
          alt=""
          fill
          sizes="96px"
          className="object-cover rounded"
          loading={position <= 3 ? "eager" : "lazy"}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-white leading-snug">
          <Link
            href={href}
            prefetch={false}
            className="hover:text-blue-400 transition-colors"
          >
            {item.title}
          </Link>
          {/* A real space, not a margin: the heading is read out as text, and
              "The Creator(2023)" is what a margin alone leaves in it. */}
          {item.year && (
            <>
              {" "}
              <span className="text-base font-normal text-gray-400">
                ({item.year})
              </span>
            </>
          )}
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          {item.voteCount > 0 && (
            <>
              <span className="text-yellow-400" aria-hidden="true">
                ★
              </span>{" "}
              {item.voteAverage.toFixed(1)}
              <span className="sr-only"> out of 10</span>
            </>
          )}
          {item.voteCount > 0 && item.sharedGenres.length > 0 && " · "}
          {item.sharedGenres.length > 0 && (
            <>Also {item.sharedGenres.join(", ").toLowerCase()}</>
          )}
        </p>
        {item.overview && (
          <p className="mt-2 text-sm text-gray-300 leading-relaxed">
            {item.overview}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <WatchlistButton
            variant="compact"
            className="bg-gray-800 hover:bg-gray-700"
            item={{
              id: item.id,
              title: item.title,
              poster_path: item.posterPath,
              backdrop_path: null,
              // The row prints the overview; the button only needs what a
              // watchlist entry stores, and the page pays for every byte twice.
              overview: "",
              release_date: item.releaseDate,
              vote_average: item.voteAverage,
              vote_count: item.voteCount,
              genre_ids: [],
              media_type: mediaType,
            }}
          />
          <Link
            href={href}
            prefetch={false}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Where to watch
          </Link>
          {moreLikeIt && (
            <Link
              href={moreLikeIt}
              prefetch={false}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {noun} like {item.title}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function LikeTitlesList({ page }: { page: LikePageData }) {
  const { mediaType } = page;
  const noun = likeNoun(mediaType);
  const sectionHref = mediaType === "movie" ? "/movies" : "/tv-shows";
  const sectionLabel = mediaType === "movie" ? "Movies" : "TV Shows";
  const titleHref = mediaHref(mediaType, page.slug);
  const heading = `${noun} like ${page.title}`;
  const year = page.year ? ` (${page.year})` : "";

  return (
    <>
      <Breadcrumbs
        className="mb-6"
        items={[
          { label: sectionLabel, href: sectionHref },
          { label: page.title, href: titleHref },
          { label: heading, href: likePath(mediaType, page.slug) },
        ]}
      />

      <div className="max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-3">{heading}</h1>
        {page.items.length > 0 ? (
          <p className="text-gray-300 text-lg leading-relaxed">
            {likeIntroduction(page)}
          </p>
        ) : (
          <p className="text-gray-300 text-lg leading-relaxed">
            TMDB has nothing to recommend after {page.title} yet.
          </p>
        )}

        {/* The title the list is about, and the way to its own page – which is
            where its streaming services, cast and trailer are. */}
        <Link
          href={titleHref}
          prefetch={false}
          className="mt-6 flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4 hover:border-gray-700 hover:bg-gray-900 transition-colors"
        >
          <span className="relative w-12 shrink-0 aspect-2/3">
            <Image
              src={getImageUrl(page.posterPath, "w92")}
              alt=""
              fill
              sizes="48px"
              className="object-cover rounded"
              loading="eager"
            />
          </span>
          <span>
            <span className="block font-semibold text-white">
              {page.title}
              {year}
            </span>
            <span className="block text-sm text-gray-400">
              Where to watch it, cast and trailer →
            </span>
          </span>
        </Link>

        <ol className="mt-6">
          {page.items.map((item, index) => (
            <LikeRow
              key={item.id}
              mediaType={mediaType}
              item={item}
              position={index + 1}
            />
          ))}
        </ol>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white mb-3">
            Where this list comes from
          </h2>
          <p className="text-gray-400 leading-relaxed">
            From TMDB: first what people who watched {page.title} went on to
            watch, then titles that share its genres and keywords. Nobody is
            paid to be on it, and it is rebuilt every day, so it changes as
            people watch.
          </p>
        </section>

        {page.genres.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-white mb-4">
              More of the same kind
            </h2>
            <ul className="flex flex-wrap gap-2">
              {page.genres.map((genre) => (
                <li key={genre.id}>
                  <Link
                    href={genreHref(mediaType, createSlug(genre.name, genre.id))}
                    prefetch={false}
                    className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    {genre.name} {noun.toLowerCase()}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/moods"
                  prefetch={false}
                  className="inline-flex items-center px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Browse by mood →
                </Link>
              </li>
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
