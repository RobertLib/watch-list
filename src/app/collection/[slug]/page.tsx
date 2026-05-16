import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { cache } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MemoizedMediaCard } from "@/components/MediaCard";
import { StructuredData } from "@/components/StructuredData";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import type { MediaItem } from "@/types/tmdb";

export const revalidate = 2592000; // 1 month

interface CollectionPageProps {
  params: Promise<{
    slug: string;
  }>;
}

const getCollectionData = cache(async (id: number) => {
  try {
    return await tmdbApi.getCollectionDetails(id);
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) return { title: "Collection not found" };

  const collection = await getCollectionData(id);
  if (!collection) return { title: "Collection not found" };

  const canonicalUrl = `https://www.watch-list.me/collection/${createSlug(collection.name, collection.id)}`;
  const description =
    collection.overview ||
    `All movies in the ${collection.name} collection on WatchList.`;

  const movieTitles = collection.parts.map((p) => p.title).filter(Boolean);
  const keywords = [
    collection.name,
    ...movieTitles,
    "movie collection",
    "film series",
    "WatchList",
  ];

  return {
    title: collection.name,
    description,
    keywords,
    openGraph: {
      title: collection.name,
      description,
      url: canonicalUrl,
      siteName: "WatchList",
      type: "website",
      images: collection.backdrop_path
        ? [
            {
              url: tmdbApi.getImageUrl(collection.backdrop_path, "w1280"),
              width: 1280,
              height: 720,
              alt: collection.name,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: collection.name,
      description,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) notFound();

  const collection = await getCollectionData(id);
  if (!collection) notFound();

  const canonicalSlug = createSlug(collection.name, id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/collection/${canonicalSlug}`);
  }

  const canonicalUrl = `https://www.watch-list.me/collection/${canonicalSlug}`;

  // Sort parts by release date ascending
  const sortedParts = [...collection.parts].sort((a, b) => {
    const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
    const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
    return dateA - dateB;
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
      />
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: "https://www.watch-list.me" },
            { name: "Movies", url: "https://www.watch-list.me/movies" },
            { name: collection.name, url: canonicalUrl },
          ],
        }}
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
              priority
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/40 via-black/50 to-gray-900" />
          </div>
        ) : (
          <div className="h-32 w-full bg-gray-800" />
        )}

        {/* Poster + title overlay */}
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 max-w-6xl pb-6 flex items-end gap-5">
          {collection.poster_path && (
            <div className="relative w-24 h-36 sm:w-32 sm:h-48 shrink-0 rounded-lg shadow-2xl overflow-hidden hidden sm:block">
              <Image
                src={tmdbApi.getImageUrl(collection.poster_path, "w500")}
                alt={collection.name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="pb-1">
            <p className="text-gray-300 text-xs uppercase tracking-widest mb-1">
              Collection
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow">
              {collection.name}
            </h1>
            <p className="text-gray-300 text-sm mt-1">
              {movies.length} {movies.length === 1 ? "film" : "films"}
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Breadcrumbs
          items={[
            { label: "Movies", href: "/movies" },
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
            <MemoizedMediaCard key={`${movie.id}-${index}`} item={movie} />
          ))}
        </div>
      </div>
    </div>
  );
}
