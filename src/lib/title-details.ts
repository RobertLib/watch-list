/**
 * What a title page loads, and the part of it the build writes into the page.
 *
 * The appended sections are named here rather than in the page components so
 * the build can ask TMDB for exactly what the browser asks for – a constant in
 * a `"use client"` module is a client reference on the server, not a string.
 *
 * A full answer is about 350 KB of JSON: every region's streaming providers,
 * every translation's overview, every image, every review. A prerendered page
 * carries its snapshot four times over on disk (inline in the HTML, and in the
 * three payload files Next writes for client navigation), and GitHub Pages
 * allows a site 1 GB – so the snapshot keeps what the first render shows and
 * links to, and the browser loads the rest when it loads the title for itself.
 * Each cut keeps one more than the section displays where the section offers
 * "show more", so the snapshot renders the same buttons the full answer does;
 * each entry keeps only the fields its type declares, which is what the page
 * reads. The image gallery is left out altogether: it is the largest section,
 * it sits below the fold, and a search engine learns nothing from TMDB's
 * stills – it appears when the browser has the title.
 */

import { DEFAULT_REGION } from "./settings";
import { mergeCastByPerson } from "./media-converters";
import { tmdbApi } from "./tmdb";
import { releaseYearSuffix } from "./dates";
import { findYouTubeTrailer } from "./trailer";
import type {
  Credits,
  Movie,
  MovieDetails,
  PersonDetails,
  PersonMovieCredits,
  PersonTVCredits,
  ReviewsResponse,
  TMDBResponse,
  Translation,
  TVShow,
  TVShowDetails,
  TVTranslation,
  VideosResponse,
  WatchProvidersResponse,
} from "@/types/tmdb";

// `external_ids` is what carries the Wikidata id – the only thing the Wikipedia
// panel trusts to name the right article.
export const MOVIE_APPENDED_SECTIONS =
  "watch/providers,credits,videos,similar,translations,keywords,reviews,release_dates,images,external_ids";

export const TV_APPENDED_SECTIONS =
  "watch/providers,credits,videos,similar,translations,keywords,reviews,content_ratings,external_ids,images";

/**
 * The page titles, shared by the build's metadata and the browser's
 * `useDocumentTitle` so the two never disagree. "Where to watch" is what people
 * searching a title's name on a site like this one want, and the snippet says
 * it before they click.
 */
export function moviePageTitle(movie: { title: string; release_date?: string | null }): string {
  return `${movie.title}${releaseYearSuffix(movie.release_date)} – Where to Watch`;
}

export function tvPageTitle(show: { name: string; first_air_date?: string | null }): string {
  return `${show.name}${releaseYearSuffix(show.first_air_date)} – Where to Watch`;
}

export function personPageTitle(person: { name: string }): string {
  return `${person.name} – Movies & TV Shows`;
}

/** Everything a person's page renders from. */
export interface PersonPageData {
  details: PersonDetails;
  movieCredits: PersonMovieCredits;
  tvCredits: PersonTVCredits;
}

export async function loadPersonPage(id: number): Promise<PersonPageData> {
  const [details, movieCredits, tvCredits] = await Promise.all([
    tmdbApi.getPersonDetails(id),
    tmdbApi.getPersonMovieCredits(id),
    tmdbApi.getPersonTVCredits(id),
  ]);
  return { details, movieCredits, tvCredits };
}

/**
 * The one region whose providers and ratings a snapshot keeps: the build's,
 * which is the default region every first visit starts in. A visitor in another
 * region sees their own once the browser has loaded the title.
 */
export const SNAPSHOT_REGION = DEFAULT_REGION;

/** Cast cards shown, as `MovieCast`/`TVCast` count them. */
const CAST_SHOWN = 12;
/** Per crew department, as `MediaFullCrew` counts them. */
const CREW_PER_DEPARTMENT = 6;
/** The crew a page names outside the crew section: director, writers. */
const KEY_JOBS = new Set(["Director", "Writer", "Screenplay", "Story"]);
/** `MediaVideos` shows 6. The trailer is kept wherever it sits. */
const VIDEOS_KEPT = 7;
/** `MediaReviews` shows 3. */
const REVIEWS_KEPT = 4;
/** Collapsed at 350 characters; past that only "read more" would reveal it. */
const REVIEW_CHARACTERS = 1200;
/** `SimilarMovies`/`SimilarTVShows` show 9. */
const SIMILAR_KEPT = 9;

/** Only the named fields – the ones the entry's type declares. */
function pick<T extends object, K extends keyof T>(entry: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(
    keys.filter((key) => key in entry).map((key) => [key, entry[key]]),
  ) as Pick<T, K>;
}

function trimCredits(credits: Credits | undefined): Credits | undefined {
  if (!credits) return undefined;

  const shownCast = new Set(
    mergeCastByPerson(credits.cast)
      .slice(0, CAST_SHOWN)
      .map((member) => member.id),
  );
  const perDepartment = new Map<string, number>();
  const crew = credits.crew.filter((member) => {
    const count = perDepartment.get(member.department) ?? 0;
    perDepartment.set(member.department, count + 1);
    return count < CREW_PER_DEPARTMENT || KEY_JOBS.has(member.job);
  });

  return {
    cast: credits.cast
      .filter((member) => shownCast.has(member.id))
      .map((member) => pick(member, ["id", "name", "character", "profile_path", "order"])),
    crew: crew.map((member) =>
      pick(member, ["id", "name", "job", "department", "profile_path"]),
    ),
  };
}

function trimVideos(videos: VideosResponse | undefined): VideosResponse | undefined {
  if (!videos) return undefined;
  const trailer = findYouTubeTrailer(videos.results);
  const kept = videos.results.slice(0, VIDEOS_KEPT);
  if (trailer && !kept.includes(trailer)) kept.push(trailer);
  return {
    ...videos,
    results: kept.map((video) =>
      pick(video, ["id", "key", "name", "site", "type", "official", "published_at"]),
    ),
  };
}

function trimReviews(reviews: ReviewsResponse | undefined) {
  if (!reviews) return undefined;
  return {
    ...reviews,
    results: reviews.results.slice(0, REVIEWS_KEPT).map((review) => ({
      ...review,
      content: review.content.slice(0, REVIEW_CHARACTERS),
    })),
  };
}

function trimProviders(
  providers: WatchProvidersResponse | undefined,
): WatchProvidersResponse | undefined {
  if (!providers) return undefined;
  const own = providers.results[SNAPSHOT_REGION];
  return { ...providers, results: own ? { [SNAPSHOT_REGION]: own } : {} };
}

/** Only the names: `LanguageSupport` lists languages, not their overviews. */
function trimTranslations<T extends Translation | TVTranslation>(
  translations: { id: number; translations: T[] } | undefined,
) {
  if (!translations) return undefined;
  return {
    ...translations,
    translations: translations.translations.map(
      (translation) =>
        ({
          ...pick(translation, ["iso_3166_1", "iso_639_1", "name", "english_name"]),
          data: {},
        }) as T,
    ),
  };
}

/** The nine `SimilarMovies`/`SimilarTVShows` show, with the fields they read. */
function trimSimilar<T extends Movie | TVShow>(
  similar: TMDBResponse<T> | undefined,
): TMDBResponse<T> | undefined {
  if (!similar) return undefined;
  return {
    ...similar,
    results: similar.results.slice(0, SIMILAR_KEPT).map(
      (title) =>
        pick(title as Movie & TVShow, [
          "id",
          "title",
          "name",
          "overview",
          "poster_path",
          "release_date",
          "first_air_date",
          "vote_average",
          "vote_count",
        ]) as unknown as T,
    ),
  };
}

export function movieSnapshot(details: MovieDetails): MovieDetails {
  return {
    ...details,
    credits: trimCredits(details.credits),
    images: undefined,
    videos: trimVideos(details.videos),
    reviews: trimReviews(details.reviews),
    similar: trimSimilar(details.similar),
    translations: trimTranslations(details.translations),
    "watch/providers": trimProviders(details["watch/providers"]),
    release_dates: details.release_dates && {
      ...details.release_dates,
      results: details.release_dates.results.filter(
        (result) => result.iso_3166_1 === SNAPSHOT_REGION,
      ),
    },
  };
}

export function tvSnapshot(details: TVShowDetails): TVShowDetails {
  return {
    ...details,
    credits: trimCredits(details.credits),
    images: undefined,
    videos: trimVideos(details.videos),
    reviews: trimReviews(details.reviews),
    similar: trimSimilar(details.similar),
    translations: trimTranslations(details.translations),
    "watch/providers": trimProviders(details["watch/providers"]),
    content_ratings: details.content_ratings && {
      ...details.content_ratings,
      results: details.content_ratings.results.filter(
        (entry) => entry.iso_3166_1 === SNAPSHOT_REGION,
      ),
    },
  };
}

/**
 * A person's filmography, reduced to the fields its sections read (the
 * `PersonMovieCredit` family of types). TMDB sends each credit's overview and
 * a dozen other fields besides, and a long career is hundreds of credits.
 */
export function personSnapshot({
  details,
  movieCredits,
  tvCredits,
}: PersonPageData): PersonPageData {
  return {
    details,
    movieCredits: {
      cast: movieCredits.cast.map((credit) =>
        pick(credit, ["id", "title", "character", "poster_path", "release_date", "vote_average", "vote_count", "popularity"]),
      ),
      crew: movieCredits.crew.map((credit) =>
        pick(credit, ["id", "title", "job", "department", "poster_path", "release_date", "vote_average", "vote_count", "popularity"]),
      ),
    },
    tvCredits: {
      cast: tvCredits.cast.map((credit) =>
        pick(credit, ["id", "name", "character", "poster_path", "first_air_date", "vote_average", "vote_count", "popularity", "episode_count"]),
      ),
      crew: tvCredits.crew.map((credit) =>
        pick(credit, ["id", "name", "job", "department", "poster_path", "first_air_date", "vote_average", "vote_count", "popularity", "episode_count"]),
      ),
    },
  };
}
