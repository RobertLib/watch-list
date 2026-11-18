"use client";

import { useMemo } from "react";
import type {
  TranslationsResponse,
  TVTranslationsResponse,
} from "@/types/tmdb";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { languageLabel } from "@/lib/media-converters";

interface LanguageSupportProps {
  translations: TranslationsResponse | TVTranslationsResponse;
}

// Language flag mapping for better display
const languageFlags: Record<string, string> = {
  cs: "🇨🇿",
  sk: "🇸🇰",
  en: "🇺🇸",
  de: "🇩🇪",
  fr: "🇫🇷",
  es: "🇪🇸",
  it: "🇮🇹",
  ru: "🇷🇺",
  pl: "🇵🇱",
  hu: "🇭🇺",
  pt: "🇵🇹",
  nl: "🇳🇱",
  ja: "🇯🇵",
  ko: "🇰🇷",
  zh: "🇨🇳",
  ar: "🇸🇦",
  hi: "🇮🇳",
  th: "🇹🇭",
  tr: "🇹🇷",
  sv: "🇸🇪",
  da: "🇩🇰",
  no: "🇳🇴",
  fi: "🇫🇮",
};

export function LanguageSupport({ translations }: LanguageSupportProps) {
  const locale = useLocale();
  const t = useT();
  // TMDB translations describe localized catalog metadata. Country codes are
  // locales, so they cannot establish audio, subtitle or streaming availability.
  // Collapse locale variants of the same language into one entry.
  const allLanguages = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string }>();

    for (const translation of translations.translations) {
      if (!byCode.has(translation.iso_639_1)) {
        const tmdbName =
          translation.english_name || translation.name || translation.iso_639_1;
        // A Czech page names the language in Czech ("Němčina"), capitalised
        // because each one stands alone on a chip.
        const localName = languageLabel(translation.iso_639_1, tmdbName, locale);
        byCode.set(translation.iso_639_1, {
          code: translation.iso_639_1,
          name:
            locale === "cs"
              ? localName.charAt(0).toUpperCase() + localName.slice(1)
              : localName,
        });
      }
    }

    // The locale is pinned, as in `regions-data.ts`: with none, the order is
    // the runtime's – English in the build that prerenders a title page, the
    // visitor's own in the browser that hydrates it – and the two orders of the
    // same list are a hydration mismatch. Pinned to the page's language, so a
    // Czech list sorts "Č" after "C" and "Ch" after "H".
    return [...byCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name, locale === "cs" ? "cs" : "en"),
    );
  }, [translations, locale]);

  const getLanguageDisplay = (langCode: string, langName: string) => {
    const flag = languageFlags[langCode];
    return flag ? `${flag} ${langName}` : `🌍 ${langName}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow">
      <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
        🗣️ {t("Translated Title Information", "Překlady názvu a popisu")}
      </h3>

      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-gray-300 mb-2">
            {t(
              "Title and description translations:",
              "Název a popis jsou přeložené do těchto jazyků:",
            )}
          </h4>
          {allLanguages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {allLanguages.map((lang) => (
                <div
                  key={lang.code}
                  className="text-sm p-2 rounded text-gray-300 bg-gray-700"
                >
                  {getLanguageDisplay(lang.code, lang.name)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">
              {t(
                "No title translations available",
                "Překlady názvu nejsou k dispozici",
              )}
            </p>
          )}
        </div>

        {/* Information Note */}
        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p className="text-sm text-blue-200">
            {t(
              "These languages describe translated titles and descriptions on TMDb. Check your streaming service for audio and subtitle options.",
              "Jde o překlady názvu a popisu na TMDb, ne o dabing či titulky. Jazyky zvuku a titulků zjistíte u své streamovací služby.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
