/**
 * Which people get a prerendered page: the ones the prerendered titles link to.
 *
 * They used to be TMDB's "popular people", filtered to those known for
 * something widely seen. That list has nothing to do with the titles the build
 * prerenders, and it showed: a prerendered film's page linked to sixty-odd
 * people and one or two of them had a page – every other link went to the
 * `noindex` query-string shell, so the pages a crawler was sent to mostly led
 * it out of the index again, and the people who did have pages were barely
 * linked from anywhere.
 *
 * So the people are chosen from the titles instead: whoever is credited, in a
 * place the title page links from, on the most of them. Those are the same
 * people a visitor looks up by name – a director with six films in the list, an
 * actor in a dozen – and each of their pages is now reached from every one of
 * those titles, and links back to them.
 *
 * Kept apart from `prebuild.mjs` so it can be tested: that script deletes a
 * cache and calls TMDB the moment it is imported.
 */

/** Top-billed cast counted per title – the cards `MovieCast`/`TVCast` show. */
export const CAST_COUNTED = 12;

/** The crew a title page names in its header, each with a link. */
const KEY_JOBS = new Set(["Director", "Writer", "Screenplay", "Story"]);

/**
 * One TMDB credit, as far as this file reads it. Loosely typed on purpose: it
 * is another service's JSON, and `add` below checks what it relies on.
 *
 * @typedef {{
 *   id?: unknown,
 *   name?: unknown,
 *   adult?: unknown,
 *   popularity?: unknown,
 *   order?: number,
 *   job?: string,
 * }} Credit
 *
 * @typedef {{ cast?: Credit[], crew?: Credit[], createdBy?: Credit[] }} TitleCredits
 */

/**
 * The people one title's page links to prominently, each once: its top-billed
 * cast, its director and writers, and a series' creators.
 *
 * `cast` and `crew` are TMDB's credits; `createdBy` a series' `created_by`.
 *
 * @param {TitleCredits} title
 * @returns {{ id: number, name: string, popularity: number }[]}
 */
export function creditedPeople({ cast = [], crew = [], createdBy = [] }) {
  /** @type {Map<number, { id: number, name: string, popularity: number }>} */
  const people = new Map();
  /** @param {Credit | null | undefined} person */
  const add = (person) => {
    if (!person || person.adult) return;
    const { id, name } = person;
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      typeof name !== "string" ||
      people.has(id)
    ) {
      return;
    }
    people.set(id, {
      id,
      name,
      popularity: typeof person.popularity === "number" ? person.popularity : 0,
    });
  };

  // By billing order, one card per person however many roles they played.
  const billed = [...cast].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  /** @type {Set<unknown>} */
  const shown = new Set();
  for (const member of billed) {
    if (shown.size >= CAST_COUNTED) break;
    if (shown.has(member.id)) continue;
    shown.add(member.id);
    add(member);
  }
  for (const member of crew) {
    if (member.job !== undefined && KEY_JOBS.has(member.job)) add(member);
  }
  for (const creator of createdBy) add(creator);

  return [...people.values()];
}

/**
 * The `limit` people credited on the most titles, most-credited first.
 *
 * Ties go to whoever TMDB counts as more popular, then to the lower id – so
 * the list is the same from one build to the next when nothing changed, which
 * is what keeps yesterday's person pages from being swapped for others at the
 * cut-off for no reason.
 *
 * @param {TitleCredits[]} titles
 * @param {number} limit
 * @returns {{ id: number, name: string }[]}
 */
export function rankPeople(titles, limit) {
  /** @type {Map<number, { id: number, name: string, popularity: number, titles: number }>} */
  const tally = new Map();
  for (const title of titles) {
    for (const person of creditedPeople(title)) {
      const entry = tally.get(person.id);
      if (entry) {
        entry.titles += 1;
        entry.popularity = Math.max(entry.popularity, person.popularity);
      } else {
        tally.set(person.id, { ...person, titles: 1 });
      }
    }
  }

  return [...tally.values()]
    .sort(
      (a, b) =>
        b.titles - a.titles || b.popularity - a.popularity || a.id - b.id,
    )
    .slice(0, limit)
    .map(({ id, name }) => ({ id, name }));
}
