import { Suspense } from "react";
import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import type { TVShowDetails } from "@/types/tmdb";

interface TVDetailsProps {
  details: TVShowDetails;
}

function TVDetailsContent({ details }: TVDetailsProps) {
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

        <div>
          <span className="font-semibold text-gray-300">Language:</span>
          <p className="text-white">
            {details.spoken_languages?.map((lang) => lang.name).join(", ") ||
              "N/A"}
          </p>
        </div>

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
                      <Image
                        src={tmdbApi.getImageUrl(company.logo_path, "w500")}
                        alt={company.name}
                        width={40}
                        height={20}
                        className="object-contain"
                      />
                    )}
                    <span className="text-sm text-white">{company.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        {details.homepage && (
          <div>
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
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingTVDetails() {
  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow border border-gray-800 animate-pulse">
      <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="h-4 bg-gray-700 rounded mb-1 w-1/3"></div>
            <div className="h-4 bg-gray-700 rounded w-2/3"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TVDetails({ details }: TVDetailsProps) {
  return (
    <Suspense fallback={<LoadingTVDetails />}>
      <TVDetailsContent details={details} />
    </Suspense>
  );
}
