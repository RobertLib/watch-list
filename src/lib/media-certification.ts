import type {
  ContentRatingsResponse,
  ReleaseDatesResponse,
} from "@/types/tmdb";

export interface MediaCertification {
  rating: string;
  region: string;
}

function resolveCertification(
  entries: MediaCertification[],
  region: string,
): MediaCertification | undefined {
  const available = entries
    .map((entry) => ({ ...entry, rating: entry.rating.trim() }))
    .filter((entry) => entry.rating.length > 0);

  // Keep the existing US fallback when the selected country has no rating.
  // Retain its country too: ratings from different systems are not equivalent.
  return (
    available.find((entry) => entry.region === region) ??
    available.find((entry) => entry.region === "US") ??
    available[0]
  );
}

export function resolveMovieCertification(
  response: ReleaseDatesResponse | undefined,
  region: string,
): MediaCertification | undefined {
  return resolveCertification(
    (response?.results ?? []).flatMap((result) =>
      result.release_dates.map((date) => ({
        region: result.iso_3166_1,
        rating: date.certification,
      })),
    ),
    region,
  );
}

export function resolveTVCertification(
  response: ContentRatingsResponse | undefined,
  region: string,
): MediaCertification | undefined {
  return resolveCertification(
    (response?.results ?? []).map((entry) => ({
      region: entry.iso_3166_1,
      rating: entry.rating,
    })),
    region,
  );
}
