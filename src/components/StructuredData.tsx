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

interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

interface StructuredDataProps {
  type:
    | "Website"
    | "Movie"
    | "TVSeries"
    | "WebApplication"
    | "BreadcrumbList"
    | "Person"
    | "MovieCollection"
    | "FAQPage";
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
    production_countries?: ProductionCountry[];
    keywords?: string[];
    breadcrumbItems?: Array<{ name: string; url: string }>;
    faqItems?: Array<{ question: string; answer: string }>;
    url?: string; // Canonical URL for the entity
    parts?: Array<{
      id: number;
      title: string;
      release_date?: string;
      poster_path?: string | null;
    }>;
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
          "Create your free movie and TV show watchlist. Discover trending films and track everything across all streaming platforms.",
        url: "https://www.watch-list.me",
        ...data,
      };
      break;

    case "Movie": {
      const movieTrailer = data.trailer as
        | { key: string; name: string; published_at?: string }
        | undefined;
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
        dateModified: data.release_date,
        genre: data.genres?.map((g) => g.name) || [],
        duration: data.runtime ? `PT${data.runtime}M` : undefined,
        inLanguage: data.inLanguage || undefined,
        contentRating: data.contentRating || undefined,
        sameAs: data.sameAs || undefined,
        aggregateRating: data.vote_average
          ? {
              "@type": "AggregateRating",
              ratingValue: data.vote_average,
              ratingCount: data.vote_count,
              bestRating: 10,
              worstRating: 0,
            }
          : undefined,
        trailer: movieTrailer
          ? {
              "@type": "VideoObject",
              name: movieTrailer.name,
              embedUrl: `https://www.youtube.com/embed/${movieTrailer.key}`,
              thumbnailUrl: `https://img.youtube.com/vi/${movieTrailer.key}/hqdefault.jpg`,
              uploadDate: movieTrailer.published_at || undefined,
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
        countryOfOrigin:
          data.production_countries && data.production_countries.length > 0
            ? { "@type": "Country", name: data.production_countries[0].name }
            : undefined,
        keywords: data.keywords?.join(", ") || undefined,
      };
      break;
    }

    case "TVSeries": {
      const tvTrailer = data.trailer as
        | { key: string; name: string; published_at?: string }
        | undefined;
      const createdBy = data.created_by as
        | { id: number; name: string }[]
        | undefined;
      const tvStatus = data.status as string | undefined;
      const isEnded =
        tvStatus &&
        tvStatus !== "Returning Series" &&
        tvStatus !== "In Production" &&
        tvStatus !== "Planned";
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
        dateModified:
          (data.last_air_date as string | undefined) || data.first_air_date,
        endDate: isEnded && data.last_air_date ? data.last_air_date : undefined,
        genre: data.genres?.map((g) => g.name) || [],
        numberOfSeasons: data.number_of_seasons,
        numberOfEpisodes: data.number_of_episodes,
        inLanguage: data.inLanguage || undefined,
        contentRating: data.contentRating || undefined,
        sameAs: data.sameAs || undefined,
        aggregateRating: data.vote_average
          ? {
              "@type": "AggregateRating",
              ratingValue: data.vote_average,
              ratingCount: data.vote_count,
              bestRating: 10,
              worstRating: 0,
            }
          : undefined,
        trailer: tvTrailer
          ? {
              "@type": "VideoObject",
              name: tvTrailer.name,
              embedUrl: `https://www.youtube.com/embed/${tvTrailer.key}`,
              thumbnailUrl: `https://img.youtube.com/vi/${tvTrailer.key}/hqdefault.jpg`,
              uploadDate: tvTrailer.published_at || undefined,
            }
          : undefined,
        creator:
          createdBy && createdBy.length > 0
            ? createdBy.map((c) => ({ "@type": "Person", name: c.name }))
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
        countryOfOrigin:
          data.production_countries && data.production_countries.length > 0
            ? { "@type": "Country", name: data.production_countries[0].name }
            : undefined,
        keywords: data.keywords?.join(", ") || undefined,
      };
      break;
    }

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

    case "Person": {
      const performerIn = data.performerIn as
        | Array<{ type: "movie" | "tv"; name: string; url: string }>
        | undefined;
      structuredData = {
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": data.url,
        url: data.url,
        name: data.name,
        description: data.overview || undefined,
        image: data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : undefined,
        birthDate: data.release_date || undefined,
        deathDate: data.deathDate || undefined,
        birthPlace: data.birthPlace
          ? { "@type": "Place", name: data.birthPlace }
          : undefined,
        jobTitle: data.jobTitle || undefined,
        hasOccupation: data.jobTitle
          ? { "@type": "Occupation", name: data.jobTitle }
          : undefined,
        sameAs: data.sameAs || undefined,
        performerIn:
          performerIn && performerIn.length > 0
            ? performerIn.map((w) => ({
                "@type": w.type === "movie" ? "Movie" : "TVSeries",
                name: w.name,
                url: w.url,
              }))
            : undefined,
      };
      break;
    }

    case "MovieCollection":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": data.url,
        url: data.url,
        name: data.name,
        description: data.overview || undefined,
        image: data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : undefined,
        itemListElement:
          data.parts?.map((part, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "Movie",
              name: part.title,
              url: `https://www.watch-list.me/movie/${part.id}-${part.title
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .trim()}`,
              datePublished: part.release_date || undefined,
              image: part.poster_path
                ? `https://image.tmdb.org/t/p/w500${part.poster_path}`
                : undefined,
            },
          })) || [],
      };
      break;

    case "FAQPage":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity:
          data.faqItems?.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
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
