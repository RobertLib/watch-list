import type { Keyword } from "@/types/tmdb";
import { useT } from "@/i18n/LocaleProvider";

interface MediaKeywordsProps {
  keywords: Keyword[];
}

export function MediaKeywords({ keywords }: MediaKeywordsProps) {
  const t = useT();
  if (!keywords || keywords.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-3">{t("Keywords", "Klíčová slova")}</h2>
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
