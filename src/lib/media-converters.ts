import {
  CastMember,
  Movie,
  TVShow,
  MediaItem,
  RegionWatchProviders,
  WatchProvidersResponse,
} from "@/types/tmdb";
import { streamingProvidersFor } from "./watch-provider-availability";
import type { Locale } from "@/i18n/locale";

/**
 * A title's cast with one entry per person, in billing order.
 *
 * TMDB bills an actor once per role, so Peter Sellers is three cast entries in
 * Dr. Strangelove. Rendered as-is that is the same face three times – and three
 * siblings keyed by the same person id, which React cannot tell apart. Each
 * person keeps the place of their first billing, with every distinct character
 * joined in billing order.
 */
export function mergeCastByPerson(cast: CastMember[]): CastMember[] {
  const people = new Map<number, { member: CastMember; characters: string[] }>();

  for (const member of cast) {
    const character = member.character?.trim() ?? "";
    const seen = people.get(member.id);
    if (!seen) {
      people.set(member.id, {
        member,
        characters: character ? [character] : [],
      });
      continue;
    }
    if (character && !seen.characters.includes(character)) {
      seen.characters.push(character);
    }
  }

  return [...people.values()].map(({ member, characters }) => ({
    ...member,
    character: characters.join(" / "),
  }));
}

/**
 * Pick one region out of an appended `watch/providers` response.
 *
 * Detail pages already request `watch/providers` via append_to_response, so
 * resolving it here costs no extra TMDB call – which is the whole reason the
 * "Where to Watch" section does not have to wait on a request of its own.
 */
export const resolveRegionProviders = (
  response: WatchProvidersResponse | undefined,
  regionCode: string,
): RegionWatchProviders => {
  const region = response?.results?.[regionCode];

  return {
    streaming: streamingProvidersFor(region),
    rent: region?.rent ?? [],
    buy: region?.buy ?? [],
  };
};

// Type for trending items that can be either Movie or TVShow with media_type
type TrendingItem =
  | (Movie & { media_type?: "movie" })
  | (TVShow & { media_type?: "tv" })
  | MediaItem;

/**
 * Convert Movie to MediaItem for use in components that expect MediaItem interface
 * Watch providers are now loaded lazily on client side
 */
export const convertMovieToMediaItem = (movie: Movie): MediaItem => ({
  id: movie.id,
  title: movie.title,
  overview: movie.overview,
  poster_path: movie.poster_path,
  backdrop_path: movie.backdrop_path,
  release_date: movie.release_date,
  vote_average: movie.vote_average,
  vote_count: movie.vote_count,
  genre_ids: movie.genre_ids,
  media_type: "movie" as const,
  // Providers are loaded lazily via MediaCard
  providers: movie.providers,
  "watch/providers": movie["watch/providers"],
});

/**
 * Convert TVShow to MediaItem for use in components that expect MediaItem interface
 * Watch providers are now loaded lazily on client side
 */
export const convertTVShowToMediaItem = (show: TVShow): MediaItem => ({
  id: show.id,
  title: show.name,
  overview: show.overview,
  poster_path: show.poster_path,
  backdrop_path: show.backdrop_path,
  // A card promises a string here and a series does not always bring one:
  // TMDB dates a show with no premiere as null as readily as as "".
  release_date: show.first_air_date ?? "",
  vote_average: show.vote_average,
  vote_count: show.vote_count,
  genre_ids: show.genre_ids,
  media_type: "tv" as const,
  // Providers are loaded lazily via MediaCard
  providers: show.providers,
  "watch/providers": show["watch/providers"],
});

/**
 * Convert trending item (Movie or TVShow) to MediaItem for use in components
 */
export const convertTrendingToMediaItem = (item: TrendingItem): MediaItem => {
  // If item already has media_type and title, it's already converted
  if ("media_type" in item && "title" in item && item.title) {
    return item as MediaItem;
  }

  // Determine media type and convert accordingly
  if ("title" in item && item.title) {
    return convertMovieToMediaItem(item as Movie);
  } else if ("name" in item && item.name) {
    return convertTVShowToMediaItem(item as TVShow);
  }

  // This should never happen, but provide fallback
  throw new Error("Unable to determine media type for trending item");
};

/**
 * TMDB's production status of a film or a series, in Czech. TMDB sends it in
 * English whatever language it is asked in. Neuter forms throughout ("Zrušeno",
 * not "zrušen"), because the status stands on its own in a fact list and agrees
 * with nothing; a status TMDB adds later is shown as it sends it.
 */
const STATUS_NAMES_CS: Record<string, string> = {
  Rumored: "Zatím jen spekulace",
  Planned: "Plánováno",
  "In Production": "Ve výrobě",
  "Post Production": "V postprodukci",
  Released: "Vydáno",
  Canceled: "Zrušeno",
  "Returning Series": "Pokračuje",
  Ended: "Ukončeno",
  Pilot: "Pilotní díl",
};

export function mediaStatusLabel(status: string, locale: Locale = "en"): string {
  return locale === "cs" ? (STATUS_NAMES_CS[status] ?? status) : status;
}

/**
 * Languages in Czech, by ISO 639-1 code – CLDR's names, written out once for
 * the same reason the region names are (`regions-data.ts`): `Intl.DisplayNames`
 * answers from whichever CLDR the runtime carries, and a name that differs
 * between the build's prerender and the browser's hydration is a mismatch.
 * TMDB's own oddities are kept: `cn` is its code for Cantonese, `xx` for a
 * title with no spoken language.
 */
const LANGUAGE_NAMES_CS: Record<string, string> = {
  af: "afrikánština",
  am: "amharština",
  ar: "arabština",
  az: "ázerbájdžánština",
  be: "běloruština",
  bg: "bulharština",
  bn: "bengálština",
  bo: "tibetština",
  bs: "bosenština",
  ca: "katalánština",
  cn: "kantonština",
  cs: "čeština",
  cy: "velština",
  da: "dánština",
  de: "němčina",
  el: "řečtina",
  en: "angličtina",
  eo: "esperanto",
  es: "španělština",
  et: "estonština",
  eu: "baskičtina",
  fa: "perština",
  fi: "finština",
  fr: "francouzština",
  ga: "irština",
  gl: "galicijština",
  gu: "gudžarátština",
  he: "hebrejština",
  hi: "hindština",
  hr: "chorvatština",
  hu: "maďarština",
  hy: "arménština",
  id: "indonéština",
  is: "islandština",
  it: "italština",
  ja: "japonština",
  ka: "gruzínština",
  kk: "kazaština",
  km: "khmerština",
  kn: "kannadština",
  ko: "korejština",
  ku: "kurdština",
  ky: "kyrgyzština",
  la: "latina",
  lb: "lucemburština",
  lo: "laoština",
  lt: "litevština",
  lv: "lotyština",
  mk: "makedonština",
  ml: "malajálamština",
  mn: "mongolština",
  mr: "maráthština",
  ms: "malajština",
  mt: "maltština",
  my: "barmština",
  nb: "norština (bokmål)",
  ne: "nepálština",
  nl: "nizozemština",
  nn: "norština (nynorsk)",
  no: "norština",
  pa: "paňdžábština",
  pl: "polština",
  ps: "paštština",
  pt: "portugalština",
  ro: "rumunština",
  ru: "ruština",
  si: "sinhálština",
  sk: "slovenština",
  sl: "slovinština",
  so: "somálština",
  sq: "albánština",
  sr: "srbština",
  sv: "švédština",
  sw: "svahilština",
  ta: "tamilština",
  te: "telugština",
  tg: "tádžičtina",
  th: "thajština",
  tl: "tagalog",
  tr: "turečtina",
  uk: "ukrajinština",
  ur: "urdština",
  uz: "uzbečtina",
  vi: "vietnamština",
  xh: "xhoština",
  xx: "bez jazyka",
  yi: "jidiš",
  yo: "jorubština",
  zh: "čínština",
  zu: "zuluština",
};

/**
 * A language's name in the page's language. English keeps the name TMDB sent
 * (`fallback`), as it always has; Czech looks the code up and falls back to
 * that name only for a language the table above does not have.
 */
export function languageLabel(
  code: string,
  fallback: string,
  locale: Locale = "en",
): string {
  return locale === "cs" ? (LANGUAGE_NAMES_CS[code] ?? fallback) : fallback;
}
