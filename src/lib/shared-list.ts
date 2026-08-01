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
 *   /list/m550.t1396.m1003596
 */

/** Each entry costs a TMDB read on render, and a URL has a practical length. */
export const MAX_SHARED_LIST_ITEMS = 60;
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
 * A list title supplied by whoever built the link, so it is treated as hostile
 * text: control characters stripped, length bounded. React escapes the rest on
 * render, and it also reaches `generateMetadata`.
 */
export function sanitizeSharedListTitle(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\p{C}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SHARED_LIST_TITLE_LENGTH);
}

/** The path a share link points at, title included when there is one. */
export function buildSharedListPath(
  items: SharedListRef[],
  title?: string,
): string {
  const encoded = encodeSharedList(items);
  if (!encoded) return "";

  const cleanTitle = sanitizeSharedListTitle(title);
  const query = cleanTitle
    ? `?t=${encodeURIComponent(cleanTitle)}`
    : "";

  return `/list/${encoded}${query}`;
}
