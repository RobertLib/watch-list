import type { Locale } from "@/i18n/locale";
import type {
  PersonMovieCredit,
  PersonMovieCredits,
  PersonTVCredit,
  PersonTVCredits,
} from "@/types/tmdb";

interface CreditRoles {
  characters: string[];
  jobs: string[];
  hasCastCredit: boolean;
}

export type PersonMovieWork = Omit<PersonMovieCredit, "character"> & CreditRoles;
export type PersonTVWork = Omit<PersonTVCredit, "character"> & CreditRoles;

/** One row per title, preserving every distinct acting role and crew job. */
function mergeCredits<T extends { id: number; episode_count?: number }>(
  cast: (T & { character: string })[],
  crew: (T & { job: string })[],
): (T & CreditRoles)[] {
  const works = new Map<number, T & CreditRoles>();

  function add(credit: T, character: string | null, job: string | null) {
    let work = works.get(credit.id);
    if (!work) {
      work = { ...credit, characters: [], jobs: [], hasCastCredit: false };
      works.set(credit.id, work);
    }

    if (character !== null) {
      work.hasCastCredit = true;
      if (character.trim() && !work.characters.includes(character.trim())) {
        work.characters.push(character.trim());
      }
    }
    if (job?.trim() && !work.jobs.includes(job.trim())) {
      work.jobs.push(job.trim());
    }
    // Multiple characters/jobs can cover the same episodes. Adding their
    // counts would count an episode twice; keep the largest reported span.
    if (credit.episode_count !== undefined) {
      work.episode_count = Math.max(work.episode_count ?? 0, credit.episode_count);
    }
  }

  for (const credit of cast) add(credit, credit.character ?? "", null);
  for (const credit of crew) add(credit, null, credit.job ?? "");

  return [...works.values()];
}

export function personMovieWorks(credits: PersonMovieCredits): PersonMovieWork[] {
  return mergeCredits<Omit<PersonMovieCredit, "character">>(
    credits.cast ?? [],
    credits.crew ?? [],
  );
}

export function personTVWorks(credits: PersonTVCredits): PersonTVWork[] {
  return mergeCredits<Omit<PersonTVCredit, "character">>(
    credits.cast ?? [],
    credits.crew ?? [],
  );
}

/**
 * TMDB's crew jobs in Czech, named the way Czech credits name them: by the
 * work rather than the worker – "Režie", "Kamera", "Střih", not "režisér" –
 * which is also what keeps a label from assuming anybody's gender.
 *
 * TMDB knows several hundred jobs and sends them in English whatever language
 * it is asked in. These are the ones a title's crew section and a filmography
 * actually show; a job not listed keeps TMDB's English word, which is a name
 * left untranslated rather than a wrong one.
 */
const JOB_NAMES_CS: Record<string, string> = {
  Director: "Režie",
  "Co-Director": "Spolurežie",
  "Assistant Director": "Asistence režie",
  "First Assistant Director": "Asistence režie",
  "Second Assistant Director": "Asistence režie",
  "Script Supervisor": "Skript",
  "Animation Director": "Režie animace",
  Screenplay: "Scénář",
  Writer: "Scénář",
  Teleplay: "Scénář",
  Story: "Námět",
  "Original Story": "Námět",
  Idea: "Námět",
  Novel: "Předloha",
  Book: "Předloha",
  "Comic Book": "Předloha",
  "Short Story": "Předloha",
  "Original Concept": "Předloha",
  Author: "Předloha",
  Characters: "Postavy",
  "Story Editor": "Dramaturgie",
  "Executive Story Editor": "Dramaturgie",
  Producer: "Produkce",
  "Executive Producer": "Výkonná produkce",
  "Co-Producer": "Koprodukce",
  "Co-Executive Producer": "Výkonná koprodukce",
  "Associate Producer": "Přidružená produkce",
  "Line Producer": "Výkonná produkce",
  "Supervising Producer": "Supervize produkce",
  "Consulting Producer": "Konzultace produkce",
  "Production Manager": "Vedení produkce",
  "Unit Production Manager": "Vedení produkce",
  Casting: "Casting",
  "Casting Director": "Casting",
  "Original Music Composer": "Hudba",
  Music: "Hudba",
  Composer: "Hudba",
  "Music Supervisor": "Hudební supervize",
  "Music Editor": "Střih hudby",
  Orchestrator: "Orchestrace",
  Conductor: "Dirigování",
  Songs: "Písně",
  Sound: "Zvuk",
  "Sound Designer": "Zvukový design",
  "Sound Mixer": "Mix zvuku",
  "Sound Re-Recording Mixer": "Mix zvuku",
  "Production Sound Mixer": "Zvuk",
  "Supervising Sound Editor": "Supervize střihu zvuku",
  "Sound Effects Editor": "Střih zvukových efektů",
  "Dialogue Editor": "Střih dialogů",
  "Foley Artist": "Ruchy",
  "Director of Photography": "Kamera",
  Cinematography: "Kamera",
  "Camera Operator": "Kamera",
  "Additional Photography": "Další kamera",
  "Still Photographer": "Fotografie",
  Editor: "Střih",
  "Additional Editor": "Další střih",
  "Associate Editor": "Spolupráce na střihu",
  Colorist: "Barevné korekce",
  "Production Design": "Výprava",
  "Art Direction": "Výprava",
  "Supervising Art Director": "Výprava",
  "Set Decoration": "Dekorace",
  "Set Designer": "Návrhy dekorací",
  "Costume Design": "Kostýmy",
  "Costume Designer": "Kostýmy",
  "Costume Supervisor": "Supervize kostýmů",
  "Makeup Artist": "Masky",
  "Makeup Department Head": "Masky",
  "Key Makeup Artist": "Masky",
  "Hair Department Head": "Účesy",
  Hairstylist: "Účesy",
  "Prosthetic Makeup Artist": "Protetické masky",
  "Visual Effects": "Vizuální efekty",
  "Visual Effects Supervisor": "Supervize vizuálních efektů",
  "Visual Effects Producer": "Produkce vizuálních efektů",
  "Special Effects Supervisor": "Supervize speciálních efektů",
  "Stunt Coordinator": "Koordinace kaskadérů",
  "Fight Choreographer": "Choreografie soubojů",
  Choreographer: "Choreografie",
  Animation: "Animace",
  "Storyboard Artist": "Storyboard",
  "Location Manager": "Lokace",
  Gaffer: "Osvětlení",
  Creator: "Tvorba",
  Thanks: "Poděkování",
};

/** A crew job as the page's language names it. */
export function crewJobLabel(job: string, locale: Locale = "en"): string {
  return locale === "cs" ? (JOB_NAMES_CS[job] ?? job) : job;
}

/**
 * "as Forrest Gump · Director". In Czech the jobs are translated after the
 * merge, and the translations deduplicated again: TMDB's "Writer" and
 * "Screenplay" are two jobs in English and one word in Czech.
 */
export function creditRoleLabel(credit: CreditRoles, locale: Locale = "en"): string {
  return [
    ...new Set([
      ...credit.characters.map((character) =>
        locale === "cs" ? `jako ${character}` : `as ${character}`,
      ),
      ...credit.jobs.map((job) => crewJobLabel(job, locale)),
    ]),
  ].join(" · ");
}
