import { matchHref } from "./routes";
import { mediaItemKey } from "./utils";
import {
  decodeSharedList,
  encodeSharedList,
  type SharedListRef,
} from "./shared-list";

/**
 * What two people both want to watch.
 *
 * Two households, two watchlists, and forty minutes of "I don't mind, you pick".
 * The overlap is the answer, and it is computable from two share links alone –
 * no accounts, no friend graph, no records: both lists are already in their URLs,
 * so the match is just a set intersection over what the addresses say.
 */

export interface ListMatch {
  /** On both lists. The whole point. */
  shared: SharedListRef[];
  /** Only on the first list – "things you would have to sell them on". */
  onlyMine: SharedListRef[];
  onlyTheirs: SharedListRef[];
}

export function matchLists(
  mine: SharedListRef[],
  theirs: SharedListRef[],
): ListMatch {
  const theirKeys = new Set(
    theirs.map((ref) => mediaItemKey(ref.id, ref.mediaType)),
  );
  const myKeys = new Set(mine.map((ref) => mediaItemKey(ref.id, ref.mediaType)));

  return {
    // Ordered by the first list rather than sorted: it is the one whose owner is
    // most likely looking at the page, and their ordering is meaningful to them.
    shared: mine.filter((ref) =>
      theirKeys.has(mediaItemKey(ref.id, ref.mediaType)),
    ),
    onlyMine: mine.filter(
      (ref) => !theirKeys.has(mediaItemKey(ref.id, ref.mediaType)),
    ),
    onlyTheirs: theirs.filter(
      (ref) => !myKeys.has(mediaItemKey(ref.id, ref.mediaType)),
    ),
  };
}

/**
 * Compare the entire local list against the titles in the other share link.
 * Shared titles go first so the URL's cap cannot hide an overlap. Only the
 * unique-to-mine section may be shortened, which the result page says explicitly.
 */
export function buildMatchPath(
  mine: SharedListRef[],
  theirs: SharedListRef[],
): string {
  const b = encodeSharedList(theirs);
  if (!b) return "";

  // Reuse the shared-link validation without capping the local watchlist.
  const validMine = mine.flatMap((ref) =>
    decodeSharedList(encodeSharedList([ref])),
  );
  const shared = matchLists(validMine, decodeSharedList(b)).shared;
  const a = encodeSharedList([...shared, ...validMine]);
  if (!a) return "";

  const mineCount = new Set(
    validMine.map((ref) => mediaItemKey(ref.id, ref.mediaType)),
  ).size;
  return matchHref(a, b, {
    mineTruncated: mineCount > decodeSharedList(a).length,
  });
}

/**
 * Pull the encoded list out of whatever someone pasted.
 *
 * People paste the whole URL, because that is what they were given. Accepting
 * only the bare segment would mean an error message where the obvious thing
 * should have happened.
 */
export function extractListFromInput(input: string): SharedListRef[] {
  if (typeof input !== "string") return [];

  const trimmed = input.trim();
  if (!trimmed) return [];

  // Either an `items=<encoded>` parameter anywhere in the string, or the encoded
  // part alone. The parameter form is what a pasted share link looks like.
  const fromUrl = /[?&]items=([^&#\s]+)/.exec(trimmed);
  const candidate = fromUrl ? fromUrl[1] : trimmed;

  return decodeSharedList(safeDecode(candidate));
}

/**
 * `decodeURIComponent`, minus the exception.
 *
 * A link cut short at a copy boundary – "…items=m550%2" – or a stray "100%"
 * pasted after it is a malformed escape, and `decodeURIComponent` answers one
 * with a `URIError`. That used to leave the form's submit handler and take the
 * whole page to the error boundary, where "that does not look like a share
 * link" was the entire message that was due. The raw string is handed on
 * instead: `decodeSharedList` already skips whatever it cannot read.
 */
function safeDecode(candidate: string): string {
  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}
