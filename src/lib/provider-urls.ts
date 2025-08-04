/**
 * Mapping of TMDB provider IDs to search URL templates
 */

interface ProviderSearchUrls {
  [key: number]: (query: string) => string;
}

// Map popular streaming provider IDs to their search URL generators
// Verified search URLs or homepage fallback for all major platforms
const PROVIDER_SEARCH_URLS: ProviderSearchUrls = {
  // Major Streaming platforms
  8: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`, // Netflix - verified
  9: (q) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(q)}`, // Amazon Prime Video - verified
  119: (q) =>
    `https://www.primevideo.com/search?phrase=${encodeURIComponent(q)}`, // Amazon Prime Video (alt)
  337: () => `https://www.disneyplus.com`, // Disney+ - no public search
  350: (q) => `https://tv.apple.com/search?term=${encodeURIComponent(q)}`, // Apple TV+ - verified
  384: () => `https://www.max.com`, // Max - search requires login
  1899: () => `https://www.max.com`, // Max (alt)
  425: () => `https://www.max.com`, // HBO Now (redirects to Max)
  15: () => `https://www.hulu.com`, // Hulu - search requires login
  531: () => `https://www.paramountplus.com`, // Paramount+ - search requires login
  283: (q) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(q)}`, // Crunchyroll - verified
  386: () => `https://www.peacocktv.com`, // Peacock - search requires login
  387: () => `https://www.peacocktv.com`, // Peacock - search requires login
  389: () => `https://www.peacocktv.com`, // Peacock Premium
  1773: () => `https://www.skyshowtime.com`, // SkyShowtime - search requires login

  // Sports & Specialty
  257: () => `https://www.fubo.tv`, // fuboTV - search requires login
  582: () => `https://www.showtime.com`, // Showtime - search requires login
  99: () => `https://www.shudder.com`, // Shudder - search requires login
  613: () => `https://www.directv.com`, // DIRECTV - search requires login

  // Free streaming
  207: (q) => `https://www.tubi.tv/search/${encodeURIComponent(q)}`, // Tubi TV - verified
  457: () => `https://www.amazon.com/gp/video/storefront/freevee`, // Amazon Freevee
  300: () => `https://pluto.tv`, // Pluto TV - search requires app

  // Rental / Purchase
  2: (q) => `https://tv.apple.com/search?term=${encodeURIComponent(q)}`, // Apple iTunes - verified
  3: (q) =>
    `https://play.google.com/store/search?q=${encodeURIComponent(q)}&c=movies`, // Google Play - verified
  10: (q) =>
    `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=instant-video`, // Amazon Video - verified
  68: (q) =>
    `https://www.microsoft.com/en-us/search?q=${encodeURIComponent(q)}`, // Microsoft Store - verified
  192: (q) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, // YouTube Premium - verified

  // UK platforms
  103: () => `https://www.channel4.com`, // All 4 - search requires login
  444: () => `https://www.channel4.com`, // Channel 4
  39: () => `https://www.nowtv.com`, // NOW - search requires login

  // European platforms
  35: () => `https://www.sky.de`, // Sky Go - search requires login
  339: () => `https://rakuten.tv`, // Rakuten TV - search requires login

  // Asian platforms
  190: () => `https://tv.naver.com`, // Naver Store - search in Korean
  356: () => `https://www.u-next.jp`, // U-NEXT - search requires login

  // Czech Republic specific
  634: () => `https://www.o2tv.cz`, // O2 TV - search requires login
  1796: () => `https://www.voyo.cz`, // Voyo - search requires login
  1928: () => `https://www.iprima.cz`, // Prima Plus - search requires login
  1939: () => `https://lepsitv.cz`, // Lepší TV - search requires login
  2536: () => `https://oneplay.cz`, // Oneplay - search requires login

  // Other
  1950: () => `https://tv.apple.com`, // Apple TV app
};

/**
 * Get search URL for a streaming provider with specific movie/show title
 * @param providerId - TMDB provider ID
 * @param title - Movie or TV show title
 * @returns Search URL for the provider or undefined if not found
 */
export function getProviderSearchUrl(
  providerId: number,
  title: string
): string | undefined {
  const searchUrlGenerator = PROVIDER_SEARCH_URLS[providerId];
  return searchUrlGenerator ? searchUrlGenerator(title) : undefined;
}
