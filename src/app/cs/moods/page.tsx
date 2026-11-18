import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "@/i18n/Link";
import { Dices } from "lucide-react";
import { MOODS, MOOD_GROUPS, localizeMood, moodGroupHeading } from "@/lib/moods";
import { cn } from "@/lib/utils";
import { absoluteLocalizedUrl, moodHref } from "@/lib/routes";
import { StructuredData } from "@/components/StructuredData";

/**
 * The Czech counterpart of `app/(en)/moods/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

const TITLE = "Co sledovat podle nálady";
const DESCRIPTION =
  "Vyberte si večer, ne žánr: pro dobrou náladu, na přemýšlení, do 90 minut, o loupežích nebo z 90. let. Šedesát ručně sestavených výběrů, co sledovat.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/moods",
  locale: "cs",
});

const MOODS_CS = MOODS.map((mood) => localizeMood(mood, "cs"));

export default function MoodIndexPage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <StructuredData
        type="CollectionPage"
        locale="cs"
        data={{
          url: absoluteLocalizedUrl("/moods", "cs"),
          name: TITLE,
          overview: DESCRIPTION,
          listItems: MOODS_CS.map((mood) => ({
            name: mood.title,
            description: mood.description,
            url: absoluteLocalizedUrl(moodHref(mood.slug), "cs"),
          })),
        }}
      />
      <StructuredData
        type="BreadcrumbList"
        locale="cs"
        data={{
          breadcrumbItems: [
            { name: "Domů", url: absoluteLocalizedUrl("/", "cs") },
            { name: "Nálady", url: absoluteLocalizedUrl("/moods", "cs") },
          ],
        }}
      />

      <div className="mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold text-white mb-3">
          Na co máte náladu?
        </h1>
        <p className="text-gray-400 text-lg">
          Nikdo nechce „drama, 2019, seřazeno podle popularity“. Vyberte si
          raději, jaký má být večer.
        </p>
      </div>

      {MOOD_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`moods-${group.id}`} className="mb-12">
          <h2
            id={`moods-${group.id}`}
            className="text-2xl font-bold text-white mb-5"
          >
            {moodGroupHeading(group.id, "cs")}
          </h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOODS_CS.filter((mood) => mood.group === group.id).map((mood) => (
              <li key={mood.slug}>
                <Link
                  href={moodHref(mood.slug)}
                  prefetch={false}
                  className={cn(
                    "group block h-full rounded-2xl border bg-linear-to-br p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    mood.accent,
                  )}
                >
                  <span aria-hidden="true" className="text-3xl">
                    {mood.emoji}
                  </span>
                  <h3 className="mt-3 text-xl font-bold text-white">
                    {mood.label}
                  </h3>
                  <p className="mt-0.5 text-sm font-medium text-gray-200">
                    {mood.title}
                  </p>
                  <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">
                    {mood.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Dices className="w-5 h-5 text-blue-400" aria-hidden="true" />
            Už máte svůj seznam?
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Nechte ho vybrat za vás – podle toho, kolik máte času a co si
            můžete pustit právě teď.
          </p>
        </div>
        <Link
          href="/tonight"
          prefetch={false}
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors shrink-0"
        >
          Vybrat na dnešní večer
        </Link>
      </div>
    </div>
  );
}
