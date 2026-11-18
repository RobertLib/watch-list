"use client";

import { catalogGenreSlug } from "@/lib/genre-catalog";
import { Suspense } from "react";
import Image from "next/image";
import Link from "@/i18n/Link";
import { useSearchParams } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { TVCast } from "@/components/tv/TVCast";
import { SimilarTVShows } from "@/components/tv/SimilarTVShows";
import { WhereToWatch } from "@/components/WhereToWatch";
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
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { NotFoundNotice, isNotFoundError } from "@/components/NotFoundNotice";
import { SnapshotRefreshNotice } from "@/components/SnapshotRefreshNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { useSettings } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import { findYouTubeTrailer } from "@/hooks/useVideoOverlay";
import { getTVWikipediaContent } from "@/lib/wikipedia";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import {
  TV_APPENDED_SECTIONS,
  likeResults,
  snapshotRegion,
  tvPageTitle,
} from "@/lib/title-details";
import type { TVShowDetails } from "@/types/tmdb";
import { formatTmdbDate, releaseYear } from "@/lib/dates";
import { resolveRegionProviders } from "@/lib/media-converters";
import { resolveTVCertification } from "@/lib/media-certification";
import { getRegionCode, getRegionName } from "@/lib/region";
import {
  absoluteLocalizedUrl,
  absoluteMediaUrl,
  genreHref,
  likeHref,
  personHref,
} from "@/lib/routes";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount, formatNumber, type PluralForms, formatRating } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";


function formatRuntime(minutes: number[], locale: Locale): string {
  if (!minutes || minutes.length === 0) {
    return locale === "cs" ? "Délka neznámá" : "Unknown runtime";
  }
  const avgMinutes =
    minutes.reduce((sum, time) => sum + time, 0) / minutes.length;
  const hours = Math.floor(avgMinutes / 60);
  const mins = Math.round(avgMinutes % 60);
  if (locale === "cs") {
    return hours > 0 ? `~${hours} h ${mins} min` : `~${mins} min`;
  }
  return hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;
}

const SEASONS: PluralForms = {
  en: ["season", "seasons"],
  cs: ["řada", "řady", "řad"],
};

const EPISODES: PluralForms = {
  en: ["episode", "episodes"],
  cs: ["epizoda", "epizody", "epizod"],
};

/**
 * A series. The mirror of the film page, and addressed the same two ways: a
 * path with the build's snapshot for the series it prerendered
 * (`/tv/breaking-bad-1396`), and `?id=` for every other one – a static export
 * has no route for every series TMDB knows about.
 */
export function TVContent({
  slug,
  snapshot = null,
}: {
  slug?: string;
  snapshot?: TVShowDetails | null;
} = {}) {
  if (slug !== undefined) return <TVDetail slug={slug} snapshot={snapshot} />;

  return (
    <Suspense fallback={<MediaDetailSkeleton />}>
      <TVDetailFromQuery />
    </Suspense>
  );
}

function TVDetailFromQuery() {
  const searchParams = useSearchParams();
  return <TVDetail slug={searchParams.get("id") ?? ""} snapshot={null} />;
}

function TVDetail({
  slug,
  snapshot,
}: {
  slug: string;
  snapshot: TVShowDetails | null;
}) {
  const id = extractIdFromSlug(slug);
  const locale = useLocale();
  const t = useT();
  const { region } = useSettings();
  // The day the providers below were read: the snapshot's own date while the
  // page shows the build's copy, today once the browser has loaded its own.
  const today = useLocalDay();

  const { data, isLoading, error, reload, refreshError, isRetrying } = useAsyncData(
    async () => (id ? tmdbApi.getTVShowDetails(id, TV_APPENDED_SECTIONS) : null),
    [id],
    snapshot,
  );

  // Kept off the critical path: the show renders as soon as TMDB answers, and
  // the Wikipedia section appears when it appears.
  const { data: wikiContent } = useAsyncData(
    async () => (data ? getTVWikipediaContent(data.external_ids?.wikidata_id) : null),
    [data?.id, data?.external_ids?.wikidata_id],
  );

  useDocumentTitle(
    data ? tvPageTitle(data, locale) : null,
  );
  useCanonicalUrl(
    data ? absoluteMediaUrl("tv", createSlug(data.name, data.id), locale) : null,
  );

  if (isLoading) return <MediaDetailSkeleton />;

  // A miss and a failure are different pages. TMDB answering 404 means the
  // title is not there; TMDB not answering – a rate limit, a timeout, an
  // outage – means it may well be, and deserves a "try again" rather than a
  // "does not exist".
  if (error && !isNotFoundError(error)) {
    return (
      <LoadFailureNotice
        title={t("Could not load this series", "Seriál se nepodařilo načíst")}
        description={t(
          "TMDB did not answer. It may be a connection problem, or the service may be busy – the series is probably still there.",
          "TMDB neodpovídá. Může jít o potíže s připojením, nebo je služba přetížená – seriál tam nejspíš pořád je.",
        )}
        onRetry={reload}
      />
    );
  }

  // A 404 behind the build's snapshot is an answer too: the series has left
  // TMDB since the build. Any other failure leaves the snapshot readable, with
  // a retry beside it (below).
  if (!data || isNotFoundError(refreshError)) {
    return (
      <NotFoundNotice
        title={t("TV show not found", "Seriál nenalezen")}
        description={t(
          "We could not find that series. It may have been removed from TMDB, or the link may be incomplete.",
          "Tento seriál jsme nenašli. Možná byl z TMDB odstraněn, nebo je odkaz neúplný.",
        )}
        backHref="/tv-shows"
        backLabel={t("Browse TV shows", "Procházet seriály")}
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

  const creators = details.created_by ?? [];

  const certification = resolveTVCertification(
    details.content_ratings,
    getRegionCode(region),
  );

  const canonicalSlug = createSlug(details.name, details.id);
  const pageUrl = absoluteMediaUrl("tv", canonicalSlug, locale);

  const breadcrumbItems = [
    { name: t("Home", "Domů"), url: absoluteLocalizedUrl("/", locale) },
    { name: t("TV Shows", "Seriály"), url: absoluteLocalizedUrl("/tv-shows", locale) },
  ];

  if (details.genres && details.genres.length > 0) {
    const primaryGenre = details.genres[0];
    breadcrumbItems.push({
      name: primaryGenre.name,
      url: absoluteLocalizedUrl(
        genreHref("tv", catalogGenreSlug("tv", primaryGenre)),
        locale,
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
          first_air_date: details.first_air_date ?? undefined,
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
          contentRating: certification?.rating,
          inLanguage: details.spoken_languages?.[0]?.english_name || undefined,
          created_by: details.created_by,
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
          {refreshError != null && (
            <SnapshotRefreshNotice
              className="mt-4 max-w-6xl xl:max-w-7xl"
              message={t(
                "Showing a saved copy of this series – the latest details could not be loaded.",
                "Zobrazujeme uloženou kopii seriálu – aktuální údaje se nepodařilo načíst.",
              )}
              onRetry={reload}
              isRetrying={isRetrying}
            />
          )}
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
                  {releaseYear(details.first_air_date) ?? t("N/A", "neuvedeno")}
                  {details.last_air_date &&
                    details.last_air_date !== details.first_air_date && (
                      // A range of years: English has always spaced its
                      // hyphen; Czech writes an unspaced en dash, 2008–2013.
                      <>
                        {locale === "cs" ? "–" : <>{" "}-{" "}</>}
                        {releaseYear(details.last_air_date) ?? t("N/A", "neuvedeno")}
                      </>
                    )}
                </span>
                <span>•</span>
                <span>
                  {locale === "cs" ? (
                    formatCount(details.number_of_seasons, locale, SEASONS)
                  ) : (
                    <>
                      {details.number_of_seasons}{" "}
                      {details.number_of_seasons === 1 ? "season" : "seasons"}
                    </>
                  )}
                </span>
                <span>•</span>
                <span>
                  {locale === "cs"
                    ? formatCount(details.number_of_episodes, locale, EPISODES)
                    : `${details.number_of_episodes} episodes`}
                </span>
                <span>•</span>
                <span>{formatRuntime(details.episode_run_time, locale)}</span>
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
              {creators.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold">{t("Creators", "Tvůrci")}</h3>
                  <p className="text-gray-300">
                    {creators.map(
                      (c: { id: number; name: string }, i: number) => (
                        <span key={c.id}>
                          {i > 0 && ", "}
                          <Link
                            href={personHref(createSlug(c.name, c.id))}
                            prefetch={false}
                            className="hover:text-white transition-colors"
                          >
                            {c.name}
                          </Link>
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
                    {t("Next Episode", "Další epizoda")}
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
                    {formatTmdbDate(
                      details.next_episode_to_air.air_date,
                      undefined,
                      locale,
                    )}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <TVTrailerButton trailer={trailer} />
                <DetailPageWatchlistButton
                  id={details.id}
                  title={details.name}
                  posterPath={details.poster_path}
                  releaseDate={details.first_air_date ?? ""}
                  voteAverage={details.vote_average}
                  mediaType="tv"
                />
                <DetailPageWatchedButton
                  id={details.id}
                  title={details.name}
                  posterPath={details.poster_path}
                  releaseDate={details.first_air_date ?? ""}
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
            <WhereToWatch
              providers={watchProviders}
              title={details.name}
              regionName={getRegionName(region, locale)}
              checkedOn={details.snapshot_date ?? today}
            />
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
            <SimilarTVShows
              similar={similar}
              title={details.name}
              // Each language has its own list of "like" pages – Czech's is
              // its own, smaller one – so the link is looked up in the page's.
              allHref={likeHref("tv", canonicalSlug, locale)}
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
                  title: details.name,
                  poster_path: details.poster_path,
                  backdrop_path: details.backdrop_path,
                  overview: details.overview,
                  release_date: details.first_air_date ?? "",
                  vote_average: details.vote_average,
                  vote_count: details.vote_count,
                  genre_ids: details.genres?.map((genre) => genre.id) ?? [],
                  media_type: "tv",
                }}
              />
            </div>
            <LanguageSupport translations={translations} />
            <TVDetails
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
