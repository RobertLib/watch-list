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
 * Anyone's page, by `?id=` – a static export has no route per person. The
 * best-known people have a prerendered path of their own (`person/[slug]`).
 */
export default function Page() {
  return <PersonContent />;
}
