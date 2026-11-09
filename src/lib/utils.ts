type ClassValue = string | number | boolean | undefined | null | ClassValue[];

/**
 * `ClassValue` nests arbitrarily deep, so the flatten has to as well. `.flat()`
 * only goes one level, which left any deeper array to be stringified by `join` –
 * turning ["c", false] into the class name "c,false". Recursion rather than
 * `.flat(Infinity)`: the latter sends the recursive type into an infinitely deep
 * instantiation.
 */
function flattenClasses(inputs: ClassValue[], out: string[] = []): string[] {
  for (const input of inputs) {
    if (Array.isArray(input)) {
      flattenClasses(input, out);
    } else if (input) {
      out.push(String(input));
    }
  }

  return out;
}

export function cn(...inputs: ClassValue[]): string {
  return flattenClasses(inputs).join(" ").trim();
}

/**
 * Identity of a title across both media types.
 *
 * TMDB numbers films and shows separately, so an id alone is ambiguous – 550 is
 * both Fight Club and a television series. Lives here rather than beside either
 * caller because the server builds these keys and the browser looks them up, and
 * the two have to agree exactly.
 */
export function mediaItemKey(
  id: number,
  mediaType: "movie" | "tv" | string,
): string {
  return `${mediaType}-${id}`;
}

/**
 * Latin letters Unicode does not decompose into a base letter plus a mark, so
 * stripping marks alone would still drop them: "Ødegaard" came out "degaard".
 */
const UNDECOMPOSED_LATIN: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  ħ: "h",
  ı: "i",
  ł: "l",
  þ: "th",
};

/**
 * The slug a title is addressed by: `createSlug("The Dark Knight", 155)` is
 * "the-dark-knight-155". The id is the half that matters – it is all
 * `extractIdFromSlug` reads back – and the words are for whoever reads the link.
 *
 * Accented Latin is transliterated rather than dropped: NFKD splits "é" into "e"
 * plus a combining accent, and only the accent is removed, so "Amélie" is
 * "amelie" rather than "amlie". A script with no Latin spelling to fall back on
 * – Japanese, Cyrillic, Arabic – leaves nothing, and the slug is then the bare
 * id. Keeping those letters instead would mean percent-encoding each one (nine
 * characters per kanji in a shared link) and mixing right-to-left text into
 * URLs, all to decorate a string whose only working part is the number. The
 * page shows the real title; the link only has to find it.
 */
export function createSlug(title: string, id: number): string {
  // Handle undefined/null title
  if (!title || typeof title !== "string") {
    return `item-${id}`;
  }

  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // Drop the accents NFKD split off their letters
    .toLowerCase()
    .replace(/[ßæœøđðħıłþ]/g, (letter) => UNDECOMPOSED_LATIN[letter])
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .trim()
    .replace(/^-+|-+$/g, ""); // Remove dashes from start and end

  // Nothing survived. Joining anyway is what produced "-129", which reads as a
  // negative id rather than as a title with no Latin letters in it.
  return slug ? `${slug}-${id}` : String(id);
}

/** A TMDB id the detail pages can use: a positive integer, exactly. */
function toId(digits: string): number | null {
  // Enough digits parse to Infinity, and anything past 2^53 to a neighbouring
  // integer – neither names the title in the URL. Null is what sends a page to
  // "not found" rather than into a request that can only fail, which it would
  // then report as TMDB being unreachable.
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The id out of a slug, or null when there is no usable one.
 *
 * Read in this order:
 * - a bare id, "1405" – what `createSlug` makes of a title with no Latin letters;
 * - the id on the end, "dexter-1405" – what it makes of every other title, and
 *   so the form of every link this app has built;
 * - the id on the front, "1405-dexter" – TMDB's own URL form, still accepted
 *   for a link typed or pasted by hand. Nothing here generates it.
 *
 * The last two collide when a slug has digits at both ends. "1367-rocky-2" is
 * TMDB's form of id 1367, and it is also exactly what `createSlug` builds for a
 * film called "1367 Rocky" with id 2. Titles that begin with a number are common
 * ("28-days-later-170", "2001-a-space-odyssey-62", "12-angry-men-389") and every
 * one of them is a link this app has handed out, while an id-first slug only
 * arrives by hand – so with nothing in the string to tell them apart, the form
 * this app emits wins. The front number is read only when the end one cannot be
 * an id at all.
 *
 * A lone leading dash, "-129", is the trailing form with an empty title. It is
 * what `createSlug` used to build for a title with no Latin letters, and those
 * links are still out there in shares and bookmarks, so it keeps resolving.
 */
export function extractIdFromSlug(slug: string): number | null {
  if (typeof slug !== "string") return null;

  // A bare id, e.g. "1405"
  if (/^\d+$/.test(slug)) {
    return toId(slug);
  }

  // The id at the end, e.g. "dexter-1405"
  const trailing = /-(\d+)$/.exec(slug);
  const trailingId = trailing ? toId(trailing[1]) : null;
  if (trailingId !== null) return trailingId;

  // The id at the beginning, e.g. "1405-dexter"
  const leading = /^(\d+)-/.exec(slug);
  return leading ? toId(leading[1]) : null;
}

// Dates used to be handled here too. They live in `dates.ts` now: reading a
// TMDB date correctly is a subject of its own rather than a one-liner, and
// having one home for it is what keeps the next `new Date(x).getFullYear()`
// from creeping back in.

