import { BookOpen, ExternalLink } from "lucide-react";
import type { WikipediaContent } from "@/lib/wikipedia";

interface WikipediaInsightsProps {
  content: WikipediaContent;
}

export function WikipediaInsights({ content }: WikipediaInsightsProps) {
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
          Editorial Insights
        </h2>
        <a
          href={content.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:underline flex items-center gap-1"
        >
          Full article
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
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
    </div>
  );
}
