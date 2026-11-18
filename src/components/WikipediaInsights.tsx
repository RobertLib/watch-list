import { BookOpen, ExternalLink } from "lucide-react";
import type { WikipediaContent } from "@/lib/wikipedia";
import { useLocale, useT } from "@/i18n/LocaleProvider";

interface WikipediaInsightsProps {
  content: WikipediaContent;
}

/**
 * The article's lead and a few of its sections, from English Wikipedia in
 * either language: the CSP admits en.wikipedia.org only, and the article is
 * found through the title's Wikidata link to its English page. A Czech page
 * says so, and marks the text `lang="en"` so a screen reader reads it as
 * English rather than mispronouncing it as Czech.
 */
export function WikipediaInsights({ content }: WikipediaInsightsProps) {
  const locale = useLocale();
  const t = useT();
  const allSections = [
    ...(content.intro ? [{ title: "Overview", text: content.intro }] : []),
    ...content.sections,
  ];

  if (allSections.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-400" />
          {t("Editorial Insights", "Zajímavosti z Wikipedie")}
        </h2>
        <a
          href={content.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:underline flex items-center gap-1"
        >
          {t("Full article", "Celý článek (anglicky)")}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div
        className="bg-gray-800 rounded-lg divide-y divide-gray-700"
        lang={locale === "cs" ? "en" : undefined}
      >
        {allSections.map((section, i) => (
          <div key={i} className="px-5 py-4">
            {section.title !== "Overview" && (
              <h3 className="text-blue-300 font-semibold text-xs uppercase tracking-wider mb-2">
                {section.title}
              </h3>
            )}
            <p className="text-gray-300 text-sm leading-relaxed">
              {section.text}
            </p>
          </div>
        ))}
      </div>
      {locale === "cs" ? (
        <p className="mt-2 text-xs text-gray-500">
          Obsah pochází z{" "}
          <a
            href={content.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 underline"
          >
            anglické Wikipedie
          </a>{" "}
          a je k dispozici pod licencí{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/deed.cs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 underline"
          >
            CC BY-SA 4.0
          </a>
          .
        </p>
      ) : (
        <p className="mt-2 text-xs text-gray-500">
          Content sourced from{" "}
          <a
            href={content.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 underline"
          >
            Wikipedia
          </a>{" "}
          under{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-400 underline"
          >
            CC BY-SA 4.0
          </a>
        </p>
      )}
    </div>
  );
}
