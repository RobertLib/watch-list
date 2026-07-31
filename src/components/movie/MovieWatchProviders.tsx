import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { getProviderSearchUrl } from "@/lib/provider-urls";
import type { RegionWatchProviders, WatchProvider } from "@/types/tmdb";

interface MovieWatchProvidersProps {
  providers: RegionWatchProviders;
  title: string;
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
            <Image
              src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
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

// Server component on purpose: streaming availability is the one thing on a
// detail page that isn't a copy of TMDB, so it has to be in the HTML rather than
// fetched from /api/ (which robots.txt disallows).
export function MovieWatchProviders({
  providers,
  title,
}: MovieWatchProvidersProps) {
  const sections = [
    { label: "Streaming", items: providers.streaming },
    { label: "Rent", items: providers.rent },
    { label: "Buy", items: providers.buy },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow">
      <h3 className="text-xl font-bold mb-4 text-white">Where to Watch</h3>
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            <h4 className="font-semibold text-gray-300 mb-2">
              {section.label}
            </h4>
            <ProviderLinks providers={section.items} title={title} />
          </div>
        ))}
      </div>
    </div>
  );
}
