import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MediaSection } from "@/components/MediaSection";
import { tmdbServerApi } from "@/lib/tmdb-server";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "@/lib/media-converters";
import { findMood, MOODS } from "@/lib/moods";

export const revalidate = 86400;

// Crawlable depth. The value of these pages is the first screenful, not page 40.
const MAX_PAGE = 10;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

/** One page per mood, known at build time. */
export function generateStaticParams() {
  return MOODS.map((mood) => ({ slug: mood.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const mood = findMood(slug);

  if (!mood) return { title: "Mood not found" };

  const canonical = `https://www.watch-list.me/mood/${mood.slug}`;
  const title = `${mood.label} – What to Watch`;

  return {
    title,
    description: mood.description,
    keywords: [
      `${mood.label.toLowerCase()} movies`,
      "what to watch",
      "movie recommendations by mood",
      "what should i watch",
    ],
    openGraph: {
      title: `${title} – WatchList`,
      description: mood.description,
      type: "website",
      url: canonical,
      siteName: "WatchList",
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: `${mood.label} – WatchList`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} – WatchList`,
      description: mood.description,
      images: ["/opengraph-image.png"],
    },
    alternates: { canonical },
  };
}

export default async function MoodPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const mood = findMood(slug);

  if (!mood) notFound();

  const page = Math.max(
    1,
    Math.min(parseInt(query.page ?? "1", 10) || 1, MAX_PAGE),
  );

  // Both halves are fetched together where the mood has a television side; a
  // failure in either drops that section rather than the page.
  const [movieResult, showResult] = await Promise.allSettled([
    tmdbServerApi.discoverMovies(page, mood.movie),
    mood.tv ? tmdbServerApi.discoverTVShows(page, mood.tv) : Promise.resolve(null),
  ]);

  const movies =
    movieResult.status === "fulfilled"
      ? movieResult.value.results.map(convertMovieToMediaItem)
      : [];
  const shows =
    showResult.status === "fulfilled" && showResult.value
      ? showResult.value.results.map(convertTVShowToMediaItem)
      : [];

  const totalPages =
    movieResult.status === "fulfilled"
      ? Math.min(movieResult.value.total_pages, MAX_PAGE)
      : 1;

  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          href="/mood"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          All moods
        </Link>
        <h1 className="text-4xl font-bold text-white mb-3">
          <span aria-hidden="true" className="mr-2">
            {mood.emoji}
          </span>
          {mood.label}
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          {mood.description}
          {page > 1 && ` – page ${page}`}
        </p>
      </div>

      <MediaSection
        title={shows.length > 0 ? "Films" : ""}
        items={movies}
        size="medium"
        showViewToggle
        emptyMessage="Nothing came back for this one. Try another mood."
      />

      {shows.length > 0 && (
        <div className="mt-12">
          <MediaSection
            title="Series"
            items={shows}
            size="medium"
            emptyMessage=""
          />
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-4 mt-12"
        >
          {page > 1 && (
            <Link
              href={
                page - 1 === 1
                  ? `/mood/${mood.slug}`
                  : `/mood/${mood.slug}?page=${page - 1}`
              }
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="text-gray-400 text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/mood/${mood.slug}?page=${page + 1}`}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              Next →
            </Link>
          )}
        </nav>
      )}

      <section className="mt-16 border-t border-gray-800 pt-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Another kind of evening
        </h2>
        <ul className="flex flex-wrap gap-2">
          {MOODS.filter((other) => other.slug !== mood.slug).map((other) => (
            <li key={other.slug}>
              <Link
                href={`/mood/${other.slug}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <span aria-hidden="true">{other.emoji}</span>
                {other.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
