import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PersonBiography } from "@/components/person/PersonBiography";
import { PersonFilmography } from "@/components/person/PersonFilmography";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import { StructuredData } from "@/components/StructuredData";
import { getPersonWikipediaContent } from "@/lib/wikipedia";
import { extractIdFromSlug, createSlug } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PersonPageProps {
  params: Promise<{
    slug: string;
  }>;
}

const getPersonData = cache(async (id: number) => {
  try {
    const [details, movieCredits, tvCredits] = await Promise.all([
      tmdbApi.getPersonDetails(id),
      tmdbApi.getPersonMovieCredits(id),
      tmdbApi.getPersonTVCredits(id),
    ]);
    return { details, movieCredits, tvCredits };
  } catch {
    return null;
  }
});

function formatGender(gender: number): string {
  switch (gender) {
    case 1:
      return "Female";
    case 2:
      return "Male";
    case 3:
      return "Non-binary";
    default:
      return "Unknown";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function calculateAge(
  birthday: string | null,
  deathday: string | null,
): string | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  const age = Math.floor(
    (end.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
  );
  return String(age);
}

export async function generateMetadata({
  params,
}: PersonPageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) return { title: "Person not found" };

  const data = await getPersonData(id);
  if (!data) return { title: "Person not found" };

  const { details, movieCredits, tvCredits } = data;

  const description =
    details.biography
      ?.split("\n")
      .find((line) => line.trim().length > 0)
      ?.slice(0, 200) ||
    `${details.name} — ${details.known_for_department ?? "actor"} profile on WatchList.`;

  const canonicalUrl = `https://www.watch-list.me/person/${createSlug(details.name, details.id)}`;

  const topTitles = [
    ...movieCredits.cast
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 3)
      .map((m) => m.title),
    ...tvCredits.cast
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 2)
      .map((t) => t.name),
  ].filter(Boolean);

  const keywords = [
    details.name,
    details.known_for_department,
    ...topTitles,
    "actor profile",
    "filmography",
    "WatchList",
  ].filter((k): k is string => Boolean(k));

  return {
    title: details.name,
    description,
    keywords,
    openGraph: {
      title: `${details.name} — ${details.known_for_department ?? "Profile"}`,
      description,
      url: canonicalUrl,
      siteName: "WatchList",
      type: "profile",
      images: details.profile_path
        ? [
            {
              url: `https://image.tmdb.org/t/p/w780${details.profile_path}`,
              width: 780,
              height: 1170,
              alt: details.name,
              type: "image/jpeg",
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: details.name,
      description,
      images: details.profile_path
        ? [`https://image.tmdb.org/t/p/w780${details.profile_path}`]
        : [],
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

export default async function PersonPage({ params }: PersonPageProps) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) notFound();

  const data = await getPersonData(id);
  if (!data) notFound();

  const { details, movieCredits, tvCredits } = data;

  const canonicalSlug = createSlug(details.name, id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/person/${canonicalSlug}`);
  }

  const wikiContent = await getPersonWikipediaContent(
    details.name,
    details.known_for_department ?? undefined,
  );

  const age = calculateAge(details.birthday, details.deathday);

  // Career stats
  const allMovieYears = movieCredits.cast
    .map((m) =>
      m.release_date ? new Date(m.release_date).getFullYear() : null,
    )
    .filter((y): y is number => y !== null && !isNaN(y));
  const allTVYears = tvCredits.cast
    .map((t) =>
      t.first_air_date ? new Date(t.first_air_date).getFullYear() : null,
    )
    .filter((y): y is number => y !== null && !isNaN(y));
  const allYears = [...allMovieYears, ...allTVYears];
  const careerStart = allYears.length ? Math.min(...allYears) : null;
  const careerEnd = allYears.length ? Math.max(...allYears) : null;

  // "Known For" — scored by log(vote_count) * vote_average to favour
  // culturally significant works over lightly-rated talk-show appearances.
  // Deduplicate by id within each type first, then combine.
  const knownForScore = (voteCount: number, voteAvg: number) =>
    Math.log10(voteCount + 1) * voteAvg;

  const knownForMovies = Array.from(
    new Map(movieCredits.cast.map((m) => [m.id, m])).values(),
  )
    .filter((m) => m.vote_average > 0 && m.vote_count >= 50)
    .sort(
      (a, b) =>
        knownForScore(b.vote_count, b.vote_average) -
        knownForScore(a.vote_count, a.vote_average),
    )
    .slice(0, 6);
  const knownForTV = Array.from(
    new Map(tvCredits.cast.map((t) => [t.id, t])).values(),
  )
    // Exclude brief appearances (≤2 eps) — these are typically talk/award shows
    .filter(
      (t) => t.vote_average > 0 && t.vote_count >= 50 && t.episode_count >= 3,
    )
    .sort(
      (a, b) =>
        knownForScore(b.vote_count, b.vote_average) -
        knownForScore(a.vote_count, a.vote_average),
    )
    .slice(0, 6);
  // Interleave movies and TV, pick top 6 overall
  const knownForCombined = [
    ...knownForMovies.map((m) => ({ type: "movie" as const, item: m })),
    ...knownForTV.map((t) => ({ type: "tv" as const, item: t })),
  ]
    .sort(
      (a, b) =>
        knownForScore(b.item.vote_count, b.item.vote_average) -
        knownForScore(a.item.vote_count, a.item.vote_average),
    )
    .slice(0, 6);

  const canonicalUrl = `https://www.watch-list.me/person/${createSlug(details.name, id)}`;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <StructuredData
        type="Person"
        data={{
          url: canonicalUrl,
          name: details.name,
          overview: details.biography
            ?.split("\n")
            .find((l) => l.trim().length > 0)
            ?.slice(0, 300),
          poster_path: details.profile_path ?? undefined,
          release_date: details.birthday ?? undefined,
          deathDate: details.deathday ?? undefined,
          birthPlace: details.place_of_birth ?? undefined,
          jobTitle: details.known_for_department ?? undefined,
          sameAs: details.imdb_id
            ? `https://www.imdb.com/name/${details.imdb_id}`
            : undefined,
          performerIn: knownForCombined.map((w) => ({
            type: w.type,
            name:
              w.type === "movie"
                ? (w.item as { title: string }).title
                : (w.item as { name: string }).name,
            url:
              w.type === "movie"
                ? `https://www.watch-list.me/movie/${createSlug((w.item as { title: string }).title, w.item.id)}`
                : `https://www.watch-list.me/tv/${createSlug((w.item as { name: string }).name, w.item.id)}`,
          })),
        }}
      />
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: "https://www.watch-list.me" },
            { name: "People", url: "https://www.watch-list.me/people" },
            { name: details.name, url: canonicalUrl },
          ],
        }}
      />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Breadcrumbs
          items={[
            { label: "People", href: "/people" },
            { label: details.name, href: "#" },
          ]}
        />

        <div className="grid md:grid-cols-3 gap-8 mt-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="relative aspect-2/3 w-full max-w-sm mx-auto mb-6">
              <Image
                src={tmdbApi.getImageUrl(details.profile_path, "w500")}
                alt={details.name}
                fill
                className="object-cover rounded-lg shadow-2xl"
                loading="eager"
                fetchPriority="high"
              />
            </div>

            {/* Personal Info */}
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <h2 className="text-lg font-bold border-b border-gray-700 pb-2">
                Personal Info
              </h2>

              {details.known_for_department && (
                <div>
                  <dt className="text-gray-400 text-sm">Known For</dt>
                  <dd className="text-white">{details.known_for_department}</dd>
                </div>
              )}

              <div>
                <dt className="text-gray-400 text-sm">Gender</dt>
                <dd className="text-white">{formatGender(details.gender)}</dd>
              </div>

              {details.birthday && (
                <div>
                  <dt className="text-gray-400 text-sm">
                    {details.deathday ? "Born" : "Birthday"}
                  </dt>
                  <dd className="text-white">
                    {formatDate(details.birthday)}
                    {age && !details.deathday && (
                      <span className="text-gray-400 ml-1">
                        ({age} years old)
                      </span>
                    )}
                  </dd>
                </div>
              )}

              {details.deathday && (
                <div>
                  <dt className="text-gray-400 text-sm">Day of Death</dt>
                  <dd className="text-white">
                    {formatDate(details.deathday)}
                    {age && (
                      <span className="text-gray-400 ml-1">(aged {age})</span>
                    )}
                  </dd>
                </div>
              )}

              {details.place_of_birth && (
                <div>
                  <dt className="text-gray-400 text-sm">Place of Birth</dt>
                  <dd className="text-white">{details.place_of_birth}</dd>
                </div>
              )}

              {careerStart && (
                <div>
                  <dt className="text-gray-400 text-sm">Career</dt>
                  <dd className="text-white">
                    {careerStart}
                    {careerEnd && careerEnd !== careerStart
                      ? ` – ${careerEnd}`
                      : ""}
                  </dd>
                </div>
              )}

              {(movieCredits.cast.length > 0 || tvCredits.cast.length > 0) && (
                <div>
                  <dt className="text-gray-400 text-sm">Credits</dt>
                  <dd className="text-white">
                    {movieCredits.cast.length > 0 && (
                      <span>{movieCredits.cast.length} movies</span>
                    )}
                    {movieCredits.cast.length > 0 &&
                      tvCredits.cast.length > 0 && (
                        <span className="text-gray-500 mx-1">·</span>
                      )}
                    {tvCredits.cast.length > 0 && (
                      <span>{tvCredits.cast.length} TV shows</span>
                    )}
                  </dd>
                </div>
              )}

              {details.also_known_as && details.also_known_as.length > 0 && (
                <div>
                  <dt className="text-gray-400 text-sm mb-1">Also Known As</dt>
                  <dd className="space-y-1">
                    {details.also_known_as.slice(0, 5).map((alias) => (
                      <div key={alias} className="text-white text-sm">
                        {alias}
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2">
            <h1 className="text-4xl md:text-5xl font-bold mb-1">
              {details.name}
            </h1>
            {details.known_for_department && (
              <p className="text-blue-400 font-medium mb-4">
                {details.known_for_department}
              </p>
            )}

            {details.biography && (
              <PersonBiography biography={details.biography} />
            )}

            {/* Known For */}
            {knownForCombined.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-4">Known For</h2>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {knownForCombined.map(({ type, item }) => {
                    const title =
                      type === "movie"
                        ? (item as (typeof knownForMovies)[0]).title
                        : (item as (typeof knownForTV)[0]).name;
                    const href =
                      type === "movie"
                        ? `/movie/${createSlug(title, item.id)}`
                        : `/tv/${createSlug(title, item.id)}`;
                    const date =
                      type === "movie"
                        ? (item as (typeof knownForMovies)[0]).release_date
                        : (item as (typeof knownForTV)[0]).first_air_date;
                    const year = date ? new Date(date).getFullYear() : null;

                    return (
                      <Link
                        key={`${type}-${item.id}`}
                        href={href}
                        className="group block"
                      >
                        <div className="relative aspect-2/3 mb-2 overflow-hidden rounded-lg bg-gray-800">
                          <Image
                            src={tmdbApi.getImageUrl(item.poster_path, "w500")}
                            alt={title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="eager"
                          />
                          <div className="absolute top-1 right-1 bg-black/70 rounded px-1 py-0.5 text-xs text-yellow-400 flex items-center gap-0.5">
                            ★ {item.vote_average.toFixed(1)}
                          </div>
                        </div>
                        <p className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors leading-tight line-clamp-2">
                          {title}
                        </p>
                        {year && (
                          <p className="text-xs text-gray-500">{year}</p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Full Filmography */}
            <PersonFilmography
              movieCredits={movieCredits.cast}
              tvCredits={tvCredits.cast}
            />
            {wikiContent && <WikipediaInsights content={wikiContent} />}
          </div>
        </div>
      </div>
    </div>
  );
}
