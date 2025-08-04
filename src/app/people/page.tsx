import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { createSlug } from "@/lib/utils";
import { PeopleContent } from "@/components/PeopleContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People",
  description:
    "Discover popular actors, directors, and other film and TV personalities. Browse profiles and their work on WatchList.",
  keywords: [
    "actors",
    "directors",
    "film personalities",
    "tv personalities",
    "popular actors",
    "celebrity profiles",
    "filmography",
  ],
  openGraph: {
    title: "People - WatchList",
    description:
      "Discover popular actors, directors, and other film and TV personalities.",
    type: "website",
    url: "https://www.watch-list.me/people",
    siteName: "WatchList",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "People - WatchList",
    description:
      "Discover popular actors, directors, and other film and TV personalities. Browse profiles and their work on WatchList.",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://www.watch-list.me/people",
  },
};

export default async function PeoplePage() {
  const [page1, page2] = await Promise.all([
    tmdbApi.getPopularPeople(1),
    tmdbApi.getPopularPeople(2),
  ]);

  const people = Array.from(
    new Map(
      [...page1.results, ...page2.results].map((p) => [p.id, p]),
    ).values(),
  );
  const featured = people[0];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero */}
      {featured && (
        <div className="relative overflow-hidden bg-gray-950">
          {/* Blurred background from first person's poster */}
          <div className="absolute inset-0 scale-110">
            <Image
              src={tmdbApi.getImageUrl(featured.profile_path, "w500")}
              alt={`${featured.name} background`}
              fill
              className="object-cover blur-2xl opacity-20"
              aria-hidden="true"
              loading="eager"
            />
          </div>
          <div className="absolute inset-0 bg-linear-to-r from-gray-950/90 via-gray-950/70 to-transparent" />
          <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-transparent to-transparent" />

          <div className="relative container mx-auto px-4 py-12 max-w-6xl">
            <div className="flex items-center gap-8">
              <Link
                href={`/person/${createSlug(featured.name, featured.id)}`}
                className="group shrink-0"
              >
                <div className="relative w-32 h-48 md:w-40 md:h-60 overflow-hidden rounded-xl shadow-2xl ring-2 ring-white/10 group-hover:ring-blue-500/60 transition-all">
                  <Image
                    src={tmdbApi.getImageUrl(featured.profile_path, "w500")}
                    alt={featured.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="eager"
                    fetchPriority="high"
                  />
                </div>
              </Link>
              <div>
                <p className="text-blue-400 text-sm font-medium uppercase tracking-widest mb-2">
                  Most Popular Right Now
                </p>
                <Link
                  href={`/person/${createSlug(featured.name, featured.id)}`}
                  className="hover:text-blue-400 transition-colors"
                >
                  <h2 className="text-3xl md:text-4xl font-bold mb-1">
                    {featured.name}
                  </h2>
                </Link>
                <p className="text-gray-400 mb-3">
                  {featured.known_for_department}
                </p>
                <div className="flex flex-wrap gap-2">
                  {featured.known_for.slice(0, 3).map((item) => {
                    const title =
                      "title" in item
                        ? (item as { title: string }).title
                        : "name" in item
                          ? (item as { name: string }).name
                          : "";
                    if (!title) return null;
                    return (
                      <span
                        key={(item as { id: number }).id}
                        className="px-3 py-1 bg-white/10 rounded-full text-sm text-gray-200"
                      >
                        {title}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold mb-2">Popular People</h1>
        <p className="text-gray-400 mb-6">
          The most popular personalities in film and TV this week
        </p>

        <PeopleContent people={people} />
      </div>
    </div>
  );
}
