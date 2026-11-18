"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { localizeHref } from "@/lib/routes";
import { useLocale } from "./LocaleProvider";

/**
 * `next/link`, with the href moved into the page's language.
 *
 * Every builder in `routes.ts` answers with the English path; this is the one
 * place a Czech page turns `/movies` into `/cs/movies` (and a title into the
 * Czech tree's own page for it – see `localizeHref`). Components import this
 * in place of `next/link` and keep writing English paths.
 *
 * A link between the two trees – the language switch – is a full page load
 * anyway, because each tree has its own root layout.
 */
export default function Link({
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  return (
    <NextLink
      href={typeof href === "string" ? localizeHref(href, locale) : href}
      {...props}
    />
  );
}
