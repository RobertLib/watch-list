"use client";

import { useEffect, useState } from "react";
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
  const [regionCode, setRegionCode] = useState<string>("US");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRegion() {
      try {
        const response = await fetch("/api/region", {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json();
          setRegionCode(data.region);
        }
      } catch (error) {
        console.error("Failed to fetch region:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRegion();
  }, []);

  // Get all unique languages from translations
  const allLanguages = translations.translations.reduce((acc, translation) => {
    const key = translation.iso_639_1;
    if (!acc.find((lang) => lang.code === key)) {
      acc.push({
        code: translation.iso_639_1,
        name: translation.english_name,
        localName: translation.name,
        regions: [translation.iso_3166_1],
      });
    } else {
      const existing = acc.find((lang) => lang.code === key);
      if (existing && !existing.regions.includes(translation.iso_3166_1)) {
        existing.regions.push(translation.iso_3166_1);
      }
    }
    return acc;
  }, [] as Array<{ code: string; name: string; localName: string; regions: string[] }>);

  // Check if current region has specific language support
  const currentRegionLanguages = allLanguages.filter((lang) =>
    lang.regions.includes(regionCode)
  );

  const getLanguageDisplay = (langCode: string, langName: string) => {
    const flag = languageFlags[langCode];
    return flag ? `${flag} ${langName}` : `🌍 ${langName}`;
  };

  const getAvailabilityStatus = (langCode: string) => {
    const lang = allLanguages.find((l) => l.code === langCode);
    if (!lang) return null;

    const inCurrentRegion = lang.regions.includes(regionCode);
    const regionCount = lang.regions.length;

    return {
      inCurrentRegion,
      regionCount,
      status: inCurrentRegion
        ? "available"
        : regionCount > 0
        ? "limited"
        : "unavailable",
    };
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 shadow animate-pulse">
        <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
        <div className="space-y-4">
          <div>
            <div className="h-4 bg-gray-700 rounded mb-2 w-1/3"></div>
            <div className="flex gap-2">
              <div className="h-6 bg-gray-700 rounded w-16"></div>
              <div className="h-6 bg-gray-700 rounded w-20"></div>
            </div>
          </div>
          <div>
            <div className="h-4 bg-gray-700 rounded mb-2 w-1/3"></div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-6 bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow">
      <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
        🗣️ Language Support
      </h3>

      <div className="space-y-4">
        {/* Current Region Languages */}
        {currentRegionLanguages.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">
              Available in Your Region ({regionCode}):
            </h4>
            <div className="flex flex-wrap gap-2">
              {currentRegionLanguages
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map((lang) => (
                  <span
                    key={lang.code}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded-full flex items-center gap-1"
                  >
                    {getLanguageDisplay(lang.code, lang.name)}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* All Available Languages */}
        <div>
          <h4 className="font-semibold text-gray-300 mb-2">
            All Available Languages:
          </h4>
          {allLanguages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {allLanguages
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map((lang) => {
                  const status = getAvailabilityStatus(lang.code);
                  return (
                    <div
                      key={lang.code}
                      className="text-sm p-2 rounded flex items-center justify-between text-gray-300 bg-gray-700"
                    >
                      <span>{getLanguageDisplay(lang.code, lang.name)}</span>
                      <span className="text-xs text-gray-400">
                        {status?.regionCount}{" "}
                        {status?.regionCount === 1 ? "region" : "regions"}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">
              No language information available
            </p>
          )}
        </div>

        {/* Information Note */}
        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p className="text-sm text-blue-200">
            <span className="font-semibold">💡 Note:</span> Language
            availability indicates potential subtitle or dubbing support. Actual
            availability may vary by platform and region. Check your streaming
            service for specific subtitle/dubbing options.
          </p>
        </div>
      </div>
    </div>
  );
}
