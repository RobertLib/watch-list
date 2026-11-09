import { createSlug } from "@/lib/utils";
import { SITE_URL, absoluteMediaUrl, absoluteUrl } from "@/lib/routes";
import { isYouTubeKey } from "@/lib/trailer";

/**
 * JSON-LD, and a word about which of it any search engine reads.
 *
 * The static export prerenders this component wherever its page is rendered at
 * build time: the home page, `/moods`, `/genres` and the genre and mood pages,
 * `/about`, the puzzle archive – and the best-known films, series and people,
 * which the build prerenders at a path of their own (`/movie/fight-club-550`)
 * with their details in the HTML. There the `Movie`, `TVSeries` and `Person`
 * payloads, and their breadcrumbs, are in what a plain `curl` returns, on pages
 * that are indexable – so that is the markup that counts.
 *
 * Every other title is `/movie?id=…`: one shell served for every film, `noindex`
 * so that it never ranks in place of the titles it stands for. The payload it
 * builds once TMDB answers is correct and harmless, and nothing reads it.
 */
/**
 * Serialise a JSON-LD payload for inlining into a <script> tag.
 *
 * `JSON.stringify` leaves `<` untouched, so a `</script>` sitting in any field
 * would close the tag and let whatever follows be parsed as HTML. The payload is
 * built from TMDB data – overviews, titles and cast names are community-edited –
 * so it is treated as untrusted and every `<` is escaped to its unicode form,
 * which JSON parsers read back as the original character.
 */
function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

type TrailerData = { key: string; name: string; published_at?: string };

/**
 * A title's trailer as a schema.org `VideoObject`, or undefined.
 *
 * The callers pass what `findYouTubeTrailer` chose, which only picks keys that
 * are YouTube ids – checked again here because this is where the key becomes
 * a URL path, and a key with a `/` or `?` of its own would name another URL.
 */
function trailerVideoObject(trailer: TrailerData | undefined) {
  if (!trailer || !isYouTubeKey(trailer.key)) return undefined;
  return {
    "@type": "VideoObject",
    name: trailer.name,
    embedUrl: `https://www.youtube.com/embed/${trailer.key}`,
    thumbnailUrl: `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`,
    uploadDate: trailer.published_at || undefined,
  };
}

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
    | "Organization"
    | "Movie"
    | "TVSeries"
    | "WebApplication"
    | "BreadcrumbList"
    | "Person"
    | "MovieCollection"
    | "CollectionPage"
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
    listItems?: Array<{ name: string; description?: string; url: string }>;
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
        "@id": `${SITE_URL}/#website`,
        name: "WatchList",
        description:
          "Create your free movie and TV show watchlist. Discover trending films and track everything across all streaming platforms.",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        // No `SearchAction`. It existed to ask Google for a sitelinks search
        // box, and Google retired that feature in November 2024 – nothing else
        // read it. The site name above is what `WebSite` is still used for.
        ...data,
      };
      break;

    case "Organization":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "WatchList",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/icon-512.png"),
          width: 512,
          height: 512,
        },
        sameAs: ["https://github.com/RobertLib/watch-list"],
        ...data,
      };
      break;

    /**
     * No `aggregateRating` on either title type, deliberately. The only score
     * to give it is TMDB's, and Google's review-snippet guidelines say "don't
     * aggregate reviews or ratings from other websites" – markup that breaks
     * them is what a manual action for spammy structured data is for, and it
     * would land on the whole site rather than the one page. No
     * `dateModified` either: it was the release date again, which says nothing
     * about when this page changed.
     */
    case "Movie": {
      const movieTrailer = data.trailer as TrailerData | undefined;
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
        inLanguage: data.inLanguage || undefined,
        contentRating: data.contentRating || undefined,
        sameAs: data.sameAs || undefined,
        trailer: trailerVideoObject(movieTrailer),
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
      const tvTrailer = data.trailer as TrailerData | undefined;
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
        endDate: isEnded && data.last_air_date ? data.last_air_date : undefined,
        genre: data.genres?.map((g) => g.name) || [],
        numberOfSeasons: data.number_of_seasons,
        numberOfEpisodes: data.number_of_episodes,
        inLanguage: data.inLanguage || undefined,
        contentRating: data.contentRating || undefined,
        sameAs: data.sameAs || undefined,
        trailer: trailerVideoObject(tvTrailer),
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
        url: SITE_URL,
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
              // The query-string form the app serves. `/movie/<slug>` is a
              // path no route in a static export answers, so every entry in
              // this list was a 404 a crawler could follow.
              url: absoluteMediaUrl(
                "movie",
                createSlug(part.title, part.id),
              ),
              datePublished: part.release_date || undefined,
              image: part.poster_path
                ? `https://image.tmdb.org/t/p/w500${part.poster_path}`
                : undefined,
            },
          })) || [],
      };
      break;

    /**
     * A page whose whole content is a list of links – `/moods` is the one that
     * matters, and it is in the sitemap because `moods.ts` calls it the only
     * part of the discovery side worth landing on from a search engine.
     *
     * `CollectionPage` rather than the bare `ItemList` that `MovieCollection`
     * emits: this is a page *about* the list, with its own name and description,
     * and the entries are ordinary site pages rather than films.
     */
    case "CollectionPage":
      structuredData = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": data.url,
        url: data.url,
        name: data.name,
        description: data.overview || undefined,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: data.listItems?.length ?? 0,
          itemListElement:
            data.listItems?.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.name,
              description: item.description || undefined,
              url: item.url,
            })) || [],
        },
      };
      break;

    /**
     * Valid markup that no longer earns anything in Google: since August 2023
     * FAQ rich results are shown only for well-known government and health
     * sites. Kept – it is the home page's FAQ restated, other consumers may
     * still read it, and dropping it means editing `page.tsx` too – but do not
     * expect an FAQ panel under the search result.
     */
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

  // A native <script> rather than next/script: JSON-LD is data, not code to
  // execute, so it belongs in the markup rather than in a loader.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(structuredData),
      }}
    />
  );
}
