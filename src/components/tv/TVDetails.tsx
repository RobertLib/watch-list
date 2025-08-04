import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import type { TVShowDetails } from "@/types/tmdb";

interface TVDetailsProps {
  details: TVShowDetails;
  certification?: string;
}

function TVDetailsContent({ details, certification }: TVDetailsProps) {
  const imdbId = details.external_ids?.imdb_id;

  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow border border-gray-800">
      <h3 className="text-xl font-bold mb-4 text-white">TV Show Facts</h3>
      <div className="space-y-3">
        <div>
          <span className="font-semibold text-gray-300">Original Name:</span>
          <p className="text-white">{details.original_name}</p>
        </div>

        <div>
          <span className="font-semibold text-gray-300">Status:</span>
          <p className="text-white">{details.status}</p>
        </div>

        <div>
          <span className="font-semibold text-gray-300">In Production:</span>
          <p className="text-white">{details.in_production ? "Yes" : "No"}</p>
        </div>

        {certification && (
          <div>
            <span className="font-semibold text-gray-300">Age Rating:</span>
            <p className="text-white">
              <span className="inline-block border border-gray-400 text-gray-200 text-sm px-2 py-0.5 rounded mt-1">
                {certification}
              </span>
            </p>
          </div>
        )}

        <div>
          <span className="font-semibold text-gray-300">Language:</span>
          <p className="text-white">
            {details.spoken_languages?.map((lang) => lang.name).join(", ") ||
              "N/A"}
          </p>
        </div>

        {details.production_countries &&
          details.production_countries.length > 0 && (
            <div>
              <span className="font-semibold text-gray-300">
                Country of Origin:
              </span>
              <p className="text-white">
                {details.production_countries.map((c) => c.name).join(", ")}
              </p>
            </div>
          )}

        <div>
          <span className="font-semibold text-gray-300">First Episode:</span>
          <p className="text-white">
            {new Date(details.first_air_date).toLocaleDateString("en-US")}
          </p>
        </div>

        {details.last_air_date && (
          <div>
            <span className="font-semibold text-gray-300">Last Episode:</span>
            <p className="text-white">
              {new Date(details.last_air_date).toLocaleDateString("en-US")}
            </p>
          </div>
        )}

        {details.networks && details.networks.length > 0 && (
          <div>
            <span className="font-semibold text-gray-300">Networks:</span>
            <div className="mt-2 flex flex-wrap gap-3">
              {details.networks.map((network) => (
                <div key={network.id} className="flex items-center gap-2">
                  {network.logo_path ? (
                    <div className="relative w-14 h-6 shrink-0">
                      <Image
                        src={tmdbApi.getImageUrl(network.logo_path, "w500")}
                        alt={network.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-white">{network.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {details.production_companies &&
          details.production_companies.length > 0 && (
            <div>
              <span className="font-semibold text-gray-300">
                Production Companies:
              </span>
              <div className="mt-2 space-y-2">
                {details.production_companies.map((company) => (
                  <div key={company.id} className="flex items-center gap-2">
                    {company.logo_path && (
                      <div className="relative w-10 h-5 shrink-0">
                        <Image
                          src={tmdbApi.getImageUrl(company.logo_path, "w500")}
                          alt={company.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                    )}
                    <span className="text-sm text-white">{company.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        <div className="flex flex-col gap-2 pt-1">
          {details.homepage && (
            <a
              href={details.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
            >
              Official Website
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zm-2 16H5V12H3v7c0 1.1.9 2 2 2h7v-2z" />
              </svg>
            </a>
          )}
          {imdbId && (
            <a
              href={`https://www.imdb.com/title/${imdbId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300"
            >
              View on IMDb
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zm-2 16H5V12H3v7c0 1.1.9 2 2 2h7v-2z" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function TVDetails({ details, certification }: TVDetailsProps) {
  return <TVDetailsContent details={details} certification={certification} />;
}
