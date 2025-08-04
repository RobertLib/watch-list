"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { MovieCast } from "@/components/movie/MovieCast";
import { SimilarMovies } from "@/components/movie/SimilarMovies";
import { MovieWatchProviders } from "@/components/movie/MovieWatchProviders";
import { MovieDetails } from "@/components/movie/MovieDetails";
import { MovieTrailerButton } from "@/components/movie/MovieTrailerButton";
import { MovieCollection } from "@/components/movie/MovieCollection";
import { DetailPageWatchlistButton } from "@/components/DetailPageWatchlistButton";
import { DetailPageWatchedButton } from "@/components/DetailPageWatchedButton";
import { AddToListButton } from "@/components/AddToListButton";
import { LanguageSupport } from "@/components/LanguageSupport";
import { StructuredData } from "@/components/StructuredData";
import { MediaBreadcrumbs } from "@/components/Breadcrumbs";
import { MediaKeywords } from "@/components/MediaKeywords";
import { MediaFullCrew } from "@/components/MediaFullCrew";
import { MediaReviews } from "@/components/MediaReviews";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import { MediaRatingPanel } from "@/components/MediaRatingPanel";
import { MediaGallery } from "@/components/MediaGallery";
import { MediaVideos } from "@/components/MediaVideos";
import { MediaDetailSkeleton } from "@/components/skeletons";
import { ShareButton } from "@/components/ShareButton";
import { UserRating } from "@/components/UserRating";
import { NotFoundNotice } from "@/components/NotFoundNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { useSettings } from "@/hooks/useSettings";
import { getMovieWikipediaContent } from "@/lib/wikipedia";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import { releaseYear, releaseYearSuffix } from "@/lib/dates";
import { resolveRegionProviders } from "@/lib/media-converters";
import { getRegionCode } from "@/lib/region";
import {
  SITE_URL,
  absoluteMediaUrl,
  absoluteUrl,
  genreHref,
  personHref,
} from "@/lib/routes";

const APPENDED_SECTIONS =
  "watch/providers,credits,videos,similar,translations,keywords,reviews,release_dates,images";

function formatRuntime(minutes: number | null): string {
  if (!minutes) return "Unknown runtime";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * A film.
 *
 * The title is named by `?id=550-fight-club` rather than by the path: a static
 * export can only serve paths that existed at build time, and TMDB's catalogue
 * is not a build-time list. `useSearchParams` is what reads it, which is why the
 * body sits behind a Suspense boundary – during the prerender there is no query
 * string to read, so the skeleton is what gets built into the HTML.
 */
export function MovieContent() {
  return (
    <Suspense fallback={<MediaDetailSkeleton />}>
      <MovieDetail />
    </Suspense>
  );
}

function MovieDetail() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("id") ?? "";
  const id = extractIdFromSlug(slug);
  const { region } = useSettings();

  const { data, isLoading } = useAsyncData(
    async () => (id ? tmdbApi.getMovieDetails(id, APPENDED_SECTIONS) : null),
    [id],
  );

  // A second, slower source that must not hold up the page: the film renders as
  // soon as TMDB answers, and the Wikipedia section appears when it appears.
  const { data: wikiContent } = useAsyncData(
    async () =>
      data
        ? getMovieWikipediaContent(
            data.title,
            releaseYear(data.release_date) ?? undefined,
          )
        : null,
    [data?.id, data?.title],
  );

  useDocumentTitle(
    data ? `${data.title}${releaseYearSuffix(data.release_date)}` : null,
  );
  useCanonicalUrl(
    data ? absoluteMediaUrl("movie", createSlug(data.title, data.id)) : null,
  );

  if (isLoading) return <MediaDetailSkeleton />;

  if (!data) {
    return (
      <NotFoundNotice
        title="Movie not found"
        description="We could not find that film. It may have been removed from TMDB, or the link may be incomplete."
        backHref="/movies"
        backLabel="Browse movies"
      />
    );
  }

  const details = data;
  const credits = details.credits || { cast: [], crew: [] };
  const videos = details.videos || { results: [] };
  const similar = details.similar || {
    page: 1,
    results: [],
    total_pages: 0,
    total_results: 0,
  };
  const translations = details.translations || {
    id: details.id,
    translations: [],
  };

  // Resolved from the already-appended watch/providers payload, so the "Where to
  // Watch" section costs no request of its own – and follows the region setting
  // without refetching, because every region is already in the payload.
  const watchProviders = resolveRegionProviders(
    details["watch/providers"],
    getRegionCode(region),
  );

  const trailer = videos.results.find(
    (video: { type: string; site: string }) =>
      video.type === "Trailer" && video.site === "YouTube",
  );

  const director = credits.crew.find(
    (member: { job: string }) => member.job === "Director",
  );
  const writers = Array.from(
    new Map(
      credits.crew
        .filter(
          (member: { job: string }) =>
            member.job === "Writer" ||
            member.job === "Screenplay" ||
            member.job === "Story",
        )
        .map((m: { id: number; name: string; job: string }) => [m.id, m]),
    ).values(),
  );

  // Extract US age certification, fall back to first available
  const certificationUS = details.release_dates?.results
    ?.find((r) => r.iso_3166_1 === "US")
    ?.release_dates?.find((d) => d.certification)?.certification;
  const certificationFallback = details.release_dates?.results
    ?.flatMap((r) => r.release_dates)
    ?.find((d) => d.certification)?.certification;
  const certification = certificationUS || certificationFallback;

  const canonicalSlug = createSlug(details.title, details.id);
  const pageUrl = absoluteMediaUrl("movie", canonicalSlug);

  const breadcrumbItems = [
    { name: "Home", url: SITE_URL },
    { name: "Movies", url: absoluteUrl("/movies") },
  ];

  if (details.genres && details.genres.length > 0) {
    const primaryGenre = details.genres[0];
    breadcrumbItems.push({
      name: primaryGenre.name,
      url: absoluteUrl(
        genreHref("movie", createSlug(primaryGenre.name, primaryGenre.id)),
      ),
    });
  }

  breadcrumbItems.push({ name: details.title, url: pageUrl });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <StructuredData
        type="Movie"
        data={{
          url: pageUrl,
          title: details.title,
          overview: details.overview,
          poster_path: details.poster_path || undefined,
          release_date: details.release_date,
          genres: details.genres,
          runtime: details.runtime || undefined,
          vote_average: details.vote_average,
          vote_count: details.vote_count,
          credits,
          production_companies: details.production_companies,
          production_countries: details.production_countries,
          keywords: details.keywords?.keywords?.map((k) => k.name),
          sameAs: details.imdb_id
            ? `https://www.imdb.com/title/${details.imdb_id}/`
            : undefined,
          trailer: trailer ?? undefined,
          contentRating: certification || undefined,
          inLanguage: details.spoken_languages?.[0]?.english_name || undefined,
        }}
      />
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} />

      {/* Hero Section with Backdrop */}
      <div className="relative">
        {details.backdrop_path && (
          <div className="absolute inset-0 z-0">
            <Image
              src={tmdbApi.getImageUrl(details.backdrop_path, "w1280")}
              alt={details.title}
              fill
              className="object-cover object-top"
              loading="eager"
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-black/60" />
          </div>
        )}
        <div className="relative z-10 container mx-auto px-4 py-8">
          {/* Breadcrumbs */}
          <MediaBreadcrumbs
            mediaType="movie"
            title={details.title}
            genres={details.genres}
          />
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl xl:max-w-7xl mt-6">
            {/* Poster */}
            {details.poster_path && (
              <div className="md:col-span-1">
                <div className="relative aspect-2/3 w-full max-w-sm mx-auto">
                  <Image
                    src={tmdbApi.getImageUrl(details.poster_path, "w500")}
                    alt={details.title}
                    fill
                    className="object-cover rounded-lg shadow-2xl"
                    loading="eager"
                  />
                </div>
              </div>
            )}

            {/* Movie Info */}
            <div
              className={`${details.poster_path ? "md:col-span-2" : "md:col-span-3"} text-white`}
            >
              <h1 className="text-4xl md:text-5xl font-bold mb-2">
                {details.title}
              </h1>
              {details.tagline && (
                <p className="text-xl text-gray-300 italic mb-4">
                  {details.tagline}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 mb-6">
                <span className="text-lg">
                  {releaseYear(details.release_date) ?? "N/A"}
                </span>
                <span>•</span>
                <span>{formatRuntime(details.runtime)}</span>
                <span>•</span>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">★</span>
                  <span>{details.vote_average?.toFixed(1)}</span>
                  <span className="text-gray-300">
                    ({details.vote_count.toLocaleString()} ratings)
                  </span>
                </div>
              </div>

              <GenreTags genres={details.genres} />

              {details.overview && (
                <div className="mt-6">
                  <h2 className="text-xl font-semibold mb-3">Overview</h2>
                  <p className="text-gray-200 leading-relaxed">
                    {details.overview}
                  </p>
                </div>
              )}

              {/* Key Crew */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {director && (
                  <div>
                    <h3 className="font-semibold">Director</h3>
                    <a
                      href={personHref(createSlug(director.name, director.id))}
                      className="text-gray-300 hover:text-white transition-colors"
                    >
                      {director.name}
                    </a>
                  </div>
                )}
                {writers.length > 0 && (
                  <div>
                    <h3 className="font-semibold">Writers</h3>
                    <p className="text-gray-300">
                      {writers.map(
                        (w: { id: number; name: string }, i: number) => (
                          <span key={w.id}>
                            {i > 0 && ", "}
                            <a
                              href={personHref(createSlug(w.name, w.id))}
                              className="hover:text-white transition-colors"
                            >
                              {w.name}
                            </a>
                          </span>
                        ),
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <MovieTrailerButton movieId={details.id} trailer={trailer} />
                <DetailPageWatchlistButton
                  id={details.id}
                  title={details.title}
                  posterPath={details.poster_path}
                  releaseDate={details.release_date}
                  voteAverage={details.vote_average}
                  mediaType="movie"
                />
                <DetailPageWatchedButton
                  id={details.id}
                  title={details.title}
                  posterPath={details.poster_path}
                  releaseDate={details.release_date}
                  voteAverage={details.vote_average}
                  mediaType="movie"
                />
                <AddToListButton
                  // Every other button in this row carries its own `mt-6` on
                  // top of the row's, so matching it is what puts this on the
                  // same line rather than 24px above everything else.
                  className="mt-6"
                  item={{
                    id: details.id,
                    mediaType: "movie",
                    title: details.title,
                    posterPath: details.poster_path,
                  }}
                />
                <ShareButton title={details.title} url={pageUrl} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <MovieCast credits={credits} />
            <MediaFullCrew credits={credits} />
            <MediaKeywords keywords={details.keywords?.keywords ?? []} />
            <MediaVideos videos={videos.results} />
            <MediaReviews reviews={details.reviews} />
            {wikiContent && <WikipediaInsights content={wikiContent} />}
            <MediaGallery
              backdrops={details.images?.backdrops ?? []}
              posters={details.images?.posters ?? []}
              title={details.title}
            />
            {details.belongs_to_collection && (
              <MovieCollection collection={details.belongs_to_collection} />
            )}
            <SimilarMovies similar={similar} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <MediaRatingPanel
              voteAverage={details.vote_average}
              voteCount={details.vote_count}
              reviews={details.reviews}
            />
            {/* Directly under the audience score, so "what everyone thought" and
                "what I thought" read as one thing. */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
              <UserRating
                item={{
                  id: details.id,
                  title: details.title,
                  poster_path: details.poster_path,
                  backdrop_path: details.backdrop_path,
                  overview: details.overview,
                  release_date: details.release_date,
                  vote_average: details.vote_average,
                  vote_count: details.vote_count,
                  genre_ids: details.genres?.map((genre) => genre.id) ?? [],
                  media_type: "movie",
                }}
              />
            </div>
            <MovieWatchProviders
              providers={watchProviders}
              title={details.title}
            />
            <LanguageSupport translations={translations} />
            <MovieDetails details={details} certification={certification} />
          </div>
        </div>
      </div>
    </div>
  );
}
