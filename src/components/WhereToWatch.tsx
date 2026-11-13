import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { formatTmdbDate } from "@/lib/dates";
import { getProviderSearchUrl } from "@/lib/provider-urls";
import { whereToWatchSummary } from "@/lib/where-to-watch";
import type { RegionWatchProviders, WatchProvider } from "@/types/tmdb";

interface WhereToWatchProps {
  /**
   * The region's providers – or null where they are not known yet: the page
   * is showing the build's snapshot, which carries the build's region only,
   * to a visitor somewhere else. Null is "not checked", never "none".
   */
  providers: RegionWatchProviders | null;
  title: string;
  /** The region the providers are for, as the visitor knows it. */
  regionName: string;
  /** `YYYY-MM-DD` the providers were read on; empty before the browser knows. */
  checkedOn?: string;
}

function ProviderLinks({
  providers,
  title,
}: {
  providers: WatchProvider[];
  title: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((provider) => {
        const searchUrl = getProviderSearchUrl(provider.provider_id, title);
        const content = (
          <>
            {/* A 24px logo: w92, the narrowest size there is, is plenty at 2x. */}
            <Image
              src={tmdbApi.getImageUrl(provider.logo_path, "w92")}
              alt={provider.provider_name}
              width={24}
              height={24}
              className="rounded"
            />
            <span className="text-sm text-white">{provider.provider_name}</span>
          </>
        );

        return searchUrl ? (
          <Link
            key={provider.provider_id}
            href={searchUrl}
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg p-2 transition-colors"
          >
            {content}
          </Link>
        ) : (
          <div
            key={provider.provider_id}
            className="flex items-center gap-2 bg-gray-700 rounded-lg p-2"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where a film or a series can be watched – the first thing under the hero.
 *
 * It was a sidebar panel, the last thing in the document, under an `h3` that
 * said "Where to Watch" and nothing about what. But the page's own title ends
 * "– Where to Watch": this is the question the visitor arrived with, so the
 * answer leads the page, under a heading that names the title, and opens with a
 * sentence (`whereToWatchSummary`) rather than leaving the logos to be read.
 * A title with no providers still gets the section, because "nowhere, right
 * now" is the answer for it. A title whose providers are not known yet gets
 * it too, saying exactly that: the section holds its place at the top of the
 * page while the visitor's own region loads, and never passes "not checked"
 * off as "not available".
 *
 * Films and series had a copy of this each, identical but for the name.
 *
 * Given its providers rather than fetching them: the detail page already asked
 * TMDB for `watch/providers` alongside everything else, so this section costs
 * no request of its own.
 */
export function WhereToWatch({
  providers,
  title,
  regionName,
  checkedOn,
}: WhereToWatchProps) {
  const sections = providers
    ? [
        { label: "Streaming", items: providers.streaming },
        { label: "Rent", items: providers.rent },
        { label: "Buy", items: providers.buy },
      ].filter((section) => section.items.length > 0)
    : [];

  const checked = providers ? formatTmdbDate(checkedOn) : null;

  return (
    <section className="bg-gray-800 rounded-lg p-6 shadow mb-8">
      <h2 className="text-2xl font-bold mb-3 text-white">
        Where to watch {title}
      </h2>
      <p className="text-gray-200 leading-relaxed">
        {providers
          ? whereToWatchSummary(title, providers)
          : "Checking where it is available in your region…"}
      </p>
      <p className="text-sm text-gray-400 mt-1">
        Region: {regionName}
        {checked && <> · Checked {checked}</>}
      </p>
      {sections.length > 0 && (
        <div className="space-y-4 mt-5">
          {sections.map((section) => (
            <div key={section.label}>
              <h3 className="font-semibold text-gray-300 mb-2">
                {section.label}
              </h3>
              <ProviderLinks providers={section.items} title={title} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
