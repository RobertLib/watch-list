import type { Metadata } from "next";
import { MatchContent } from "@/components/MatchContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "What Should We Watch?",
  description:
    "Compare two watchlists and see what you both already want to watch.",
  noindex: true,
});

/**
 * Two watchlists, compared.
 *
 * With no parameters this is the form that asks for a link; with `?mine=` and
 * `?theirs=` it is the comparison. Nothing is stored either way – both lists
 * arrive in the URL, and the overlap is computed from them.
 */
export default function Page() {
  return <MatchContent />;
}
