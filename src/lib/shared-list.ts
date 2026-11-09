import { sharedListHref } from "./routes";
import type { MediaType } from "@/types/tmdb";

/**
 * A watchlist encoded into a URL.
 *
 * The list travels in the link itself rather than in a record on a server, which
 * is what lets one exist at all without an account: the same URL shares a list
 * with a friend and carries it to a second device. Kept readable rather than
 * base64'd – it is shorter that way, and a link someone can glance at is easier
 * to trust than an opaque blob.
 *
 *   /list?items=m550.t1396.m1003596
 */

/** Each entry costs a TMDB read on render, and a URL has a practical length. */
export const MAX_SHARED_LIST_ITEMS = 60;
/**
 * Counted in UTF-16 code units, the unit `maxLength` counts on the input in
 * `ShareListButton` – so whatever fits in the field also survives the link.
 */
export const MAX_SHARED_LIST_TITLE_LENGTH = 60;

const SEPARATOR = ".";
const PREFIX: Record<MediaType, string> = { movie: "m", tv: "t" };

export interface SharedListRef {
  id: number;
  mediaType: MediaType;
}

export function encodeSharedList(items: SharedListRef[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const item of items) {
    if (!Number.isInteger(item.id) || item.id <= 0) continue;

    const prefix = PREFIX[item.mediaType];
    if (!prefix) continue;

    const token = `${prefix}${item.id}`;
    if (seen.has(token)) continue;

    seen.add(token);
    parts.push(token);

    if (parts.length >= MAX_SHARED_LIST_ITEMS) break;
  }

  return parts.join(SEPARATOR);
}

/**
 * Read a list back out of a URL segment.
 *
 * The segment is attacker-controlled, so anything unrecognised is skipped rather
 * than rejected: a link that picked up a stray character on its way through a
 * chat app should still open with the titles that survived.
 */
export function decodeSharedList(encoded: string): SharedListRef[] {
  if (typeof encoded !== "string" || encoded.length === 0) return [];

  const seen = new Set<string>();
  const refs: SharedListRef[] = [];

  for (const token of encoded.split(SEPARATOR)) {
    const match = /^([mt])(\d{1,12})$/.exec(token);
    if (!match) continue;

    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id <= 0) continue;

    const mediaType: MediaType = match[1] === "m" ? "movie" : "tv";
    const key = `${mediaType}-${id}`;
    if (seen.has(key)) continue;

    seen.add(key);
    refs.push({ id, mediaType });

    if (refs.length >= MAX_SHARED_LIST_ITEMS) break;
  }

  return refs;
}

/**
 * Control, format, private-use and unassigned characters – every `\p{C}` – but
 * the two joiners. ZWJ (U+200D) is what holds "👨‍👩‍👧" together as one family
 * rather than three people, and ZWNJ (U+200C) is part of how Persian and several
 * Indic scripts are spelled. The rest of the class goes: bidi overrides that
 * reorder what the title appears to say, invisible tag characters, and the lone
 * surrogates a hand-edited link can carry.
 */
const UNWANTED_CHARACTERS = /[^\P{C}\u200C\u200D]/gu;

/** A joiner with nothing on one side joins nothing; trimmed with the spaces. */
const EDGE_SPACE_OR_JOINER = /^[\s\u200C\u200D]+|[\s\u200C\u200D]+$/gu;

let graphemeSegmenter: Intl.Segmenter | null | undefined;

/**
 * What a title may be cut between: user-perceived characters where the browser
 * can say where they end, code points where it cannot. Either way never inside
 * a surrogate pair – the old cut by code unit could leave half an emoji at the
 * end, which `URLSearchParams` then sent on as U+FFFD.
 */
function cutPoints(value: string): Iterable<string> {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }

  if (!graphemeSegmenter) return value; // a string iterates by code point
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  // Whole pieces only, and the limit still in code units: a single "character"
  // stacked with a hundred combining marks is one grapheme, and counting
  // graphemes alone would let it carry the title past any length at all.
  let result = "";
  for (const piece of cutPoints(value)) {
    if (result.length + piece.length > maxLength) break;
    result += piece;
  }
  return result;
}

/**
 * A list title supplied by whoever built the link, so it is treated as hostile
 * text: control characters stripped, length bounded. React escapes the rest on
 * render, and it also reaches the document title.
 */
export function sanitizeSharedListTitle(value: unknown): string {
  if (typeof value !== "string") return "";

  const cleaned = value
    .replace(UNWANTED_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .replace(EDGE_SPACE_OR_JOINER, "");

  // Trimmed again: the cut can land just after a space, or – where only code
  // points are available – just after a joiner.
  return truncate(cleaned, MAX_SHARED_LIST_TITLE_LENGTH).replace(
    EDGE_SPACE_OR_JOINER,
    "",
  );
}

/** The path a share link points at, title included when there is one. */
export function buildSharedListPath(
  items: SharedListRef[],
  title?: string,
): string {
  const encoded = encodeSharedList(items);
  if (!encoded) return "";

  return sharedListHref(encoded, sanitizeSharedListTitle(title) || undefined);
}
