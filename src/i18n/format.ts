/**
 * Numbers, plurals and lists in the visitor's language.
 *
 * Every formatter takes the locale explicitly rather than reading it from the
 * page: most of them run during render, and a prerendered Czech page has to
 * print exactly what the browser hydrating it prints – which only the locale
 * from React context (or a page's own prop) guarantees.
 */

import { INTL_LOCALE, type Locale } from "./locale";

/** `1234` as "1,234" or "1 234". */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(INTL_LOCALE[locale], options);
}

/**
 * A score out of ten to one decimal: "7.3" in English, "7,3" in Czech. English
 * keeps `toFixed(1)` exactly, which is what every rating printed before.
 */
export function formatRating(value: number, locale: Locale): string {
  const fixed = value.toFixed(1);
  return locale === "cs" ? fixed.replace(".", ",") : fixed;
}

/**
 * The noun for a count, by each language's own rules.
 *
 * English has two forms (1 film, 2 films). Czech has three: one (1 film), a
 * few – two to four – (2 filmy), and many – zero, five and up – (5 filmů).
 * A fraction takes the "few" form in Czech's written usage (1,5 filmu), which
 * is close enough for the counts this site prints, all of them whole.
 */
export interface PluralForms {
  en: [one: string, other: string];
  cs: [one: string, few: string, many: string];
}

export function pluralForm(
  count: number,
  locale: Locale,
  forms: PluralForms,
): string {
  if (locale === "cs") {
    const [one, few, many] = forms.cs;
    if (count === 1) return one;
    if (Number.isInteger(count) && count >= 2 && count <= 4) return few;
    return Number.isInteger(count) ? many : few;
  }
  const [one, other] = forms.en;
  return count === 1 ? one : other;
}

/** "3 films", "3 filmy" – the count formatted and its noun agreed. */
export function formatCount(
  count: number,
  locale: Locale,
  forms: PluralForms,
): string {
  return `${formatNumber(count, locale)} ${pluralForm(count, locale, forms)}`;
}

/** "a, b and c" / "a, b a c". */
export function formatList(items: readonly string[], locale: Locale): string {
  if (items.length <= 1) return items[0] ?? "";
  const and = locale === "cs" ? "a" : "and";
  if (items.length === 2) return `${items[0]} ${and} ${items[1]}`;
  // English takes the serial comma; Czech never puts a comma before "a".
  const head = items.slice(0, -1).join(", ");
  return locale === "cs"
    ? `${head} a ${items[items.length - 1]}`
    : `${head}, and ${items[items.length - 1]}`;
}
