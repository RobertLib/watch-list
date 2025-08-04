import { Suspense } from "react";
import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import type { MovieDetails as MovieDetailsType } from "@/types/tmdb";

interface MovieDetailsProps {
  details: MovieDetailsType;
}

function MovieDetailsContent({ details }: MovieDetailsProps) {
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow">
      <h3 className="text-xl font-bold mb-4 text-white">Movie Information</h3>
      <div className="space-y-3">
        <div>
          <span className="font-semibold text-gray-300">Original Title:</span>
          <p className="text-white">{details.original_title}</p>
        </div>

        <div>
          <span className="font-semibold text-gray-300">Status:</span>
          <p className="text-white">{details.status}</p>
        </div>

        <div>
          <span className="font-semibold text-gray-300">Language:</span>
          <p className="text-white">
            {details.spoken_languages?.map((lang) => lang.name).join(", ") ||
              "N/A"}
          </p>
        </div>

        {details.budget > 0 && (
          <div>
            <span className="font-semibold text-gray-300">Budget:</span>
            <p className="text-white">{formatCurrency(details.budget)}</p>
          </div>
        )}

        {details.revenue > 0 && (
          <div>
            <span className="font-semibold text-gray-300">Revenue:</span>
            <p className="text-white">{formatCurrency(details.revenue)}</p>
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

function LoadingMovieDetails() {
  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow animate-pulse">
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

export function MovieDetails({ details }: MovieDetailsProps) {
  return (
    <Suspense fallback={<LoadingMovieDetails />}>
      <MovieDetailsContent details={details} />
    </Suspense>
  );
}
