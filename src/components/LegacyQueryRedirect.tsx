"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSection } from "@/components/LoadingSpinner";
import { NotFoundNotice } from "@/components/NotFoundNotice";
import { findGenreById, genreSlug } from "@/lib/genre-catalog";
import { findStreamingPlatform } from "@/lib/streaming-landing";
import { findMood } from "@/lib/moods";
import { sanitizeWatchProvidersFilter } from "@/lib/watch-provider-settings";
import { genreHref, moodHref } from "@/lib/routes";
import { extractIdFromSlug } from "@/lib/utils";
import type { MediaType } from "@/types/tmdb";

/**
 * The query-string addresses genres and moods had before they became paths.
 *
 * `/genres/movie?genre=action-28&provider=netflix` and `/mood?id=easy-watch`
 * were the only form for a while, so they are in bookmarks, shared links and
 * the visitor's history. `/genres/movie` and `/mood` are still real pages, and
 * all they do now is move the visitor to the path that replaced the query –
 * filters and page number included. They stay `noindex`: a redirect done in the
 * browser is nothing a search engine should index.
 */

/** Where an old genre URL lives now, or `null` for a genre that does not exist. */
export function legacyGenreQueryTarget(
  mediaType: MediaType,
  params: URLSearchParams,
): string | null {
  // `/genres/movie` on its own names no genre: the index of them is the answer.
  if (!params.has("genre")) return "/genres";

  const genre = findGenreById(
    mediaType,
    extractIdFromSlug(params.get("genre") ?? ""),
  );
  if (!genre) return null;

  // `provider` meant two things in the old URLs: a platform slug
  // (`?provider=netflix`), which is a landing path now, and the filter bar's
  // own value (`?provider=8`, `?provider=mine`), which is still a filter and
  // has to survive the move. Anything that is neither is dropped.
  const rest = new URLSearchParams(params);
  const platform = findStreamingPlatform(rest.get("provider") ?? "");
  const providerFilter = platform
    ? ""
    : sanitizeWatchProvidersFilter(rest.get("provider"));
  if (providerFilter) rest.set("provider", providerFilter);
  else rest.delete("provider");

  // `genreHref` drops `genre` from the rest itself.
  return genreHref(mediaType, genreSlug(genre), {
    provider: platform?.slug,
    filterQuery: rest.toString(),
  });
}

/** Where an old mood URL lives now, or `null` for a mood that does not exist. */
export function legacyMoodQueryTarget(params: URLSearchParams): string | null {
  const mood = findMood(params.get("id") ?? "");
  if (!mood) return null;

  const page = parseInt(params.get("page") ?? "1", 10);
  return moodHref(mood.slug, Number.isFinite(page) ? page : undefined);
}

export function LegacyGenreQueryRedirect({ mediaType }: { mediaType: MediaType }) {
  return (
    <Suspense fallback={<RedirectPending />}>
      <QueryRedirect
        target={(params) => legacyGenreQueryTarget(mediaType, params)}
        notFound={
          <NotFoundNotice
            title="Genre not found"
            description="That genre does not exist, or the link is incomplete."
            backHref="/genres"
            backLabel="Browse genres"
          />
        }
      />
    </Suspense>
  );
}

export function LegacyMoodQueryRedirect() {
  return (
    <Suspense fallback={<RedirectPending />}>
      <QueryRedirect
        target={legacyMoodQueryTarget}
        notFound={
          <NotFoundNotice
            title="Mood not found"
            description="That is not one of the moods on offer. Pick another kind of evening."
            backHref="/moods"
            backLabel="All moods"
          />
        }
      />
    </Suspense>
  );
}

function QueryRedirect({
  target,
  notFound,
}: {
  target: (params: URLSearchParams) => string | null;
  notFound: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const href = target(new URLSearchParams(searchParams.toString()));

  // Replace, so Back skips the old address instead of bouncing off it.
  useEffect(() => {
    if (href) router.replace(href);
  }, [href, router]);

  return href ? <RedirectPending /> : notFound;
}

function RedirectPending() {
  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <LoadingSection count={18} />
      </div>
    </div>
  );
}
