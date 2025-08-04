import type { Metadata } from "next";
import { SharedListContent } from "@/components/SharedListContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "A Shared Watchlist",
  description:
    "A watchlist somebody shared with you. Save it as your own, or compare it against yours.",
  noindex: true,
});

/**
 * Somebody else's list, carried entirely by the link.
 *
 * The ids are in `?items=` and the name in `?t=` – nothing about the list is
 * stored anywhere, which is what lets one exist without an account.
 */
export default function Page() {
  return <SharedListContent />;
}
