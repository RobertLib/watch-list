import type { MovieDetails, TVShowDetails, Credits } from "@/types/tmdb";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function buildMovieFacts(
  details: MovieDetails,
  credits: Credits,
): string[] {
  const facts: string[] = [];

  // Tagline
  if (details.tagline) {
    facts.push(`The film's tagline is: "${details.tagline}"`);
  }

  // Original title differs from English
  if (
    details.original_title &&
    details.original_title !== details.title &&
    details.original_language !== "en"
  ) {
    facts.push(
      `The original title is "${details.original_title}" (${details.original_language.toUpperCase()}).`,
    );
  }

  // Budget & revenue
  if (details.budget > 0 && details.revenue > 0) {
    const profit = details.revenue - details.budget;
    const roi = ((profit / details.budget) * 100).toFixed(0);
    if (profit > 0) {
      facts.push(
        `With a budget of ${formatCurrency(details.budget)}, the film grossed ${formatCurrency(details.revenue)} — a profit of ${formatCurrency(profit)} (${roi}% ROI).`,
      );
    } else {
      facts.push(
        `The film had a budget of ${formatCurrency(details.budget)} but only grossed ${formatCurrency(details.revenue)}, losing ${formatCurrency(Math.abs(profit))} at the box office.`,
      );
    }
  } else if (details.budget > 0) {
    facts.push(`The production budget was ${formatCurrency(details.budget)}.`);
  } else if (details.revenue > 0) {
    facts.push(
      `The film grossed ${formatCurrency(details.revenue)} at the box office.`,
    );
  }

  // Runtime
  if (details.runtime && details.runtime > 0) {
    const hours = Math.floor(details.runtime / 60);
    const mins = details.runtime % 60;
    if (hours > 0 && mins > 0) {
      facts.push(
        `The runtime is ${details.runtime} minutes (${hours}h ${mins}m).`,
      );
    }
  }

  // Multiple languages
  if (details.spoken_languages && details.spoken_languages.length > 2) {
    const langs = details.spoken_languages
      .map((l) => l.english_name)
      .join(", ");
    facts.push(
      `The film features dialogue in ${details.spoken_languages.length} languages: ${langs}.`,
    );
  }

  // Multiple production countries
  if (details.production_countries && details.production_countries.length > 1) {
    const countries = details.production_countries
      .map((c) => c.name)
      .join(", ");
    facts.push(`It was a co-production between: ${countries}.`);
  }

  // Director
  const director = credits.crew.find((c) => c.job === "Director");
  if (director) {
    facts.push(`The film was directed by ${director.name}.`);
  }

  // Writers
  const writers = credits.crew
    .filter((c) => c.job === "Screenplay" || c.job === "Writer")
    .slice(0, 2);
  if (writers.length > 0) {
    facts.push(
      `The screenplay was written by ${writers.map((w) => w.name).join(" and ")}.`,
    );
  }

  // Composer
  const composer = credits.crew.find(
    (c) => c.job === "Original Music Composer",
  );
  if (composer) {
    facts.push(`The score was composed by ${composer.name}.`);
  }

  // Cinematographer
  const dop = credits.crew.find((c) => c.job === "Director of Photography");
  if (dop) {
    facts.push(`Cinematography was handled by ${dop.name}.`);
  }

  // Large cast
  if (credits.cast.length > 50) {
    facts.push(
      `The film features a large ensemble cast of over ${credits.cast.length} credited actors.`,
    );
  }

  // Vote count (popular)
  if (details.vote_count > 10000) {
    facts.push(
      `It has been rated by over ${new Intl.NumberFormat("en-US").format(details.vote_count)} users on TMDB with an average score of ${details.vote_average.toFixed(1)}/10.`,
    );
  }

  // IMDB link hint
  if (details.imdb_id) {
    facts.push(`This title is listed on IMDb as ${details.imdb_id}.`);
  }

  return facts;
}

export function buildTVFacts(
  details: TVShowDetails,
  credits: Credits,
): string[] {
  const facts: string[] = [];

  // Tagline
  if (details.tagline) {
    facts.push(`The show's tagline is: "${details.tagline}"`);
  }

  // Original name differs
  if (
    details.original_name &&
    details.original_name !== details.name &&
    details.original_language !== "en"
  ) {
    facts.push(
      `The original title is "${details.original_name}" (${details.original_language.toUpperCase()}).`,
    );
  }

  // Episode count & seasons
  if (details.number_of_seasons > 0 && details.number_of_episodes > 0) {
    const avgPerSeason = Math.round(
      details.number_of_episodes / details.number_of_seasons,
    );
    facts.push(
      `The series spans ${details.number_of_seasons} season${details.number_of_seasons > 1 ? "s" : ""} with ${details.number_of_episodes} episodes in total (avg. ${avgPerSeason} per season).`,
    );
  }

  // Episode runtime
  if (details.episode_run_time && details.episode_run_time.length > 0) {
    const rt = details.episode_run_time[0];
    facts.push(`Each episode runs approximately ${rt} minutes.`);
  }

  // Status
  if (details.status === "Ended") {
    const start = details.first_air_date
      ? new Date(details.first_air_date).getFullYear()
      : null;
    const end = details.last_air_date
      ? new Date(details.last_air_date).getFullYear()
      : null;
    if (start && end && start !== end) {
      facts.push(
        `The series ran from ${start} to ${end} — a total of ${end - start} years on air.`,
      );
    }
  } else if (details.status === "Returning Series" || details.in_production) {
    facts.push(
      `The show is currently in production with new episodes still being made.`,
    );
  }

  // Networks
  if (details.networks && details.networks.length > 0) {
    const networkNames = details.networks.map((n) => n.name).join(", ");
    facts.push(`Originally aired on ${networkNames}.`);
  }

  // Multiple production countries
  if (details.production_countries && details.production_countries.length > 1) {
    const countries = details.production_countries
      .map((c) => c.name)
      .join(", ");
    facts.push(`It was a co-production between: ${countries}.`);
  }

  // Multiple languages
  if (details.spoken_languages && details.spoken_languages.length > 2) {
    const langs = details.spoken_languages
      .map((l) => l.english_name)
      .join(", ");
    facts.push(
      `The series features dialogue in ${details.spoken_languages.length} languages: ${langs}.`,
    );
  }

  // Creator
  const creators = credits.crew.filter((c) => c.job === "Creator");
  if (creators.length > 0) {
    facts.push(`Created by ${creators.map((c) => c.name).join(" and ")}.`);
  }

  // Executive producers
  const execProducers = credits.crew
    .filter((c) => c.job === "Executive Producer")
    .slice(0, 3);
  if (execProducers.length > 0) {
    facts.push(
      `Executive produced by ${execProducers.map((p) => p.name).join(", ")}.`,
    );
  }

  // Vote count
  if (details.vote_count > 5000) {
    facts.push(
      `Rated by over ${new Intl.NumberFormat("en-US").format(details.vote_count)} users on TMDB with an average of ${details.vote_average.toFixed(1)}/10.`,
    );
  }

  return facts;
}
