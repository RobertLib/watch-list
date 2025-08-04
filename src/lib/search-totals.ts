/**
 * How many *titles* a search matched.
 *
 * `/search/multi` is one request over three indexes – movies, shows and people –
 * and its `total_results` counts all three. The search page shows only the first
 * two, so printing that number as a count of titles overstates it for any query
 * that also names a person, which is most queries anybody types: searching an
 * actor read as "1,204 titles" above a grid of eleven.
 *
 * `/search/person` answers the same query against the same person index, which
 * makes the difference between the two totals the number of titles. The page
 * already fetches it to render the People shelf, so this costs no extra request.
 */
export function countTitleResults(
  multiTotal: number | undefined,
  personTotal: number | undefined,
): number {
  const total = Number.isFinite(multiTotal) ? (multiTotal as number) : 0;

  // Nothing to subtract. Happens when the people lookup is the half that failed,
  // and the raw total stands: overstating a count is a smaller failure than
  // blanking the heading over it.
  if (!Number.isFinite(personTotal)) return Math.max(0, total);

  // Clamped because two endpoints disagreeing by a row has to read as "no
  // titles", never as a negative count.
  return Math.max(0, total - (personTotal as number));
}
