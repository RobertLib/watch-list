"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { TVCast } from "@/components/tv/TVCast";
import { SimilarTVShows } from "@/components/tv/SimilarTVShows";
import { TVWatchProviders } from "@/components/tv/TVWatchProviders";
import { TVDetails } from "@/components/tv/TVDetails";
import { TVTrailerButton } from "@/components/tv/TVTrailerButton";
import { TVSeasons } from "@/components/tv/TVSeasons";
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
import { getTVWikipediaContent } from "@/lib/wikipedia";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import {
  formatTmdbDate,
  releaseYear,
  releaseYearSuffix,
} from "@/lib/dates";
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
  "watch/providers,credits,videos,similar,translations,keywords,reviews,content_ratings,external_ids,images";

function formatRuntime(minutes: number[]): string {
  if (!minutes || minutes.length === 0) return "Unknown runtime";
  const avgMinutes =
    minutes.reduce((sum, time) => sum + time, 0) / minutes.length;
  const hours = Math.floor(avgMinutes / 60);
  const mins = Math.round(avgMinutes % 60);
  return hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;
}

/**
 * A series. The mirror of the film page, and addressed the same way: the show
 * travels in `?id=`, because a static export has no route for every series TMDB
 * knows about.
 */
export function TVContent() {
  return (
    <Suspense fallback={<MediaDetailSkeleton />}>
      <TVDetail />
    </Suspense>
  );
}

function TVDetail() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("id") ?? "";
  const id = extractIdFromSlug(slug);
  const { region } = useSettings();

  const { data, isLoading } = useAsyncData(
    async () => (id ? tmdbApi.getTVShowDetails(id, APPENDED_SECTIONS) : null),
    [id],
  );

  // Kept off the critical path: the show renders as soon as TMDB answers, and
  // the Wikipedia section appears when it appears.
  const { data: wikiContent } = useAsyncData(
    async () => (data ? getTVWikipediaContent(data.name) : null),
    [data?.id, data?.name],
  );

  useDocumentTitle(
    data ? `${data.name}${releaseYearSuffix(data.first_air_date)}` : null,
  );
  useCanonicalUrl(
    data ? absoluteMediaUrl("tv", createSlug(data.name, data.id)) : null,
  );

  if (isLoading) return <MediaDetailSkeleton />;

  if (!data) {
    return (
      <NotFoundNotice
        title="TV show not found"
        description="We could not find that series. It may have been removed from TMDB, or the link may be incomplete."
        backHref="/tv-shows"
        backLabel="Browse TV shows"
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

  const creators = details.created_by ?? [];

  // Extract US content rating, fall back to first available
  const certificationUS = details.content_ratings?.results?.find(
    (r) => r.iso_3166_1 === "US",
  )?.rating;
  const certificationFallback = details.content_ratings?.results?.[0]?.rating;
  const certification = certificationUS || certificationFallback;

  const canonicalSlug = createSlug(details.name, details.id);
  const pageUrl = absoluteMediaUrl("tv", canonicalSlug);

  const breadcrumbItems = [
    { name: "Home", url: SITE_URL },
    { name: "TV Shows", url: absoluteUrl("/tv-shows") },
  ];

  if (details.genres && details.genres.length > 0) {
    const primaryGenre = details.genres[0];
    breadcrumbItems.push({
      name: primaryGenre.name,
      url: absoluteUrl(
        genreHref("tv", createSlug(primaryGenre.name, primaryGenre.id)),
      ),
    });
  }

  breadcrumbItems.push({ name: details.name, url: pageUrl });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <StructuredData
        type="TVSeries"
        data={{
          url: pageUrl,
          name: details.name,
          overview: details.overview,
          poster_path: details.poster_path || undefined,
          first_air_date: details.first_air_date,
          last_air_date: details.last_air_date,
          status: details.status,
          genres: details.genres,
          number_of_seasons: details.number_of_seasons,
          number_of_episodes: details.number_of_episodes,
          vote_average: details.vote_average,
          vote_count: details.vote_count,
          credits,
          production_companies: details.production_companies,
          production_countries: details.production_countries,
          keywords: details.keywords?.results?.map((k) => k.name),
          sameAs: details.external_ids?.imdb_id
            ? `https://www.imdb.com/title/${details.external_ids.imdb_id}/`
            : undefined,
          trailer: trailer ?? undefined,
          contentRating: certification || undefined,
          inLanguage: details.spoken_languages?.[0]?.english_name || undefined,
          created_by: details.created_by,
        }}
      />
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} />

      {/* Hero Section with Backdrop */}
      <div className="relative">
        {details.backdrop_path && (
          <div className="absolute inset-0 z-0">
            <Image
              src={tmdbApi.getImageUrl(details.backdrop_path, "w1280")}
              alt={details.name}
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
            mediaType="tv"
            title={details.name}
            genres={details.genres}
          />
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl xl:max-w-7xl mt-6">
            {/* Poster */}
            <div className="md:col-span-1">
              <div className="relative aspect-2/3 w-full max-w-sm mx-auto">
                <Image
                  src={tmdbApi.getImageUrl(details.poster_path, "w500")}
                  alt={details.name}
                  fill
                  className="object-cover rounded-lg shadow-2xl"
                  loading="eager"
                />
              </div>
            </div>

            {/* TV Show Info */}
            <div className="md:col-span-2 text-white">
              <h1 className="text-4xl md:text-5xl font-bold mb-2">
                {details.name}
              </h1>
              {details.tagline && (
                <p className="text-xl text-gray-300 italic mb-4">
                  {details.tagline}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 mb-6">
                <span className="text-lg">
                  {releaseYear(details.first_air_date) ?? "N/A"}
                  {details.last_air_date &&
                    details.last_air_date !== details.first_air_date && (
                      <>
                        {" "}
                        -{" "}
                        {releaseYear(details.last_air_date) ?? "N/A"}
                      </>
                    )}
                </span>
                <span>•</span>
                <span>
                  {details.number_of_seasons}{" "}
                  {details.number_of_seasons === 1 ? "season" : "seasons"}
                </span>
                <span>•</span>
                <span>{details.number_of_episodes} episodes</span>
                <span>•</span>
                <span>{formatRuntime(details.episode_run_time)}</span>
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
              {creators.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold">Creators</h3>
                  <p className="text-gray-300">
                    {creators.map(
                      (c: { id: number; name: string }, i: number) => (
                        <span key={c.id}>
                          {i > 0 && ", "}
                          <a
                            href={personHref(createSlug(c.name, c.id))}
                            className="hover:text-white transition-colors"
                          >
                            {c.name}
                          </a>
                        </span>
                      ),
                    )}
                  </p>
                </div>
              )}

              {/* Next episode to air */}
              {details.next_episode_to_air && (
                <div className="mt-4 bg-white/10 rounded-lg px-4 py-3 inline-block">
                  <p className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-1">
                    Next Episode
                  </p>
                  <p className="text-white font-medium">
                    S
                    {details.next_episode_to_air.season_number
                      .toString()
                      .padStart(2, "0")}
                    E
                    {details.next_episode_to_air.episode_number
                      .toString()
                      .padStart(2, "0")}
                    {details.next_episode_to_air.name
                      ? ` — ${details.next_episode_to_air.name}`
                      : ""}
                  </p>
                  <p className="text-gray-300 text-sm">
                    {formatTmdbDate(details.next_episode_to_air.air_date)}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <TVTrailerButton tvId={details.id} trailer={trailer} />
                <DetailPageWatchlistButton
                  id={details.id}
                  title={details.name}
                  posterPath={details.poster_path}
                  releaseDate={details.first_air_date}
                  voteAverage={details.vote_average}
                  mediaType="tv"
                />
                <DetailPageWatchedButton
                  id={details.id}
                  title={details.name}
                  posterPath={details.poster_path}
                  releaseDate={details.first_air_date}
                  voteAverage={details.vote_average}
                  mediaType="tv"
                />
                <AddToListButton
                  // Every other button in this row carries its own `mt-6` on
                  // top of the row's, so matching it is what puts this on the
                  // same line rather than 24px above everything else.
                  className="mt-6"
                  item={{
                    id: details.id,
                    mediaType: "tv",
                    title: details.name,
                    posterPath: details.poster_path,
                  }}
                />
                <ShareButton title={details.name} url={pageUrl} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TVCast credits={credits} />
            <MediaFullCrew credits={credits} />
            <MediaKeywords keywords={details.keywords?.results ?? []} />
            <MediaVideos videos={videos.results} />
            <MediaReviews reviews={details.reviews} />
            {wikiContent && <WikipediaInsights content={wikiContent} />}
            <MediaGallery
              backdrops={details.images?.backdrops ?? []}
              posters={details.images?.posters ?? []}
              title={details.name}
            />
            {details.seasons && details.seasons.length > 0 && (
              <TVSeasons
                seasons={details.seasons}
                tvId={details.id}
                showName={details.name}
                posterPath={details.poster_path}
              />
            )}
            <SimilarTVShows similar={similar} />
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
                  title: details.name,
                  poster_path: details.poster_path,
                  backdrop_path: details.backdrop_path,
                  overview: details.overview,
                  release_date: details.first_air_date,
                  vote_average: details.vote_average,
                  vote_count: details.vote_count,
                  genre_ids: details.genres?.map((genre) => genre.id) ?? [],
                  media_type: "tv",
                }}
              />
            </div>
            <TVWatchProviders providers={watchProviders} title={details.name} />
            <LanguageSupport translations={translations} />
            <TVDetails details={details} certification={certification} />
          </div>
        </div>
      </div>
    </div>
  );
}
