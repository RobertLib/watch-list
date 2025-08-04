"use client";

import { useMemo } from "react";
import type {
  TranslationsResponse,
  TVTranslationsResponse,
} from "@/types/tmdb";

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
  // TMDB translations describe localized catalog metadata. Country codes are
  // locales, so they cannot establish audio, subtitle or streaming availability.
  // Collapse locale variants of the same language into one entry.
  const allLanguages = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string }>();

    for (const translation of translations.translations) {
      if (!byCode.has(translation.iso_639_1)) {
        byCode.set(translation.iso_639_1, {
          code: translation.iso_639_1,
          name:
            translation.english_name || translation.name || translation.iso_639_1,
        });
      }
    }

    return [...byCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [translations]);

  const getLanguageDisplay = (langCode: string, langName: string) => {
    const flag = languageFlags[langCode];
    return flag ? `${flag} ${langName}` : `🌍 ${langName}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow">
      <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
        🗣️ Translated Title Information
      </h3>

      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-gray-300 mb-2">
            Title and description translations:
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
              No title translations available
            </p>
          )}
        </div>

        {/* Information Note */}
        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p className="text-sm text-blue-200">
            These languages describe translated titles and descriptions on TMDb.
            Check your streaming service for audio and subtitle options.
          </p>
        </div>
      </div>
    </div>
  );
}
