/**
 * TMDB dates, read as the calendar days they actually are.
 *
 * Almost every date TMDB hands back – a release date, an air date, a birthday –
 * is a bare `YYYY-MM-DD`. It names a day in no timezone at all: a film released
 * on the 17th was released on the 17th everywhere.
 *
 * `new Date("2011-04-17")` does not mean that. It means midnight UTC on the
 * 17th, an *instant*, and every getter that is not a `getUTC*` one then reports
 * that instant in the visitor's own zone. West of Greenwich the instant is still
 * the previous evening, so the day comes out one earlier – and with it the year,
 * whenever the date is the 1st of January:
 *
 *   TZ=America/New_York  new Date("2020-01-01").getFullYear()  // 2019
 *
 * That last case is not the rarity it looks like. TMDB stores a title whose
 * release it only knows the year of as the 1st of January, which covers between
 * a tenth and a third of the catalogue depending on the decade – so on a listing
 * page in the Americas, roughly every fifth year printed was wrong.
 *
 * Hence this module. Nothing here ever converts a `YYYY-MM-DD` into an instant
 * in the local zone: the year is read off the string, and anything formatted for
 * display is pinned to UTC so it comes back out as the day that went in.
 */

/** A bare TMDB date. Captures year, month and day so none of them need parsing. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The default shape for a date on a detail page: "April 17, 2011". */
const LONG_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

/**
 * The year of a TMDB date, or null when there isn't one to read.
 *
 * Null rather than `NaN` so callers can use `??` and get a placeholder, which is
 * what they all want: the old `new Date(x).getFullYear() || "N/A"` leaned on NaN
 * being falsy, and that only worked by accident.
 *
 * Full timestamps – TMDB uses them for review dates – are still accepted, and
 * read in UTC for the same reason everything else here is.
 */
export function releaseYear(date: string | null | undefined): number | null {
  if (typeof date !== "string") return null;

  const trimmed = date.trim();
  if (!trimmed) return null;

  // The common case, and the one that must not go through `Date` at all.
  const match = DATE_ONLY.exec(trimmed);
  if (match) return Number(match[1]);

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

/**
 * " (2011)" for a date, "" for one that is missing or unparseable.
 *
 * Detail-page titles used to interpolate the year unconditionally, so a title
 * TMDB has no date for came out as "Some Film (N/A)" – in the tab, in the search
 * result and in every share preview.
 */
export function releaseYearSuffix(date: string | null | undefined): string {
  const year = releaseYear(date);
  return year === null ? "" : ` (${year})`;
}

/**
 * A TMDB date formatted for display, or null when there is no day to show.
 *
 * Deliberately strict about its input: only a bare `YYYY-MM-DD` is accepted,
 * because a full timestamp is a real instant and pinning *that* to UTC would be
 * the mirror image of the bug this module exists to prevent. A caller holding a
 * timestamp wants the local zone and should format it itself.
 */
export function formatTmdbDate(
  date: string | null | undefined,
  options: Intl.DateTimeFormatOptions = LONG_DATE,
): string | null {
  if (typeof date !== "string") return null;

  const trimmed = date.trim();
  if (!DATE_ONLY.test(trimmed)) return null;

  // `2020-13-45` gets past the pattern and lands here as an Invalid Date.
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** Today where the visitor is, as `YYYY-MM-DD` – the domain everything else uses. */
export function todayLocal(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Whole years between two calendar days, the way an age is counted.
 *
 * Counted on the calendar rather than by dividing elapsed milliseconds by an
 * average year. That average – 365.25 days – drifts against the real leap
 * pattern by enough to land on the wrong side of a birthday: someone born on the
 * 13th of September 1920 read as 105 on their 106th birthday.
 *
 * Local rather than UTC for the `to` end, because "how old is this person" is a
 * question about the day the visitor is having, not the one Greenwich is.
 */
export function yearsBetween(
  from: string | null | undefined,
  to: string = todayLocal(),
): number | null {
  if (typeof from !== "string") return null;

  const start = DATE_ONLY.exec(from.trim());
  const end = DATE_ONLY.exec(to.trim());
  if (!start || !end) return null;

  let years = Number(end[1]) - Number(start[1]);

  // Both halves are zero-padded to a fixed width, so comparing them as strings
  // orders them exactly as comparing the numbers would.
  const beforeAnniversary =
    end[2] < start[2] || (end[2] === start[2] && end[3] < start[3]);
  if (beforeAnniversary) years -= 1;

  return years;
}

/**
 * `YYYY-MM-DD` shifted by whole days, without leaving the string domain.
 *
 * Zone-free: the input names a calendar day and so does the output, so the UTC
 * midnight this pins to is an implementation detail rather than a claim about
 * an instant. Which is what makes it safe to shift a *local* day with it.
 */
export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * `YYYY-MM-DD` shifted by whole calendar years.
 *
 * Not `shiftDate(date, years * 365)`, which is the form this replaced in every
 * discovery listing: a "last 15 years" floor built that way lands four days
 * early, because fifteen years hold three or four leap days. The drift is small
 * but it is also free to avoid, and it is the same mistake `yearsBetween` above
 * exists to document.
 *
 * The 29th of February in a year that has none rolls into the 1st of March,
 * which is what `Date` does and what a date floor wants anyway.
 */
export function shiftYears(date: string, years: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return shifted.toISOString().slice(0, 10);
}
