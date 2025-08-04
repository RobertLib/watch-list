import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Whether a failed load means "TMDB has no such thing" rather than "TMDB did
 * not answer".
 *
 * The transport throws one shape for every bad status – `TMDB API error: 404
 * Not Found (url)` – and the detail pages used to treat every rejection as a
 * miss. A 429 from a shared read token, a 500, a timeout: each was reported to
 * the visitor as "this film does not exist", with no way to try again. Only a
 * genuine 404 is a miss; everything else is a `LoadFailureNotice` with a retry.
 *
 * Lives beside the notice because this is the one question that decides
 * whether to render it.
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && /^TMDB API error: 404\b/.test(error.message);
}

/**
 * "We looked, and it is not there", rendered inside a page that did load.
 *
 * Distinct from `app/not-found.tsx`, which answers a URL matching no route at
 * all. Every detail page now discovers its miss in the browser, after the route
 * itself has been served – a film id that TMDB does not know is a state of this
 * page, not a different page.
 */
export function NotFoundNotice({
  title,
  description,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="container mx-auto px-6 py-24 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
        <Compass className="w-10 h-10 text-gray-500" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold mb-3">{title}</h1>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
        {description}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={backHref}
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          {backLabel}
        </Link>
        <Link
          href="/search"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
        >
          Search WatchList
        </Link>
      </div>
    </div>
  );
}
