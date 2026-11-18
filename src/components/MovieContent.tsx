"use client";

import { catalogGenreSlug } from "@/lib/genre-catalog";
import { Suspense } from "react";
import Image from "next/image";
import Link from "@/i18n/Link";
import { useSearchParams } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { MovieCast } from "@/components/movie/MovieCast";
import { SimilarMovies } from "@/components/movie/SimilarMovies";
import { WhereToWatch } from "@/components/WhereToWatch";
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
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { NotFoundNotice, isNotFoundError } from "@/components/NotFoundNotice";
import { SnapshotRefreshNotice } from "@/components/SnapshotRefreshNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { useSettings } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import { findYouTubeTrailer } from "@/hooks/useVideoOverlay";
import { getMovieWikipediaContent } from "@/lib/wikipedia";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import {
  MOVIE_APPENDED_SECTIONS,
  likeResults,
  moviePageTitle,
  snapshotRegion,
} from "@/lib/title-details";
import type { MovieDetails as MovieDetailsData } from "@/types/tmdb";
import { releaseYear } from "@/lib/dates";
import { resolveRegionProviders } from "@/lib/media-converters";
import { resolveMovieCertification } from "@/lib/media-certification";
import { getRegionCode, getRegionName } from "@/lib/region";
import {
  absoluteLocalizedUrl,
  absoluteMediaUrl,
  genreHref,
  likeHref,
  personHref,
} from "@/lib/routes";
import { crewJobLabel } from "@/lib/person-credits";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatNumber, formatRating } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";

function formatRuntime(minutes: number | null, locale: Locale): string {
  if (locale === "cs") {
    if (!minutes) return "Délka neznámá";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;
  }
  if (!minutes) return "Unknown runtime";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * A film, at either of its two addresses.
 *
 * `/movie/fight-club-550` is one of the films the build prerendered: the route
 * passes the slug and the build's snapshot of the film, so the whole page is in
 * the HTML and the browser starts from it. `/movie?id=fight-club-550` is every
 * other film: `useSearchParams` reads the id, which is why that body sits behind
 * a Suspense boundary – during the prerender there is no query string to read,
 * so the skeleton is what gets built into its HTML.
 */
export function MovieContent({
  slug,
  snapshot = null,
}: {
  slug?: string;
  snapshot?: MovieDetailsData | null;
} = {}) {
  if (slug !== undefined) return <MovieDetail slug={slug} snapshot={snapshot} />;

  return (
    <Suspense fallback={<MediaDetailSkeleton />}>
      <MovieDetailFromQuery />
    </Suspense>
  );
}

function MovieDetailFromQuery() {
  const searchParams = useSearchParams();
  return <MovieDetail slug={searchParams.get("id") ?? ""} snapshot={null} />;
}

function MovieDetail({
  slug,
  snapshot,
}: {
  slug: string;
  snapshot: MovieDetailsData | null;
}) {
  const id = extractIdFromSlug(slug);
  const locale = useLocale();
  const t = useT();
  const { region } = useSettings();
  // The day the providers below were read: the snapshot's own date while the
  // page shows the build's copy, today once the browser has loaded its own.
  const today = useLocalDay();

  const { data, isLoading, error, reload, refreshError, isRetrying } = useAsyncData(
    async () => (id ? tmdbApi.getMovieDetails(id, MOVIE_APPENDED_SECTIONS) : null),
    [id],
    snapshot,
  );

  // A second, slower source that must not hold up the page: the film renders as
  // soon as TMDB answers, and the Wikipedia section appears when it appears.
  // Found through the film's Wikidata id rather than a search for its title:
  // the search trusted its first hit, so a remake, a namesake, or a film with
  // no English article at all could be shown another film's article as its own.
  const { data: wikiContent } = useAsyncData(
    async () =>
      data ? getMovieWikipediaContent(data.external_ids?.wikidata_id) : null,
    [data?.id, data?.external_ids?.wikidata_id],
  );

  useDocumentTitle(
    data ? moviePageTitle(data, locale) : null,
  );
  useCanonicalUrl(
    data ? absoluteMediaUrl("movie", createSlug(data.title, data.id), locale) : null,
  );

  if (isLoading) return <MediaDetailSkeleton />;

  // A miss and a failure are different pages. TMDB answering 404 means the
  // title is not there; TMDB not answering – a rate limit, a timeout, an
  // outage – means it may well be, and deserves a "try again" rather than a
  // "does not exist".
  if (error && !isNotFoundError(error)) {
    return (
      <LoadFailureNotice
        title={t("Could not load this film", "Film se nepodařilo načíst")}
        description={t(
          "TMDB did not answer. It may be a connection problem, or the service may be busy – the film is probably still there.",
          "TMDB neodpovídá. Může jít o potíže s připojením, nebo je služba přetížená – film tam nejspíš pořád je.",
        )}
        onRetry={reload}
      />
    );
  }

  // A 404 behind the build's snapshot is an answer too: the film has left TMDB
  // since the build. Any other failure leaves the snapshot readable, with a
  // retry beside it (below).
  if (!data || isNotFoundError(refreshError)) {
    return (
      <NotFoundNotice
        title={t("Movie not found", "Film nenalezen")}
        description={t(
          "We could not find that film. It may have been removed from TMDB, or the link may be incomplete.",
          "Tento film jsme nenašli. Možná byl z TMDB odstraněn, nebo je odkaz neúplný.",
        )}
        backHref="/movies"
        backLabel={t("Browse movies", "Procházet filmy")}
      />
    );
  }

  const details = data;
  const credits = details.credits || { cast: [], crew: [] };
  const videos = details.videos || { results: [] };
  // Recommendations first, similar titles after – one list, see `likeResults`.
  const similar = likeResults(details);
  const translations = details.translations || {
    id: details.id,
    translations: [],
  };

  // Resolved from the already-appended watch/providers payload, so the "Where to
  // Watch" section costs no request of its own – and follows the region setting
  // without refetching, because every region is already in the payload.
  //
  // A build's snapshot carries one region's providers (`snapshotRegion` – the
  // page's own language's default region, so a Czech page's snapshot knows CZ),
  // so for a visitor anywhere else it says nothing yet – which is not the same
  // as saying the title is unavailable there, and must not be shown as that.
  const providersKnown =
    details.snapshot_date === undefined ||
    getRegionCode(region) === snapshotRegion(locale);
  const watchProviders = providersKnown
    ? resolveRegionProviders(details["watch/providers"], getRegionCode(region))
    : null;

  const trailer = findYouTubeTrailer(videos.results);

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

  const certification = resolveMovieCertification(
    details.release_dates,
    getRegionCode(region),
  );

  const canonicalSlug = createSlug(details.title, details.id);
  const pageUrl = absoluteMediaUrl("movie", canonicalSlug, locale);

  const breadcrumbItems = [
    { name: t("Home", "Domů"), url: absoluteLocalizedUrl("/", locale) },
    { name: t("Movies", "Filmy"), url: absoluteLocalizedUrl("/movies", locale) },
  ];

  if (details.genres && details.genres.length > 0) {
    const primaryGenre = details.genres[0];
    breadcrumbItems.push({
      name: primaryGenre.name,
      url: absoluteLocalizedUrl(
        genreHref("movie", catalogGenreSlug("movie", primaryGenre)),
        locale,
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
          contentRating: certification?.rating,
          inLanguage: details.spoken_languages?.[0]?.english_name || undefined,
        }}
        locale={locale}
      />
      <StructuredData
        type="BreadcrumbList"
        data={{ breadcrumbItems }}
        locale={locale}
      />

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
          {refreshError != null && (
            <SnapshotRefreshNotice
              className="mt-4 max-w-6xl xl:max-w-7xl"
              message={t(
                "Showing a saved copy of this film – the latest details could not be loaded.",
                "Zobrazujeme uloženou kopii filmu – aktuální údaje se nepodařilo načíst.",
              )}
              onRetry={reload}
              isRetrying={isRetrying}
            />
          )}
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
                  {releaseYear(details.release_date) ?? t("N/A", "neuvedeno")}
                </span>
                <span>•</span>
                <span>{formatRuntime(details.runtime, locale)}</span>
                <span>•</span>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">★</span>
                  <span>
                    {details.vote_average != null &&
                      formatRating(details.vote_average, locale)}
                  </span>
                  <span className="text-gray-300">
                    ({formatNumber(details.vote_count, locale)}{" "}
                    {t("ratings", "hodnocení")})
                  </span>
                </div>
              </div>

              <GenreTags genres={details.genres} />

              {details.overview && (
                <div className="mt-6">
                  <h2 className="text-xl font-semibold mb-3">
                    {t("Overview", "Obsah")}
                  </h2>
                  <p className="text-gray-200 leading-relaxed">
                    {details.overview}
                  </p>
                </div>
              )}

              {/* Key Crew – Links like the cast's. A plain <a> here was a full
                  document load in the static export: the app booted again
                  and the in-memory TMDB cache went with it. */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {director && (
                  <div>
                    <h3 className="font-semibold">
                      {crewJobLabel("Director", locale)}
                    </h3>
                    <Link
                      href={personHref(createSlug(director.name, director.id))}
                      prefetch={false}
                      className="text-gray-300 hover:text-white transition-colors"
                    >
                      {director.name}
                    </Link>
                  </div>
                )}
                {writers.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{t("Writers", "Scénář")}</h3>
                    <p className="text-gray-300">
                      {writers.map(
                        (w: { id: number; name: string }, i: number) => (
                          <span key={w.id}>
                            {i > 0 && ", "}
                            <Link
                              href={personHref(createSlug(w.name, w.id))}
                              prefetch={false}
                              className="hover:text-white transition-colors"
                            >
                              {w.name}
                            </Link>
                          </span>
                        ),
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <MovieTrailerButton trailer={trailer} />
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
            <WhereToWatch
              providers={watchProviders}
              title={details.title}
              regionName={getRegionName(region, locale)}
              checkedOn={details.snapshot_date ?? today}
            />
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
            <SimilarMovies
              similar={similar}
              title={details.title}
              // Each language has its own list of "like" pages – Czech's is
              // its own, smaller one – so the link is looked up in the page's.
              allHref={likeHref("movie", canonicalSlug, locale)}
            />
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
            <LanguageSupport translations={translations} />
            <MovieDetails
              details={details}
              certification={certification?.rating}
              certificationRegion={certification?.region}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
