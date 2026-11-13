import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { createSlug } from "@/lib/utils";
import { releaseYear } from "@/lib/dates";
import type { TVShow } from "@/types/tmdb";
import { tvHref } from "@/lib/routes";

/** How many the section shows; the snapshot keeps the same (`SIMILAR_KEPT`). */
const SHOWN = 9;

interface SimilarTVShowsProps {
  /** The titles like this one, closest first – `likeResults`. */
  similar: TVShow[];
  /**
   * The title's "shows like this" page, where the build wrote one: the full
   * list, with what each has in common. Null for a title without one.
   */
  allHref?: string | null;
  /**
   * The title these are similar to. The heading names it – "Shows like
   * Interstellar" is the phrase people look this section up by, where "Similar
   * Shows" said nothing about which.
   */
  title: string;
}

function SimilarTVShowsContent({ similar, title, allHref }: SimilarTVShowsProps) {
  if (similar.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold mb-6">Shows like {title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {similar.slice(0, SHOWN).map((show, index) => {
          const slug = createSlug(show.name, show.id);
          return (
            <Link
              key={show.id}
              href={tvHref(slug)}
              prefetch={false}
              className="flex gap-3 group"
            >
              <div className="relative w-16 shrink-0 aspect-2/3">
                {/* 64px wide, so w154 still covers a 2x screen. */}
                <Image
                  src={tmdbApi.getImageUrl(show.poster_path, "w154")}
                  alt={show.name}
                  fill
                  className="object-cover rounded group-hover:opacity-80 transition-opacity"
                  loading={index < 3 ? "eager" : "lazy"}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">
                  {show.name}
                </h3>
                <p className="text-gray-400 text-xs mb-1">
                  {releaseYear(show.first_air_date) ?? "Unknown"}
                </p>
                {show.overview && (
                  <p className="text-gray-300 text-xs line-clamp-3 leading-relaxed">
                    {show.overview}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {allHref && (
        <Link
          href={allHref}
          prefetch={false}
          className="inline-block mt-6 text-blue-400 hover:text-blue-300 transition-colors"
        >
          See all shows like {title} →
        </Link>
      )}
    </section>
  );
}

export function SimilarTVShows({ similar, title, allHref }: SimilarTVShowsProps) {
  return <SimilarTVShowsContent similar={similar} title={title} allHref={allHref} />;
}
