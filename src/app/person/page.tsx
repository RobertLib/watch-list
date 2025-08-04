import type { Metadata } from "next";
import { PersonContent } from "@/components/PersonContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Person",
  description:
    "Filmography, biography and the best-known work of an actor, director or writer.",
  noindex: true,
});

/**
 * One person's page. Addressed by `?id=`, like every other title in the
 * catalogue, for the same reason: a static export has no route per person.
 */
export default function Page() {
  return <PersonContent />;
}
