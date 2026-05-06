import type { Credits } from "@/types/tmdb";

interface MediaFullCrewProps {
  credits: Credits;
}

const CREW_DEPARTMENTS: { department: string; label: string }[] = [
  { department: "Directing", label: "Direction" },
  { department: "Writing", label: "Writing" },
  { department: "Production", label: "Production" },
  { department: "Sound", label: "Music & Sound" },
  { department: "Camera", label: "Cinematography" },
  { department: "Editing", label: "Editing" },
  { department: "Art", label: "Art Direction" },
  { department: "Costume & Make-Up", label: "Costume & Make-Up" },
  { department: "Visual Effects", label: "Visual Effects" },
];

export function MediaFullCrew({ credits }: MediaFullCrewProps) {
  const grouped = CREW_DEPARTMENTS.map(({ department, label }) => ({
    label,
    members: credits.crew
      .filter((m) => m.department === department)
      .slice(0, 6),
  })).filter(({ members }) => members.length > 0);

  if (grouped.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-6">Full Crew</h2>
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
                  <span className="text-gray-400">{member.job}: </span>
                  {member.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
