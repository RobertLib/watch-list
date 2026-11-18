import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";

/**
 * Declared here rather than inherited, for the robots directive.
 *
 * Next emits its own `<meta name="robots" content="noindex">` for this page –
 * unconditionally, from the renderer rather than from metadata, so nothing
 * declared here can replace or suppress it. Without an entry of its own the
 * page also inherited the root layout's `index, follow`, and the document
 * carried the two side by side: contradictory markup, even though the
 * restrictive one wins. Setting `noindex, follow` explicitly does not collapse
 * the pair – the built one is still there and this one lands next to it – but
 * it does make the two agree, which is the most the metadata API allows. It
 * also gives a 404 a title of its own instead of the home page's.
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Your watchlist is unaffected.",
  robots: { index: false, follow: true },
};

/** A `notFound()` inside the English tree. */
export default function NotFound() {
  return <NotFoundContent />;
}
