import type { MovieDetails } from "@/types/tmdb";
import { isDateOnly, type MovieReleaseSource } from "./release-calendar";

interface MovieRelease {
  date: string;
  source: MovieReleaseSource;
}

/** Country-specific cinema dates take precedence over the primary release. */
export function movieRelease(details: MovieDetails, region: string): MovieRelease | null {
  const regionalDates = details.release_dates?.results?.find(
    (result) => result.iso_3166_1 === region,
  )?.release_dates ?? [];

  // Prefer the wide theatrical release to a limited screening. TMDB supplies
  // timestamps here; retain the reported calendar day without a timezone shift.
  for (const type of [3, 2]) {
    const dates = regionalDates.flatMap((entry) => {
      if (entry.type !== type || typeof entry.release_date !== "string") return [];
      const date = entry.release_date.slice(0, 10);
      if (!isDateOnly(date)) return [];
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
        ? [date] : [];
    }).sort();
    if (dates.length > 0) return { date: dates[0], source: "regional-theatrical" };
  }

  // Keep the primary date when local data is absent, but retain its source: it
  // may describe a festival or digital release, not cinema availability here.
  return isDateOnly(details.release_date)
    ? { date: details.release_date, source: "primary" }
    : null;
}
