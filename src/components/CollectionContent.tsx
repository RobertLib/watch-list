"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MemoizedMediaCard } from "@/components/MediaCard";
import { StructuredData } from "@/components/StructuredData";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { NotFoundNotice, isNotFoundError } from "@/components/NotFoundNotice";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import { absoluteLocalizedUrl, collectionHref } from "@/lib/routes";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount } from "@/i18n/format";
import type { MediaItem } from "@/types/tmdb";

/** A film series – "the Alien collection" – named by `?id=` like every title. */
export function CollectionContent() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <CollectionDetail />
    </Suspense>
  );
}

function CollectionSkeleton() {
  const t = useT();
  return (
    <div className="min-h-screen bg-gray-900">
      <div className="h-64 sm:h-80 w-full bg-gray-800 animate-pulse" />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <LoadingSection
          title={t("Loading collection...", "Načítání kolekce…")}
          count={4}
        />
      </div>
    </div>
  );
}

function CollectionDetail() {
  const searchParams = useSearchParams();
  const id = extractIdFromSlug(searchParams.get("id") ?? "");
  const locale = useLocale();
  const t = useT();

  const { data, isLoading, error, reload } = useAsyncData(
    async () => (id ? tmdbApi.getCollectionDetails(id) : null),
    [id],
  );

  useDocumentTitle(data ? data.name : null);
  useCanonicalUrl(
    data
      ? absoluteLocalizedUrl(collectionHref(createSlug(data.name, data.id)), locale)
      : null,
  );

  if (isLoading) return <CollectionSkeleton />;

  // A miss and a failure are different pages. TMDB answering 404 means the
  // title is not there; TMDB not answering – a rate limit, a timeout, an
  // outage – means it may well be, and deserves a "try again" rather than a
  // "does not exist".
  if (error && !isNotFoundError(error)) {
    return (
      <LoadFailureNotice
        title={t("Could not load this collection", "Kolekci se nepodařilo načíst")}
        description={t(
          "TMDB did not answer. It may be a connection problem, or the service may be busy – the collection is probably still there.",
          "TMDB neodpovídá. Může jít o potíže s připojením, nebo je služba přetížená – kolekce tam nejspíš pořád je.",
        )}
        onRetry={reload}
      />
    );
  }

  if (!data) {
    return (
      <NotFoundNotice
        title={t("Collection not found", "Kolekce nenalezena")}
        description={t(
          "We could not find that collection. It may have been removed from TMDB, or the link may be incomplete.",
          "Tuto kolekci jsme nenašli. Možná byla z TMDB odstraněna, nebo je odkaz neúplný.",
        )}
        backHref="/movies"
        backLabel={t("Browse movies", "Procházet filmy")}
      />
    );
  }

  const collection = data;
  const canonicalUrl = absoluteLocalizedUrl(
    collectionHref(createSlug(collection.name, collection.id)),
    locale,
  );

  // Release order, undated parts last. TMDB lists an announced sequel with
  // `release_date: ""`, which used to read as time zero and put the film nobody
  // has seen yet ahead of the first one. The dates are ISO `YYYY-MM-DD`, so they
  // compare correctly as strings – and without a `Date`, no time zone can shift
  // one across midnight.
  const sortedParts = [...collection.parts].sort((a, b) => {
    const dateA = a.release_date || null;
    const dateB = b.release_date || null;
    if (dateA === dateB) return 0;
    if (dateA === null) return 1;
    if (dateB === null) return -1;
    return dateA < dateB ? -1 : 1;
  });

  const movies: MediaItem[] = sortedParts.map((movie) => ({
    ...movie,
    title: movie.title,
    media_type: "movie" as const,
  }));

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <StructuredData
        type="MovieCollection"
        data={{
          url: canonicalUrl,
          name: collection.name,
          overview: collection.overview ?? undefined,
          poster_path: collection.poster_path ?? undefined,
          parts: sortedParts.map((p) => ({
            id: p.id,
            title: p.title,
            release_date: p.release_date,
            poster_path: p.poster_path,
          })),
        }}
        locale={locale}
      />
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: t("Home", "Domů"), url: absoluteLocalizedUrl("/", locale) },
            { name: t("Movies", "Filmy"), url: absoluteLocalizedUrl("/movies", locale) },
            { name: collection.name, url: canonicalUrl },
          ],
        }}
        locale={locale}
      />
      {/* Hero */}
      <div className="relative">
        {collection.backdrop_path ? (
          <div className="relative h-64 sm:h-80 w-full">
            <Image
              src={tmdbApi.getImageUrl(collection.backdrop_path, "w1280")}
              alt={collection.name}
              fill
              className="object-cover"
              preload
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/40 via-black/50 to-gray-900" />
          </div>
        ) : (
          <div className="h-64 sm:h-80 w-full bg-gray-800" />
        )}

        {/* Poster + title overlay */}
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 max-w-6xl pb-6 flex items-end gap-5">
          {collection.poster_path && (
            <div className="relative w-24 h-36 sm:w-32 sm:h-48 shrink-0 rounded-lg shadow-2xl overflow-hidden hidden sm:block">
              {/* Shown at 128px wide at most: w300 covers that at 2x. */}
              <Image
                src={tmdbApi.getImageUrl(collection.poster_path, "w300")}
                alt={collection.name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="pb-1">
            <p className="text-gray-300 text-xs uppercase tracking-widest mb-1">
              {t("Collection", "Kolekce")}
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow">
              {collection.name}
            </h1>
            <p className="text-gray-300 text-sm mt-1">
              {formatCount(movies.length, locale, {
                en: ["film", "films"],
                cs: ["film", "filmy", "filmů"],
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Breadcrumbs
          items={[
            { label: t("Movies", "Filmy"), href: "/movies" },
            { label: collection.name, href: "#" },
          ]}
        />

        {collection.overview && (
          <p className="mt-6 text-gray-300 max-w-3xl leading-relaxed">
            {collection.overview}
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {movies.map((movie, index) => (
            <MemoizedMediaCard key={`${movie.id}-${index}`} item={movie} fluid />
          ))}
        </div>
      </div>
    </div>
  );
}
