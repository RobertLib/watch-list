import type { Keyword } from "@/types/tmdb";

interface MediaKeywordsProps {
  keywords: Keyword[];
}

export function MediaKeywords({ keywords }: MediaKeywordsProps) {
  if (!keywords || keywords.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-3">Keywords</h2>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <span
            key={keyword.id}
            className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded-full border border-gray-700"
          >
            {keyword.name}
          </span>
        ))}
      </div>
    </section>
  );
}
