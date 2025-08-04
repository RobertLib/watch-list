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

export function creditRoleLabel(credit: CreditRoles): string {
  return [
    ...credit.characters.map((character) => `as ${character}`),
    ...credit.jobs,
  ].join(" · ");
}
