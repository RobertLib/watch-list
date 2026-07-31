/**
 * Mapping of TMDB provider IDs to search URL templates
 */

interface ProviderSearchUrls {
  [key: number]: (query: string) => string;
}

// Map popular streaming provider IDs to their search URL generators.
//
// Provider names in the comments were checked against TMDB's /watch/providers
// list on 2026-08-01. TMDB reuses retired IDs for unrelated services, so entries
// written against older data silently start pointing somewhere else — that is how
// 1796 ended up sending "Netflix Standard with Ads" to voyo.cz. Re-verify before
// adding IDs, and leave an ID out entirely rather than guessing its destination:
// getProviderSearchUrl returns undefined and the caller renders plain text.
const PROVIDER_SEARCH_URLS: ProviderSearchUrls = {
  // Major Streaming platforms
  8: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`, // Netflix - verified
  9: (q) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(q)}`, // Amazon Prime Video - verified
  119: (q) =>
    `https://www.primevideo.com/search?phrase=${encodeURIComponent(q)}`, // Amazon Prime Video (alt)
  337: () => `https://www.disneyplus.com`, // Disney+ - no public search
  350: (q) => `https://tv.apple.com/search?term=${encodeURIComponent(q)}`, // Apple TV+ - verified
  1899: () => `https://www.max.com`, // HBO Max - search requires login
  15: () => `https://www.hulu.com`, // Hulu - search requires login
  531: () => `https://www.paramountplus.com`, // Paramount+ - search requires login
  283: (q) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(q)}`, // Crunchyroll - verified
  386: () => `https://www.peacocktv.com`, // Peacock Premium - search requires login
  387: () => `https://www.peacocktv.com`, // Peacock Premium Plus - search requires login
  1773: () => `https://www.skyshowtime.com`, // SkyShowtime - search requires login
  // 389 is Sooner, not a Peacock tier — left unmapped, destination unverified

  // Sports & Specialty
  257: () => `https://www.fubo.tv`, // fuboTV - search requires login
  582: () => `https://www.paramountplus.com`, // Paramount+ Amazon Channel
  99: () => `https://www.shudder.com`, // Shudder - search requires login
  613: (q) =>
    `https://www.primevideo.com/search?phrase=${encodeURIComponent(q)}`, // Amazon Prime Video Free with Ads

  // Free streaming
  207: () => `https://therokuchannel.roku.com`, // The Roku Channel
  457: () => `https://vix.com`, // VIX
  300: () => `https://pluto.tv`, // Pluto TV - search requires app

  // Rental / Purchase
  2: (q) => `https://tv.apple.com/search?term=${encodeURIComponent(q)}`, // Apple TV Store (formerly iTunes)
  3: (q) =>
    `https://play.google.com/store/search?q=${encodeURIComponent(q)}&c=movies`, // Google Play Movies - verified
  10: (q) =>
    `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=instant-video`, // Amazon Video - verified
  192: (q) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, // YouTube - verified

  // Specialty
  190: () => `https://curiositystream.com`, // Curiosity Stream
  444: () => `https://www.dekkoo.com`, // Dekkoo
  634: () => `https://www.starz.com`, // Starz Roku Premium Channel

  // UK platforms
  103: () => `https://www.channel4.com`, // Channel 4 (formerly All 4)
  39: () => `https://www.nowtv.com`, // NOW - search requires login

  // European platforms
  35: () => `https://rakuten.tv`, // Rakuten TV - search requires login
  339: () => `https://www.movistarplus.es`, // MovistarTV

  // Asian platforms
  356: () => `https://www.wavve.com`, // wavve

  // Czech Republic specific
  // O2 TV is not in TMDB's provider list at all, so it has no entry here — the
  // ID it used to sit on (634) belongs to Starz.
  627: () => `https://www.voyo.cz`, // Voyo - search requires login
  1796: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`, // Netflix Standard with Ads
  1928: () => `https://www.iprima.cz`, // Prima Plus - search requires login
  1939: () => `https://lepsitv.cz`, // Lepší TV - search requires login
  2536: () => `https://oneplay.cz`, // Oneplay - search requires login
};

/**
 * Get search URL for a streaming provider with specific movie/show title
 * @param providerId - TMDB provider ID
 * @param title - Movie or TV show title
 * @returns Search URL for the provider or undefined if not found
 */
export function getProviderSearchUrl(
  providerId: number,
  title: string,
): string | undefined {
  const searchUrlGenerator = PROVIDER_SEARCH_URLS[providerId];
  return searchUrlGenerator ? searchUrlGenerator(title) : undefined;
}
