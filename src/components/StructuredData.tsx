import Script from "next/script";

interface Genre {
  id: number;
  name: string;
}

interface CastMember {
  id: number;
  name: string;
  character?: string;
}

interface CrewMember {
  id: number;
  name: string;
  job: string;
}

interface ProductionCompany {
  id: number;
  name: string;
}

interface StructuredDataProps {
  type: "Website" | "Movie" | "TVSeries" | "WebApplication" | "BreadcrumbList";
  data: {
    title?: string;
    name?: string;
    overview?: string;
    poster_path?: string;
    release_date?: string;
    first_air_date?: string;
    genres?: Genre[];
    runtime?: number;
    vote_average?: number;
    vote_count?: number;
    number_of_seasons?: number;
    number_of_episodes?: number;
    credits?: {
      cast?: CastMember[];
      crew?: CrewMember[];
    };
    production_companies?: ProductionCompany[];
    breadcrumbItems?: Array<{ name: string; url: string }>;
    url?: string; // Canonical URL for the entity
    [key: string]: unknown;
  };
}

export function StructuredData({ type, data }: StructuredDataProps) {
  let structuredData;

  switch (type) {
    case "Website":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "WatchList",
        description:
          "Discover the best movies and TV shows across all streaming platforms",
        url: "https://www.watch-list.me",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate:
              "https://www.watch-list.me/search?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
        sameAs: [
          // Add your social media links
          // 'https://twitter.com/yourhandle',
          // 'https://facebook.com/yourpage',
          // 'https://instagram.com/yourhandle'
        ],
        ...data,
      };
      break;

    case "Movie":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "Movie",
        "@id": data.url,
        url: data.url,
        name: data.title,
        description: data.overview,
        image: data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : undefined,
        datePublished: data.release_date,
        genre: data.genres?.map((g) => g.name) || [],
        duration: data.runtime ? `PT${data.runtime}M` : undefined,
        aggregateRating: data.vote_average
          ? {
              "@type": "AggregateRating",
              ratingValue: data.vote_average,
              ratingCount: data.vote_count,
              bestRating: 10,
              worstRating: 0,
            }
          : undefined,
        director:
          data.credits?.crew
            ?.filter((person) => person.job === "Director")
            .map((director) => ({
              "@type": "Person",
              name: director.name,
            })) || [],
        actor:
          data.credits?.cast?.slice(0, 10).map((actor) => ({
            "@type": "Person",
            name: actor.name,
          })) || [],
        productionCompany:
          data.production_companies?.map((company) => ({
            "@type": "Organization",
            name: company.name,
          })) || [],
      };
      break;

    case "TVSeries":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "TVSeries",
        "@id": data.url,
        url: data.url,
        name: data.name,
        description: data.overview,
        image: data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : undefined,
        datePublished: data.first_air_date,
        genre: data.genres?.map((g) => g.name) || [],
        numberOfSeasons: data.number_of_seasons,
        numberOfEpisodes: data.number_of_episodes,
        aggregateRating: data.vote_average
          ? {
              "@type": "AggregateRating",
              ratingValue: data.vote_average,
              ratingCount: data.vote_count,
              bestRating: 10,
              worstRating: 0,
            }
          : undefined,
        actor:
          data.credits?.cast?.slice(0, 10).map((actor) => ({
            "@type": "Person",
            name: actor.name,
          })) || [],
        productionCompany:
          data.production_companies?.map((company) => ({
            "@type": "Organization",
            name: company.name,
          })) || [],
      };
      break;

    case "WebApplication":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "WatchList",
        description:
          "Discover and track movies and TV shows across streaming platforms",
        url: "https://www.watch-list.me",
        applicationCategory: "Entertainment",
        operatingSystem: "Web Browser",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        ...data,
      };
      break;

    case "BreadcrumbList":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement:
          data.breadcrumbItems?.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url,
          })) || [],
      };
      break;

    default:
      structuredData = data;
  }

  return (
    <Script
      id={`structured-data-${type.toLowerCase()}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData),
      }}
    />
  );
}
