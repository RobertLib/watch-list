/**
 * Which titles have a prerendered page of their own – `/movie/<slug>` rather
 * than `/movie?id=<slug>`.
 *
 * The list is settled before the build compiles anything (`scripts/prebuild.mjs`
 * writes it, `next.config.ts` inlines the ids as `PRERENDERED_TITLE_IDS`), so
 * this module answers the same in the build and in the browser. That matters
 * because `routes.ts` asks it for every title link: the prerendered HTML and
 * the hydrating browser have to build the same href, or React finds markup it
 * did not write.
 *
 * The encoding is compact because it ships in the bundle: per kind, the sorted
 * ids as base-36 gaps from the previous one, joined by `.`, and the three kinds
 * joined by `|` in the order of `KINDS`. About two thousand ids come to a few
 * kilobytes.
 */

export type PrerenderedKind = "movie" | "tv" | "person";

export const KINDS: readonly PrerenderedKind[] = ["movie", "tv", "person"];

/** Ids → the `PRERENDERED_TITLE_IDS` string. Used by `next.config.ts`. */
export function encodePrerenderedIds(
  ids: Record<PrerenderedKind, readonly number[]>,
): string {
  return KINDS.map((kind) => {
    let previous = 0;
    return [...new Set(ids[kind])]
      .sort((a, b) => a - b)
      .map((id) => {
        const gap = id - previous;
        previous = id;
        return gap.toString(36);
      })
      .join(".");
  }).join("|");
}

export function decodePrerenderedIds(
  encoded: string,
): Record<PrerenderedKind, Set<number>> {
  const parts = encoded.split("|");
  return Object.fromEntries(
    KINDS.map((kind, index) => {
      let previous = 0;
      const ids = new Set<number>();
      for (const gap of (parts[index] ?? "").split(".")) {
        if (!gap) continue;
        previous += parseInt(gap, 36);
        ids.add(previous);
      }
      return [kind, ids];
    }),
  ) as Record<PrerenderedKind, Set<number>>;
}

let decoded: { raw: string; ids: Record<PrerenderedKind, Set<number>> } | null =
  null;

/** Whether the build wrote a page of its own for this title. */
export function hasPrerenderedPage(kind: PrerenderedKind, id: number): boolean {
  // Read literally, every time: the bundler replaces this exact expression, and
  // a test can stub the variable between calls.
  const raw = process.env.PRERENDERED_TITLE_IDS ?? "";
  if (decoded?.raw !== raw) decoded = { raw, ids: decodePrerenderedIds(raw) };
  return decoded.ids[kind].has(id);
}
