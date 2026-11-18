/**
 * The answer to "where can I watch this?", as a sentence.
 *
 * A title page is called "… – Where to Watch", and what it had to say about
 * that was a grid of logos under a third-level heading at the bottom of the
 * document. A grid is something to scan; the question wants an answer, and so
 * does anything reading the page without eyes – a screen reader, a search
 * result's snippet, an assistant quoting it. This writes the one a person
 * would: where it streams, then where it can be rented or bought, or that it
 * cannot be had at all, which is an answer too.
 *
 * The region is deliberately not in the sentence. "In United States of
 * America" needs an article that "in Canada" does not, and the two hundred
 * regions here do not come with their grammar; the component names the region
 * on a line of its own instead.
 */

import type { Locale } from "@/i18n/locale";
import type { RegionWatchProviders, WatchProvider } from "@/types/tmdb";

/** Named in full; past this the rest are counted. */
const NAMES_SHOWN = 3;

/** Each service once, in TMDB's order – the same service is often listed under two ids. */
function names(providers: WatchProvider[]): string[] {
  return [...new Set(providers.map((provider) => provider.provider_name))];
}

/**
 * "A", "A and B", "A, B and C", "A, B, C and 4 more" – or "A, B, C a 4 další".
 *
 * `rest` is the word for the services left uncounted, for the one sentence that
 * needs it in another case: Czech says "ve službách A, B a 4 dalších".
 */
export function listServices(
  all: string[],
  locale: Locale = "en",
  rest: string = locale === "cs" ? "další" : "more",
): string {
  const and = locale === "cs" ? "a" : "and";
  const shown = all.slice(0, NAMES_SHOWN);
  const more = all.length - shown.length;
  if (more > 0) return `${shown.join(", ")} ${and} ${more} ${rest}`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} ${and} ${shown[shown.length - 1]}`;
}

/**
 * "ve službě Netflix", "ve službách Netflix a HBO Max".
 *
 * A Czech sentence cannot put a service's name where English does – "na
 * Netflixu" declines it, and "Disney+" or "Apple TV Store" will not decline –
 * so the name stands beside a noun that takes the case instead, as it does in
 * any Czech copy that names brands.
 */
function inServicesCs(all: string[]): string {
  const where = all.length === 1 ? "ve službě" : "ve službách";
  return `${where} ${listServices(all, "cs", "dalších")}`;
}

export function whereToWatchSummary(
  title: string,
  providers: RegionWatchProviders,
  locale: Locale = "en",
): string {
  const streaming = names(providers.streaming);
  const rent = names(providers.rent);
  const buy = names(providers.buy);
  const paid = [...new Set([...rent, ...buy])];

  // Czech, as its own sentences. "Ho" stands for the film or the series – both
  // masculine nouns – rather than for the title, whose own gender nobody knows.
  if (locale === "cs") {
    const verb =
      rent.length > 0 && buy.length > 0
        ? "půjčit nebo koupit"
        : rent.length > 0
          ? "půjčit"
          : "koupit";
    if (streaming.length > 0) {
      const also =
        paid.length > 0 ? ` Také si ho můžete ${verb} ${inServicesCs(paid)}.` : "";
      return `${title} můžete streamovat ${inServicesCs(streaming)}.${also}`;
    }
    if (paid.length > 0) {
      return `${title} se tu teď nestreamuje, ale můžete si ho ${verb} ${inServicesCs(paid)}.`;
    }
    return `${title} se tu teď nedá streamovat, půjčit ani koupit.`;
  }

  const verb =
    rent.length > 0 && buy.length > 0 ? "rent or buy" : rent.length > 0 ? "rent" : "buy";

  if (streaming.length > 0) {
    const also = paid.length > 0 ? ` You can also ${verb} it on ${listServices(paid)}.` : "";
    return `${title} is streaming on ${listServices(streaming)}.${also}`;
  }
  if (paid.length > 0) {
    return `${title} is not on a streaming service here right now, but you can ${verb} it on ${listServices(paid)}.`;
  }
  return `${title} is not available to stream, rent or buy here right now.`;
}
