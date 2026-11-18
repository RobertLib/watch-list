import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import { formatTmdbDate } from "@/lib/dates";
import type { TVShowDetails } from "@/types/tmdb";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { getRegionDataByCode } from "@/lib/regions-data";
import { languageLabel, mediaStatusLabel } from "@/lib/media-converters";

interface TVDetailsProps {
  details: TVShowDetails;
  certification?: string;
  certificationRegion?: string;
}

// The short "4/17/2011" form these two rows have always used ("17. 4. 2011"
// in Czech) – spelled out because `formatTmdbDate` defaults to the long one the
// detail pages want.
const NUMERIC_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

function TVDetailsContent({
  details,
  certification,
  certificationRegion,
}: TVDetailsProps) {
  const locale = useLocale();
  const t = useT();
  const imdbId = details.external_ids?.imdb_id;

  // TMDB names languages and countries in English, or in the language's own
  // name, whatever it is asked in; a Czech page looks them up by code.
  const languages = (details.spoken_languages ?? [])
    .map((lang) => languageLabel(lang.iso_639_1, lang.name, locale))
    .join(", ");
  const countries = (details.production_countries ?? [])
    .map((c) =>
      locale === "en"
        ? c.name
        : (getRegionDataByCode(c.iso_3166_1, locale)?.name ?? c.name),
    )
    .join(", ");

  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow border border-gray-800">
      <h3 className="text-xl font-bold mb-4 text-white">
        {t("TV Show Facts", "O seriálu")}
      </h3>
      <div className="space-y-3">
        <div>
          <span className="font-semibold text-gray-300">
            {t("Original Name:", "Původní název:")}
          </span>
          <p className="text-white">{details.original_name}</p>
        </div>

        <div>
          <span className="font-semibold text-gray-300">
            {t("Status:", "Stav:")}
          </span>
          <p className="text-white">{mediaStatusLabel(details.status, locale)}</p>
        </div>

        <div>
          <span className="font-semibold text-gray-300">
            {t("In Production:", "Ve výrobě:")}
          </span>
          <p className="text-white">
            {details.in_production ? t("Yes", "Ano") : t("No", "Ne")}
          </p>
        </div>

        {certification && (
          <div>
            <span className="font-semibold text-gray-300">
              {t("Age Rating", "Přístupnost")}
              {certificationRegion ? ` (${certificationRegion})` : ""}:
            </span>
            <p className="text-white">
              <span className="inline-block border border-gray-400 text-gray-200 text-sm px-2 py-0.5 rounded mt-1">
                {certification}
              </span>
            </p>
          </div>
        )}

        <div>
          <span className="font-semibold text-gray-300">
            {t("Language:", "Jazyk:")}
          </span>
          <p className="text-white">
            {languages
              ? locale === "cs"
                ? capitalize(languages)
                : languages
              : t("N/A", "Neuvedeno")}
          </p>
        </div>

        {details.production_countries &&
          details.production_countries.length > 0 && (
            <div>
              <span className="font-semibold text-gray-300">
                {t("Country of Origin:", "Země původu:")}
              </span>
              <p className="text-white">{countries}</p>
            </div>
          )}

        <div>
          <span className="font-semibold text-gray-300">
            {t("First Episode:", "První epizoda:")}
          </span>
          <p className="text-white">
            {formatTmdbDate(details.first_air_date, NUMERIC_DATE, locale)}
          </p>
        </div>

        {details.last_air_date && (
          <div>
            <span className="font-semibold text-gray-300">
              {t("Last Episode:", "Poslední epizoda:")}
            </span>
            <p className="text-white">
              {formatTmdbDate(details.last_air_date, NUMERIC_DATE, locale)}
            </p>
          </div>
        )}

        {details.networks && details.networks.length > 0 && (
          <div>
            <span className="font-semibold text-gray-300">
              {t("Networks:", "Stanice a platformy:")}
            </span>
            <div className="mt-2 flex flex-wrap gap-3">
              {details.networks.map((network) => (
                <div key={network.id} className="flex items-center gap-2">
                  {network.logo_path ? (
                    <div className="relative w-14 h-6 shrink-0">
                      {/* A 56px box: w154 covers it at 2x. */}
                      <Image
                        src={tmdbApi.getImageUrl(network.logo_path, "w154")}
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
                {t("Production Companies:", "Produkční společnosti:")}
              </span>
              <div className="mt-2 space-y-2">
                {details.production_companies.map((company) => (
                  <div key={company.id} className="flex items-center gap-2">
                    {company.logo_path && (
                      <div className="relative w-10 h-5 shrink-0">
                        {/* A 40px box: w92 covers it at 2x. */}
                        <Image
                          src={tmdbApi.getImageUrl(company.logo_path, "w92")}
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
              {t("Official Website", "Oficiální web")}
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
              {t("View on IMDb", "Zobrazit na IMDb")}
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

/** "angličtina, francouzština" opens a line as "Angličtina, francouzština". */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function TVDetails(props: TVDetailsProps) {
  return <TVDetailsContent {...props} />;
}
