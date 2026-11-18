import Link from "@/i18n/Link";
import { createSlug } from "@/lib/utils";
import type { Credits } from "@/types/tmdb";
import { personHref } from "@/lib/routes";
import { crewJobLabel } from "@/lib/person-credits";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { pick, type Localized } from "@/i18n/locale";

interface MediaFullCrewProps {
  credits: Credits;
}

// Matched on TMDB's English department names, which it sends in either
// language; only the headings are the page's.
const CREW_DEPARTMENTS: { department: string; label: Localized }[] = [
  { department: "Directing", label: { en: "Direction", cs: "Režie" } },
  { department: "Writing", label: { en: "Writing", cs: "Scénář" } },
  { department: "Production", label: { en: "Production", cs: "Produkce" } },
  { department: "Sound", label: { en: "Music & Sound", cs: "Hudba a zvuk" } },
  { department: "Camera", label: { en: "Cinematography", cs: "Kamera" } },
  { department: "Editing", label: { en: "Editing", cs: "Střih" } },
  { department: "Art", label: { en: "Art Direction", cs: "Výprava" } },
  {
    department: "Costume & Make-Up",
    label: { en: "Costume & Make-Up", cs: "Kostýmy a masky" },
  },
  {
    department: "Visual Effects",
    label: { en: "Visual Effects", cs: "Vizuální efekty" },
  },
];

export function MediaFullCrew({ credits }: MediaFullCrewProps) {
  const locale = useLocale();
  const t = useT();
  const grouped = CREW_DEPARTMENTS.map(({ department, label }) => ({
    label: pick(locale, label),
    members: credits.crew
      .filter((m) => m.department === department)
      .slice(0, 6),
  })).filter(({ members }) => members.length > 0);

  if (grouped.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">{t("Full Crew", "Štáb")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {grouped.map(({ label, members }) => (
          <div key={label}>
            <h3 className="font-semibold text-gray-300 mb-2 text-sm uppercase tracking-wide">
              {label}
            </h3>
            <ul className="space-y-1">
              {members.map((member) => (
                <li
                  key={`${member.id}-${member.job}`}
                  className="text-white text-sm"
                >
                  <span className="text-gray-400">
                    {crewJobLabel(member.job, locale)}:{" "}
                  </span>
                  <Link
                    href={personHref(createSlug(member.name, member.id))}
                    prefetch={false}
                    className="hover:text-blue-400 transition-colors"
                  >
                    {member.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
